package com.khayaal.app.data.datastore

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.khayaal.app.BuildConfig
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import com.khayaal.app.signals.SignalEvent

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "khayaal_prefs")

/**
 * Everything the phone remembers about itself: the pairing (household, source
 * key), the configurable server address, the home Wi-Fi name, and small bits
 * of worker bookkeeping. One DataStore, clearly grouped.
 */
class PairingStore(private val context: Context) {

    private object Keys {
        val BASE_URL = stringPreferencesKey("base_url")
        val HOUSEHOLD_ID = stringPreferencesKey("household_id")
        val SOURCE_ID = stringPreferencesKey("source_id")
        val API_KEY = stringPreferencesKey("api_key")
        val PARENT_NAME = stringPreferencesKey("parent_name")
        val HOME_SSID = stringPreferencesKey("home_ssid")
        val TIME_OFFSET_MS = longPreferencesKey("time_offset_ms")
        val SIGNAL_QUEUE = stringPreferencesKey("signal_queue")
        val LAST_NOTIFIED_TIER = intPreferencesKey("last_notified_tier")
        val LAST_APP_USAGE_POLL_TS = longPreferencesKey("last_app_usage_poll_ts")
        val LAST_CHARGING_STATE = booleanPreferencesKey("last_charging_state")
        val WIFI_PRESENT_HOME = booleanPreferencesKey("wifi_present_home")
        val LAST_INGEST_ERROR = stringPreferencesKey("last_ingest_error")
    }

    private val json = Json { ignoreUnknownKeys = true }

    // -- Pairing -------------------------------------------------------------

    /** Null until the phone has been paired. */
    val pairing: Flow<PairingInfo?> = context.dataStore.data.map { prefs ->
        val householdId = prefs[Keys.HOUSEHOLD_ID] ?: return@map null
        val sourceId = prefs[Keys.SOURCE_ID] ?: return@map null
        val apiKey = prefs[Keys.API_KEY] ?: return@map null
        PairingInfo(
            baseUrl = prefs[Keys.BASE_URL] ?: BuildConfig.DEFAULT_BASE_URL,
            householdId = householdId,
            sourceId = sourceId,
            apiKey = apiKey,
            parentName = prefs[Keys.PARENT_NAME].orEmpty(),
            homeSsid = prefs[Keys.HOME_SSID],
        )
    }

    suspend fun current(): PairingInfo? = pairing.first()

    suspend fun savePairing(info: PairingInfo) {
        context.dataStore.edit { prefs ->
            prefs[Keys.BASE_URL] = info.baseUrl
            prefs[Keys.HOUSEHOLD_ID] = info.householdId
            prefs[Keys.SOURCE_ID] = info.sourceId
            prefs[Keys.API_KEY] = info.apiKey
            prefs[Keys.PARENT_NAME] = info.parentName
            if (info.homeSsid != null) prefs[Keys.HOME_SSID] = info.homeSsid
        }
    }

    /** Forgets the household, the key and the queue. The base URL survives. */
    suspend fun clearPairing() {
        context.dataStore.edit { prefs ->
            prefs.remove(Keys.HOUSEHOLD_ID)
            prefs.remove(Keys.SOURCE_ID)
            prefs.remove(Keys.API_KEY)
            prefs.remove(Keys.PARENT_NAME)
            prefs.remove(Keys.HOME_SSID)
            prefs.remove(Keys.SIGNAL_QUEUE)
            prefs.remove(Keys.LAST_NOTIFIED_TIER)
            prefs.remove(Keys.LAST_INGEST_ERROR)
            prefs.remove(Keys.WIFI_PRESENT_HOME)
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
