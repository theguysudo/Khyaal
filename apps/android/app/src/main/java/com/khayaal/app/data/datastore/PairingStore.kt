package com.khayaal.app.data.datastore

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.doublePreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.khayaal.app.BuildConfig
import com.khayaal.app.commands.CommandBook
import com.khayaal.app.commands.LocalReminder
import com.khayaal.app.data.api.CommandDto
import com.khayaal.app.data.crypto.PairingCipher
import com.khayaal.app.signals.SignalEvent
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "khayaal_prefs")

/**
 * Everything the phone remembers about itself: the pairing (household, source
 * key — encrypted at rest with AndroidKeyStore AES-256-GCM), the configurable
 * server address, the home Wi-Fi name, and small bits of worker bookkeeping.
 * One DataStore, clearly grouped.
 */
class PairingStore(private val context: Context) {

    companion object {
        /** A to-do list longer than this is clutter, not help. */
        const val MAX_CHECKLIST = 40

        /** How many self-set reminders the phone keeps. */
        const val MAX_LOCAL_REMINDERS = 30
    }

    private object Keys {
        val BASE_URL = stringPreferencesKey("base_url")

        // v0.2 legacy plaintext pairing keys — read for migration, never written.
        val HOUSEHOLD_ID = stringPreferencesKey("household_id")
        val SOURCE_ID = stringPreferencesKey("source_id")
        val API_KEY = stringPreferencesKey("api_key")
        val PARENT_NAME = stringPreferencesKey("parent_name")
        val HOME_SSID = stringPreferencesKey("home_ssid")

        // v0.3: the pairing record as one AES-GCM blob (Base64).
        val PAIRING_ENCRYPTED = stringPreferencesKey("pairing_encrypted")

        val TIME_OFFSET_MS = longPreferencesKey("time_offset_ms")
        val SIGNAL_QUEUE = stringPreferencesKey("signal_queue")
        val LAST_NOTIFIED_TIER = intPreferencesKey("last_notified_tier")
        val LAST_APP_USAGE_POLL_TS = longPreferencesKey("last_app_usage_poll_ts")
        val LAST_CHARGING_STATE = booleanPreferencesKey("last_charging_state")
        val WIFI_PRESENT_HOME = booleanPreferencesKey("wifi_present_home")
        val LAST_INGEST_ERROR = stringPreferencesKey("last_ingest_error")

        // Night watch (opt-in mic monitoring).
        val NIGHT_WATCH_ENABLED = booleanPreferencesKey("night_watch_enabled")
        val NIGHT_WATCH_ACTIVE = booleanPreferencesKey("night_watch_active")
        val NIGHT_WATCH_STARTED_AT = longPreferencesKey("night_watch_started_at")
        val LAST_SLEEP_EVENT = stringPreferencesKey("last_sleep_event")

        // Steps: day-anchored accumulation of the cumulative step counter.
        val STEPS_DAY = stringPreferencesKey("steps_day")
        val STEPS_DAY_TOTAL = longPreferencesKey("steps_day_total")
        val STEPS_LAST_CUMULATIVE = doublePreferencesKey("steps_last_cumulative")
        val STEPS_PERIODIC_TS = longPreferencesKey("steps_periodic_ts")

        // Commands channel: dedupe by id, ack bookkeeping, a small history for UI.
        val COMMAND_SEEN = stringPreferencesKey("command_seen")
        val COMMAND_ACKED = stringPreferencesKey("command_acked")
        val COMMAND_HISTORY = stringPreferencesKey("command_history")

        // FCM device token (idempotent re-registration after pairing).
        val FCM_TOKEN = stringPreferencesKey("fcm_token")

        // "Hey Khayaal" voice commands (opt-in, default off).
        val VOICE_COMMANDS_ENABLED = booleanPreferencesKey("voice_commands_enabled")
        val VOICE_ACTIVE = booleanPreferencesKey("voice_active")

        // The backend's status string, cached so voice commands can read it aloud.
        val LAST_STATUS = stringPreferencesKey("last_status")

        // The scheduled call chain: who to call and how far we got.
        val CALL_CHAIN = stringPreferencesKey("call_chain")

        // The callOrder contacts, cached on every state poll so voice commands
        // ("call Aditya") and the alarm can dial without a network round-trip.
        val CALL_ORDER_CACHE = stringPreferencesKey("call_order_cache")

