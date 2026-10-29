package com.khayaal.family.data.datastore

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.khayaal.family.BuildConfig
import com.khayaal.family.data.crypto.PairingCipher
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

private val Context.familyDataStore: DataStore<Preferences> by preferencesDataStore(name = "khayaal_family_prefs")

/**
 * Everything this phone remembers: the pairing (household, source, API key —
 * AES-256-GCM sealed with an AndroidKeyStore key, exactly like the elder
 * app), the family member's display name, and the server address.
 */
class FamilyStore(private val context: Context) {

    private object Keys {
        val BASE_URL = stringPreferencesKey("base_url")
        val PAIRING_ENCRYPTED = stringPreferencesKey("pairing_encrypted")
        val MEMBER_NAME = stringPreferencesKey("member_name")
        val FCM_TOKEN = stringPreferencesKey("fcm_token")
    }

    private val json = Json { ignoreUnknownKeys = true }
    private val cipher by lazy { PairingCipher(context) }

    @Serializable
    private data class PairingRecord(
        val householdId: String,
        val sourceId: String,
        val apiKey: String,
        val parentName: String,
    )

    /** Null until this phone has been paired. */
    val pairing: Flow<PairingInfo?> = context.familyDataStore.data.map { prefs ->
        val blob = prefs[Keys.PAIRING_ENCRYPTED] ?: return@map null
        val plain = cipher.decrypt(blob) ?: return@map null // keystore lost → pair again
        val record = runCatching { json.decodeFromString(PairingRecord.serializer(), plain) }.getOrNull()
            ?: return@map null
        PairingInfo(
            baseUrl = prefs[Keys.BASE_URL] ?: BuildConfig.DEFAULT_BASE_URL,
            householdId = record.householdId,
            sourceId = record.sourceId,
            apiKey = record.apiKey,
            parentName = record.parentName,
        )
    }

    suspend fun current(): PairingInfo? = pairing.first()

    suspend fun savePairing(info: PairingInfo) {
        val record = PairingRecord(
            householdId = info.householdId,
            sourceId = info.sourceId,
            apiKey = info.apiKey,
            parentName = info.parentName,
        )
        val blob = cipher.encrypt(json.encodeToString(PairingRecord.serializer(), record))
        context.familyDataStore.edit { prefs ->
            prefs[Keys.PAIRING_ENCRYPTED] = blob
            prefs[Keys.BASE_URL] = info.baseUrl
        }
    }

    suspend fun clearPairing() {
        context.familyDataStore.edit { prefs ->
            prefs.remove(Keys.PAIRING_ENCRYPTED)
            prefs.remove(Keys.FCM_TOKEN)
        }
    }

    // -- Server address ---------------------------------------------------------

    val baseUrlFlow: Flow<String> = context.familyDataStore.data.map { prefs ->
        prefs[Keys.BASE_URL] ?: BuildConfig.DEFAULT_BASE_URL
    }

    suspend fun setBaseUrl(url: String) {
        context.familyDataStore.edit { it[Keys.BASE_URL] = url }
    }

    // -- The family member's name ("by" on every stand-down) ----------------------

    val memberNameFlow: Flow<String> = context.familyDataStore.data.map { prefs ->
        prefs[Keys.MEMBER_NAME].orEmpty()
    }

    suspend fun currentMemberName(): String = memberNameFlow.first()

    suspend fun setMemberName(name: String) {
        context.familyDataStore.edit { prefs ->
            if (name.isBlank()) prefs.remove(Keys.MEMBER_NAME) else prefs[Keys.MEMBER_NAME] = name
        }
    }

    // -- FCM device token ----------------------------------------------------------

    val fcmTokenFlow: Flow<String?> = context.familyDataStore.data.map { it[Keys.FCM_TOKEN] }

    suspend fun currentFcmToken(): String? = fcmTokenFlow.first()

    suspend fun setFcmToken(token: String?) {
        context.familyDataStore.edit { prefs ->
            if (token.isNullOrBlank()) prefs.remove(Keys.FCM_TOKEN) else prefs[Keys.FCM_TOKEN] = token
        }
    }
}

/** This phone's identity inside the household. */
data class PairingInfo(
    val baseUrl: String,
    val householdId: String,
    val sourceId: String,
    val apiKey: String,
    val parentName: String,
)
