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
import com.khayaal.app.data.api.CommandDto
import com.khayaal.app.data.crypto.PairingCipher
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
    }

    private val json = Json { ignoreUnknownKeys = true }
    private val cipher by lazy { PairingCipher(context) }

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