        // GPS home geofence — learned on the phone, never shared. The centre
        // and the radius stay in this DataStore; only "home" / "away" ever
        // leaves the device.
        val HOME_LAT = doublePreferencesKey("home_lat")
        val HOME_LON = doublePreferencesKey("home_lon")
        val HOME_RADIUS_M = doublePreferencesKey("home_radius_m")
        val HOME_LEARN_COUNT = intPreferencesKey("home_learn_count")
        val HOME_LEARN_LAT_SUM = doublePreferencesKey("home_learn_lat_sum")
        val HOME_LEARN_LON_SUM = doublePreferencesKey("home_learn_lon_sum")
        val HOME_LEARN_SPREAD_M = doublePreferencesKey("home_learn_spread_m")

        // The last GPS fix, kept so "distance since the last fix" survives a
        // process death. Again: local only.
        val GPS_LAST_LAT = doublePreferencesKey("gps_last_lat")
        val GPS_LAST_LON = doublePreferencesKey("gps_last_lon")
        val GPS_LAST_TS = longPreferencesKey("gps_last_ts")
        val GPS_ZONE = stringPreferencesKey("gps_zone")
        val GPS_MOVING = booleanPreferencesKey("gps_moving")
        val GPS_SPEED_KMH = doublePreferencesKey("gps_speed_kmh")
        val GPS_DISTANCE_M = doublePreferencesKey("gps_distance_m")
        val GPS_ACCURACY_M = doublePreferencesKey("gps_accuracy_m")
        val GPS_DISTANCE_TOTAL_M = doublePreferencesKey("gps_distance_total_m")

        // Her own to-do list — edited on the phone, never uploaded.
        val CHECKLIST_ITEMS = stringPreferencesKey("checklist_items")

        // Reminders she sets for herself by talking to Khayaal.
        val LOCAL_REMINDERS = stringPreferencesKey("local_reminders")
    }

    private val json = Json { ignoreUnknownKeys = true }
    private val cipher by lazy { PairingCipher(context) }

    @kotlinx.serialization.Serializable
    private data class PairingRecord(
        val householdId: String,
        val sourceId: String,
        val apiKey: String,
        val parentName: String,
        val homeSsid: String?,
    )

    // -- Pairing (encrypted at rest) -------------------------------------------

    private fun decodeRecord(blob: String): PairingRecord? = runCatching {
        json.decodeFromString(PairingRecord.serializer(), blob)
    }.getOrNull()

    private fun readEncrypted(prefs: Preferences): PairingInfo? {
        val blob = prefs[Keys.PAIRING_ENCRYPTED] ?: return null
        val plain = cipher.decrypt(blob) ?: return null // keystore lost — see legacy fallback
        val record = decodeRecord(plain) ?: return null
        return record.toInfo(prefs[Keys.BASE_URL])
    }

    private fun readLegacy(prefs: Preferences): PairingInfo? {
        val householdId = prefs[Keys.HOUSEHOLD_ID] ?: return null
        val sourceId = prefs[Keys.SOURCE_ID] ?: return null
        val apiKey = prefs[Keys.API_KEY] ?: return null
        return PairingInfo(
            baseUrl = prefs[Keys.BASE_URL] ?: BuildConfig.DEFAULT_BASE_URL,
            householdId = householdId,
            sourceId = sourceId,
            apiKey = apiKey,
            parentName = prefs[Keys.PARENT_NAME].orEmpty(),
            homeSsid = prefs[Keys.HOME_SSID],
        )
    }

    private fun PairingRecord.toInfo(baseUrl: String?) = PairingInfo(
        baseUrl = baseUrl ?: BuildConfig.DEFAULT_BASE_URL,
        householdId = householdId,
        sourceId = sourceId,
        apiKey = apiKey,
        parentName = parentName,
        homeSsid = homeSsid,
    )

    private fun PairingInfo.toRecord() = PairingRecord(
        householdId = householdId,
        sourceId = sourceId,
        apiKey = apiKey,
        parentName = parentName,
        homeSsid = homeSsid,
    )

    /** Null until the phone has been paired. Prefers the encrypted record. */
    val pairing: Flow<PairingInfo?> = context.dataStore.data.map { prefs ->
        readEncrypted(prefs) ?: readLegacy(prefs)
    }

    suspend fun current(): PairingInfo? = pairing.first()

    suspend fun savePairing(info: PairingInfo) {
        val blob = cipher.encrypt(json.encodeToString(PairingRecord.serializer(), info.toRecord()))
        context.dataStore.edit { prefs ->
            prefs[Keys.PAIRING_ENCRYPTED] = blob
            // The legacy plaintext keys are superseded — wipe them.
            prefs.remove(Keys.HOUSEHOLD_ID)
            prefs.remove(Keys.SOURCE_ID)
            prefs.remove(Keys.API_KEY)
            prefs.remove(Keys.PARENT_NAME)
            if (info.homeSsid != null) prefs[Keys.HOME_SSID] = info.homeSsid else prefs.remove(Keys.HOME_SSID)
        }
    }

    /**
     * One-time lift of a v0.2 plaintext pairing into the encrypted record.
     * Called once from Application.onCreate (outside the flow — editing the
     * DataStore from inside its own collector would deadlock).
     */
    suspend fun migrateLegacyIfNeeded() {
        val prefs = context.dataStore.data.first()
        if (prefs[Keys.PAIRING_ENCRYPTED] != null) return
        val legacy = readLegacy(prefs) ?: return
        runCatching { savePairing(legacy) }
    }

    /** Forgets the household, the key and the queue. The base URL survives. */
    suspend fun clearPairing() {
        context.dataStore.edit { prefs ->
            prefs.remove(Keys.PAIRING_ENCRYPTED)
            prefs.remove(Keys.HOUSEHOLD_ID)
            prefs.remove(Keys.SOURCE_ID)
            prefs.remove(Keys.API_KEY)
            prefs.remove(Keys.PARENT_NAME)
            prefs.remove(Keys.HOME_SSID)
            prefs.remove(Keys.SIGNAL_QUEUE)
            prefs.remove(Keys.LAST_NOTIFIED_TIER)
            prefs.remove(Keys.LAST_INGEST_ERROR)
            prefs.remove(Keys.WIFI_PRESENT_HOME)
            prefs.remove(Keys.COMMAND_SEEN)
            prefs.remove(Keys.COMMAND_ACKED)
            prefs.remove(Keys.COMMAND_HISTORY)
            prefs.remove(Keys.LAST_SLEEP_EVENT)
            prefs.remove(Keys.NIGHT_WATCH_ENABLED)
            prefs.remove(Keys.NIGHT_WATCH_ACTIVE)
            prefs.remove(Keys.NIGHT_WATCH_STARTED_AT)
            prefs.remove(Keys.FCM_TOKEN)
            prefs.remove(Keys.VOICE_COMMANDS_ENABLED)
            prefs.remove(Keys.VOICE_ACTIVE)
            prefs.remove(Keys.LAST_STATUS)
            prefs.remove(Keys.CALL_CHAIN)
            prefs.remove(Keys.CALL_ORDER_CACHE)
        }
    }

    // -- Settings ------------------------------------------------------------

    val baseUrlFlow: Flow<String> = context.dataStore.data.map { prefs ->
        prefs[Keys.BASE_URL] ?: BuildConfig.DEFAULT_BASE_URL
    }

    suspend fun currentBaseUrl(): String = baseUrlFlow.first()

    suspend fun setBaseUrl(url: String) {
        context.dataStore.edit { it[Keys.BASE_URL] = url }
    }

    val homeSsidFlow: Flow<String?> = context.dataStore.data.map { it[Keys.HOME_SSID] }

    suspend fun currentHomeSsid(): String? = homeSsidFlow.first()

    suspend fun setHomeSsid(ssid: String?) {
        context.dataStore.edit { prefs ->
            if (ssid.isNullOrBlank()) prefs.remove(Keys.HOME_SSID) else prefs[Keys.HOME_SSID] = ssid
        }
    }

    // -- Demo time-warp --------------------------------------------------------
    // The demo backend can skew its clock; signals must land on the same clock.

    val timeOffsetMsFlow: Flow<Long> = context.dataStore.data.map { prefs ->
        prefs[Keys.TIME_OFFSET_MS] ?: 0L
    }

    suspend fun currentTimeOffsetMs(): Long = timeOffsetMsFlow.first()

    suspend fun setTimeOffsetMs(offsetMs: Long) {
        context.dataStore.edit { it[Keys.TIME_OFFSET_MS] = offsetMs }
    }

    // -- Signal queue persistence ---------------------------------------------

    suspend fun loadQueue(): List<SignalEvent> {
        val raw = context.dataStore.data.first()[Keys.SIGNAL_QUEUE] ?: return emptyList()
        return runCatching {
            json.decodeFromString(ListSerializer(SignalEvent.serializer()), raw)
        }.getOrDefault(emptyList())
    }

    suspend fun saveQueue(events: List<SignalEvent>) {
        val raw = json.encodeToString(ListSerializer(SignalEvent.serializer()), events)
        context.dataStore.edit { it[Keys.SIGNAL_QUEUE] = raw }
    }

    // -- Worker bookkeeping ----------------------------------------------------

    val lastNotifiedTierFlow: Flow<Int> = context.dataStore.data.map { prefs ->
        prefs[Keys.LAST_NOTIFIED_TIER] ?: 0
    }

    suspend fun currentLastNotifiedTier(): Int = lastNotifiedTierFlow.first()

    suspend fun setLastNotifiedTier(tier: Int) {
        context.dataStore.edit { it[Keys.LAST_NOTIFIED_TIER] = tier }
    }

    suspend fun currentLastAppUsagePollTs(): Long =
        context.dataStore.data.first()[Keys.LAST_APP_USAGE_POLL_TS] ?: 0L

    suspend fun setLastAppUsagePollTs(ts: Long) {
        context.dataStore.edit { it[Keys.LAST_APP_USAGE_POLL_TS] = ts }
    }

    suspend fun currentLastChargingState(): Boolean? =
        context.dataStore.data.first()[Keys.LAST_CHARGING_STATE]

    suspend fun setLastChargingState(connected: Boolean) {
        context.dataStore.edit { it[Keys.LAST_CHARGING_STATE] = connected }
    }

    suspend fun currentWifiPresentHome(): Boolean? =
        context.dataStore.data.first()[Keys.WIFI_PRESENT_HOME]

    suspend fun setWifiPresentHome(home: Boolean) {
        context.dataStore.edit { it[Keys.WIFI_PRESENT_HOME] = home }
    }

    val lastIngestErrorFlow: Flow<String?> = context.dataStore.data.map { it[Keys.LAST_INGEST_ERROR] }

    suspend fun setLastIngestError(message: String?) {
        context.dataStore.edit { prefs ->
            if (message == null) prefs.remove(Keys.LAST_INGEST_ERROR) else prefs[Keys.LAST_INGEST_ERROR] = message
        }
    }

    // -- Night watch ------------------------------------------------------------

    val nightWatchEnabledFlow: Flow<Boolean> = context.dataStore.data.map { prefs ->
        prefs[Keys.NIGHT_WATCH_ENABLED] ?: false
    }

    suspend fun currentNightWatchEnabled(): Boolean = nightWatchEnabledFlow.first()

    val nightWatchActiveFlow: Flow<Boolean> = context.dataStore.data.map { prefs ->
        prefs[Keys.NIGHT_WATCH_ACTIVE] ?: false
    }

    suspend fun setNightWatchEnabled(enabled: Boolean) {
        context.dataStore.edit { prefs ->
            prefs[Keys.NIGHT_WATCH_ENABLED] = enabled
            if (!enabled) prefs.remove(Keys.NIGHT_WATCH_STARTED_AT)
        }
    }

    suspend fun setNightWatchActive(active: Boolean, startedAt: Long? = null) {
        context.dataStore.edit { prefs ->
            prefs[Keys.NIGHT_WATCH_ACTIVE] = active
            if (startedAt != null) prefs[Keys.NIGHT_WATCH_STARTED_AT] = startedAt else prefs.remove(Keys.NIGHT_WATCH_STARTED_AT)
        }
    }

    suspend fun currentNightWatchStartedAt(): Long =
        context.dataStore.data.first()[Keys.NIGHT_WATCH_STARTED_AT] ?: 0L

    /** Last sleep milestone as "value|ts" — e.g. "asleep|1730000000000". */
    val lastSleepEventFlow: Flow<SleepMilestone?> = context.dataStore.data.map { prefs ->
        prefs[Keys.LAST_SLEEP_EVENT]?.let { raw ->
            val parts = raw.split('|', limit = 2)
            if (parts.size == 2) SleepMilestone(parts[0], parts[1].toLongOrNull() ?: 0L) else null
        }
    }

    suspend fun setLastSleepEvent(value: String, ts: Long) {
        context.dataStore.edit { it[Keys.LAST_SLEEP_EVENT] = "$value|$ts" }
    }

    // -- Steps -------------------------------------------------------------------

    suspend fun stepsState(): StepsState {
        val prefs = context.dataStore.data.first()
        return StepsState(
            day = prefs[Keys.STEPS_DAY],
            dayTotal = prefs[Keys.STEPS_DAY_TOTAL] ?: 0L,
            lastCumulative = prefs[Keys.STEPS_LAST_CUMULATIVE] ?: -1.0,
        )
    }

    val stepsTodayFlow: Flow<Long> = context.dataStore.data.map { prefs ->
        prefs[Keys.STEPS_DAY_TOTAL] ?: 0L
    }

    suspend fun setStepsState(day: String, dayTotal: Long, lastCumulative: Double) {
        context.dataStore.edit { prefs ->
            prefs[Keys.STEPS_DAY] = day
            prefs[Keys.STEPS_DAY_TOTAL] = dayTotal
            prefs[Keys.STEPS_LAST_CUMULATIVE] = lastCumulative
        }
    }

    suspend fun currentStepsPeriodicTs(): Long =
        context.dataStore.data.first()[Keys.STEPS_PERIODIC_TS] ?: 0L

    suspend fun setStepsPeriodicTs(ts: Long) {
        context.dataStore.edit { it[Keys.STEPS_PERIODIC_TS] = ts }
    }

    // -- Commands channel ---------------------------------------------------------

    suspend fun loadCommandBook(): CommandBook {
        val prefs = context.dataStore.data.first()
        return CommandBook(
            seenIds = decodeIds(prefs[Keys.COMMAND_SEEN]),
            ackedIds = decodeIds(prefs[Keys.COMMAND_ACKED]),
        )
    }

    suspend fun saveCommandBook(book: CommandBook) {
        context.dataStore.edit { prefs ->
            prefs[Keys.COMMAND_SEEN] = encodeIds(book.seenIds)
            prefs[Keys.COMMAND_ACKED] = encodeIds(book.ackedIds)
        }
    }

    val commandHistoryFlow: Flow<List<CommandDto>> = context.dataStore.data.map { prefs ->
        prefs[Keys.COMMAND_HISTORY]?.let { raw ->
            runCatching {
                json.decodeFromString(ListSerializer(CommandDto.serializer()), raw)
            }.getOrDefault(emptyList())
        } ?: emptyList()
    }

    /** Keeps the newest [CommandBook.HISTORY_CAP] entries, newest first. */
    suspend fun appendCommandHistory(commands: List<CommandDto>) {
        if (commands.isEmpty()) return
        context.dataStore.edit { prefs ->
            val current = prefs[Keys.COMMAND_HISTORY]?.let { raw ->
                runCatching { json.decodeFromString(ListSerializer(CommandDto.serializer()), raw) }.getOrNull()
            } ?: emptyList()
            val merged = (commands + current).distinctBy { it.id }.take(CommandBook.HISTORY_CAP)
            prefs[Keys.COMMAND_HISTORY] = json.encodeToString(ListSerializer(CommandDto.serializer()), merged)
        }
    }

    private fun decodeIds(raw: String?): Set<String> =
        raw?.let { blob ->
            runCatching { json.decodeFromString(ListSerializer(String.serializer()), blob).toSet() }.getOrNull()
        } ?: emptySet()

    private fun encodeIds(ids: Set<String>): String =
        json.encodeToString(ListSerializer(String.serializer()), ids.toList())

    // -- FCM device token ---------------------------------------------------------

    val fcmTokenFlow: Flow<String?> = context.dataStore.data.map { it[Keys.FCM_TOKEN] }

    suspend fun currentFcmToken(): String? = fcmTokenFlow.first()

    suspend fun setFcmToken(token: String?) {
        context.dataStore.edit { prefs ->
            if (token.isNullOrBlank()) prefs.remove(Keys.FCM_TOKEN) else prefs[Keys.FCM_TOKEN] = token
        }
    }

    // -- Voice commands ("Hey Khayaal") ---------------------------------------------

    val voiceCommandsEnabledFlow: Flow<Boolean> = context.dataStore.data.map { prefs ->
        prefs[Keys.VOICE_COMMANDS_ENABLED] ?: false
    }

    suspend fun currentVoiceCommandsEnabled(): Boolean = voiceCommandsEnabledFlow.first()

    suspend fun setVoiceCommandsEnabled(enabled: Boolean) {
        context.dataStore.edit { it[Keys.VOICE_COMMANDS_ENABLED] = enabled }
    }

    /** Live state, set by the service itself — the UI mirrors reality. */
    val voiceActiveFlow: Flow<Boolean> = context.dataStore.data.map { prefs ->
        prefs[Keys.VOICE_ACTIVE] ?: false
    }

    suspend fun setVoiceActive(active: Boolean) {
        context.dataStore.edit { it[Keys.VOICE_ACTIVE] = active }
    }

    // -- Cached status (read aloud by voice commands) ---------------------------------

    val lastStatusFlow: Flow<String> = context.dataStore.data.map { prefs ->
        prefs[Keys.LAST_STATUS].orEmpty()
    }

    suspend fun setLastStatus(status: String) {
        context.dataStore.edit { prefs ->
            if (status.isBlank()) prefs.remove(Keys.LAST_STATUS) else prefs[Keys.LAST_STATUS] = status
        }
    }

    // -- Call chain --------------------------------------------------------------------

    val callChainFlow: Flow<CallChainState?> = context.dataStore.data.map { prefs ->
        prefs[Keys.CALL_CHAIN]?.let { raw ->
            runCatching { json.decodeFromString(CallChainState.serializer(), raw) }.getOrNull()
        }
    }

    suspend fun currentCallChain(): CallChainState? = callChainFlow.first()

    suspend fun saveCallChain(state: CallChainState?) {
        context.dataStore.edit { prefs ->
            if (state == null) prefs.remove(Keys.CALL_CHAIN) else prefs[Keys.CALL_CHAIN] = json.encodeToString(CallChainState.serializer(), state)
        }
    }

    // -- Cached callOrder (voice commands + alarm dial targets) ------------------

    val callOrderCacheFlow: Flow<List<CallChainState.Entry>> = context.dataStore.data.map { prefs ->
        prefs[Keys.CALL_ORDER_CACHE]?.let { raw ->
            runCatching {
                json.decodeFromString(ListSerializer(CallChainState.Entry.serializer()), raw)
            }.getOrDefault(emptyList())
        } ?: emptyList()
    }

    suspend fun cacheCallOrder(entries: List<CallChainState.Entry>) {
        context.dataStore.edit { prefs ->
            if (entries.isEmpty()) {
                prefs.remove(Keys.CALL_ORDER_CACHE)
            } else {
                prefs[Keys.CALL_ORDER_CACHE] =
                    json.encodeToString(ListSerializer(CallChainState.Entry.serializer()), entries.take(10))
            }
        }
    }

    suspend fun currentCallOrder(): List<CallChainState.Entry> = callOrderCacheFlow.first()

    // -- GPS: the learned home geofence and the last movement summary ----------
    // Everything in this section stays on the phone. The server only ever sees
    // the words "home" / "away" and a handful of movement numbers.

    /** The learned geofence, or null while the phone is still learning it. */
    val homeGeofenceFlow: Flow<HomeGeofence?> = context.dataStore.data.map { prefs ->
        val lat = prefs[Keys.HOME_LAT]
        val lon = prefs[Keys.HOME_LON]
        val radius = prefs[Keys.HOME_RADIUS_M]
        if (lat == null || lon == null || radius == null) null
        else HomeGeofence(centerLat = lat, centerLon = lon, radiusM = radius)
    }

    suspend fun currentHomeGeofence(): HomeGeofence? = homeGeofenceFlow.first()

    suspend fun setHomeGeofence(geofence: HomeGeofence) {
        context.dataStore.edit { prefs ->
            prefs[Keys.HOME_LAT] = geofence.centerLat
            prefs[Keys.HOME_LON] = geofence.centerLon
            prefs[Keys.HOME_RADIUS_M] = geofence.radiusM
        }
    }

    /** The running totals used while the geofence is still being learned. */
    suspend fun homeLearningState(): HomeLearningState {
        val prefs = context.dataStore.data.first()
        return HomeLearningState(
            samples = prefs[Keys.HOME_LEARN_COUNT] ?: 0,
            latSum = prefs[Keys.HOME_LEARN_LAT_SUM] ?: 0.0,
            lonSum = prefs[Keys.HOME_LEARN_LON_SUM] ?: 0.0,
            spreadM = prefs[Keys.HOME_LEARN_SPREAD_M] ?: 0.0,
        )
    }

    suspend fun setHomeLearningState(state: HomeLearningState) {
        context.dataStore.edit { prefs ->
            prefs[Keys.HOME_LEARN_COUNT] = state.samples
            prefs[Keys.HOME_LEARN_LAT_SUM] = state.latSum
            prefs[Keys.HOME_LEARN_LON_SUM] = state.lonSum
            prefs[Keys.HOME_LEARN_SPREAD_M] = state.spreadM
        }
    }

    /** The previous fix, so the next one can report the distance walked. */
    suspend fun lastGpsFix(): GpsFix? {
        val prefs = context.dataStore.data.first()
        val lat = prefs[Keys.GPS_LAST_LAT] ?: return null
        val lon = prefs[Keys.GPS_LAST_LON] ?: return null
        val ts = prefs[Keys.GPS_LAST_TS] ?: return null
        return GpsFix(lat = lat, lon = lon, ts = ts)
    }

    suspend fun setLastGpsFix(fix: GpsFix) {
        context.dataStore.edit { prefs ->
            prefs[Keys.GPS_LAST_LAT] = fix.lat
            prefs[Keys.GPS_LAST_LON] = fix.lon
            prefs[Keys.GPS_LAST_TS] = fix.ts
        }
    }

    /** The movement summary the UI shows: zone, moving, speed, accuracy. */
    val gpsStateFlow: Flow<GpsState> = context.dataStore.data.map { prefs ->
        GpsState(
            zone = prefs[Keys.GPS_ZONE],
            moving = prefs[Keys.GPS_MOVING] ?: false,
            speedKmh = prefs[Keys.GPS_SPEED_KMH] ?: 0.0,
            distanceM = prefs[Keys.GPS_DISTANCE_M] ?: 0.0,
            accuracyM = prefs[Keys.GPS_ACCURACY_M] ?: 0.0,
            totalDistanceM = prefs[Keys.GPS_DISTANCE_TOTAL_M] ?: 0.0,
            lastFixTs = prefs[Keys.GPS_LAST_TS] ?: 0L,
        )
    }

    suspend fun setGpsState(state: GpsState) {
        context.dataStore.edit { prefs ->
            if (state.zone == null) prefs.remove(Keys.GPS_ZONE) else prefs[Keys.GPS_ZONE] = state.zone
            prefs[Keys.GPS_MOVING] = state.moving
            prefs[Keys.GPS_SPEED_KMH] = state.speedKmh
            prefs[Keys.GPS_DISTANCE_M] = state.distanceM
            prefs[Keys.GPS_ACCURACY_M] = state.accuracyM
            prefs[Keys.GPS_DISTANCE_TOTAL_M] = state.totalDistanceM
        }
    }

    // -- Her to-do list ------------------------------------------------------------

    val checklistFlow: Flow<List<ChecklistItem>> = context.dataStore.data.map { prefs ->
        prefs[Keys.CHECKLIST_ITEMS]?.let { raw ->
            runCatching {
                json.decodeFromString(ListSerializer(ChecklistItem.serializer()), raw)
            }.getOrDefault(emptyList())
        } ?: emptyList()
    }

    suspend fun currentChecklist(): List<ChecklistItem> = checklistFlow.first()

    suspend fun saveChecklist(items: List<ChecklistItem>) {
        context.dataStore.edit { prefs ->
            prefs[Keys.CHECKLIST_ITEMS] =
                json.encodeToString(ListSerializer(ChecklistItem.serializer()), items.take(MAX_CHECKLIST))
        }
    }

    // -- Reminders she sets for herself ------------------------------------------

    val localRemindersFlow: Flow<List<LocalReminder>> = context.dataStore.data.map { prefs ->
        prefs[Keys.LOCAL_REMINDERS]?.let { raw ->
            runCatching {
                json.decodeFromString(ListSerializer(LocalReminder.serializer()), raw)
            }.getOrDefault(emptyList())
        } ?: emptyList()
    }

    suspend fun currentLocalReminders(): List<LocalReminder> = localRemindersFlow.first()

    /** Adds or replaces one reminder. */
    suspend fun upsertLocalReminder(reminder: LocalReminder) {
        context.dataStore.edit { prefs ->
            val current = prefs[Keys.LOCAL_REMINDERS]?.let { raw ->
                runCatching {
                    json.decodeFromString(ListSerializer(LocalReminder.serializer()), raw)
                }.getOrDefault(emptyList())
            } ?: emptyList()
            val merged = (current.filterNot { it.id == reminder.id } + reminder)
                .sortedBy { it.atMs }
                .take(MAX_LOCAL_REMINDERS)
            prefs[Keys.LOCAL_REMINDERS] =
                json.encodeToString(ListSerializer(LocalReminder.serializer()), merged)
        }
    }

    /** Marks one reminder as delivered, so it does not come back. */
    suspend fun markLocalReminderFired(id: String) {
        context.dataStore.edit { prefs ->
            val current = prefs[Keys.LOCAL_REMINDERS]?.let { raw ->
                runCatching {
                    json.decodeFromString(ListSerializer(LocalReminder.serializer()), raw)
                }.getOrDefault(emptyList())
            } ?: emptyList()
            prefs[Keys.LOCAL_REMINDERS] = json.encodeToString(
                ListSerializer(LocalReminder.serializer()),
                current.map { if (it.id == id) it.copy(fired = true) else it },
            )
        }
    }

    /** Removes one reminder. */
    suspend fun deleteLocalReminder(id: String) {
        context.dataStore.edit { prefs ->
            val current = prefs[Keys.LOCAL_REMINDERS]?.let { raw ->
                runCatching {
                    json.decodeFromString(ListSerializer(LocalReminder.serializer()), raw)
                }.getOrDefault(emptyList())
            } ?: emptyList()
            prefs[Keys.LOCAL_REMINDERS] = json.encodeToString(
                ListSerializer(LocalReminder.serializer()),
                current.filterNot { it.id == id },
            )
        }
    }
}

/** The phone's identity inside one household. */
data class PairingInfo(
    val baseUrl: String,
    val householdId: String,
    val sourceId: String,
    val apiKey: String,
    val parentName: String,
    val homeSsid: String?,
)

data class SleepMilestone(val value: String, val ts: Long)

data class StepsState(
    val day: String?,
    val dayTotal: Long,
    val lastCumulative: Double,
)

/**
 * The learned home circle. It lives only in this phone's DataStore: the
 * coordinates are used to answer "is she home?", and the answer that leaves
 * the device is the single word "home" or "away".
 */
data class HomeGeofence(
    val centerLat: Double,
    val centerLon: Double,
    val radiusM: Double,
)

/** The running totals of the geofence learning phase. */
data class HomeLearningState(
    val samples: Int = 0,
    val latSum: Double = 0.0,
    val lonSum: Double = 0.0,
    /** The widest distance seen from the running centre so far. */
    val spreadM: Double = 0.0,
)

/** One previous GPS fix — kept locally so distance can be measured. */
data class GpsFix(
    val lat: Double,
    val lon: Double,
    val ts: Long,
)

/**
 * What the Movement segment shows: a zone, whether she is moving right now,
 * how fast, how far since the previous fix and how sure the phone is. No
 * coordinates — those never existed outside [GpsFix] and the geofence.
 */
data class GpsState(
    val zone: String? = null,
    val moving: Boolean = false,
    val speedKmh: Double = 0.0,
    val distanceM: Double = 0.0,
    val accuracyM: Double = 0.0,
    val totalDistanceM: Double = 0.0,
    val lastFixTs: Long = 0L,
)

/** One line of her own to-do list. Edited on the phone, never uploaded. */
@kotlinx.serialization.Serializable
data class ChecklistItem(
    val id: String,
    val text: String,
    val done: Boolean = false,
    val createdTs: Long = 0L,
)

/**
 * The tier-3 call chain as scheduled on this phone: a snapshot of who to call
 * (in order), how far the chain has progressed, and whether she cancelled it.
 * Survives process death; the worker reads this instead of the network.
 */
@kotlinx.serialization.Serializable
data class CallChainState(
    val entries: List<Entry> = emptyList(),
    /** Index of the NEXT entry to dial. */
    val nextIndex: Int = 0,
    val cancelled: Boolean = false,
    val callElderAfterMin: Long = 0,
    val alertCircleAfterMin: Long = 0,
) {
    @kotlinx.serialization.Serializable
    data class Entry(val name: String = "", val phone: String = "")
}
