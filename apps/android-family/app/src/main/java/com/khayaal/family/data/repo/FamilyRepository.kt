package com.khayaal.family.data.repo

import com.khayaal.family.data.api.ApiClient
import com.khayaal.family.data.api.CommandCreateRequest
import com.khayaal.family.data.api.DeviceCredentials
import com.khayaal.family.data.api.DeviceTokenRequest
import com.khayaal.family.data.api.FamilyBundleDto
import com.khayaal.family.data.api.PairRequest
import com.khayaal.family.data.api.SosResolveRequest
import com.khayaal.family.data.api.SourceCreateRequest
import com.khayaal.family.data.datastore.FamilyStore
import com.khayaal.family.data.datastore.PairingInfo
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import retrofit2.HttpException

/**
 * The single gateway between this phone and the Khayaal backend: pair in with
 * the household's code, poll the tick bundle (the same one the web dashboard
 * polls), stand an SOS down, speak into her phone.
 */
class FamilyRepository(
    private val store: FamilyStore,
    private val apiClient: ApiClient,
) {
    val pairing: Flow<PairingInfo?> = store.pairing

    /**
     * Joins the household with the 6-digit code and registers this phone as a
     * `phone`-type source — the same flow the elder app and the web pairing
     * screen use. The member's name labels the source ("Aditya · family") and
     * signs every stand-down.
     */
    suspend fun pairWithCode(code: String, memberName: String): Result<PairingInfo> = runCatching {
        val baseUrl = store.currentBaseUrl()
        val api = apiClient.api(baseUrl)
        val household = api.pair(PairRequest(action = "join", code = code)).household
            ?: error("Pairing response had no household")

        val label = buildString {
            append(memberName.ifBlank { "Family" })
            append(" · family")
        }
        val source = api.createSource(
            household.id,
            SourceCreateRequest(type = "phone", label = label, pairingCode = code),
        )
        val apiKey = requireNotNull(source.apiKey) { "Source response had no API key" }

        val info = PairingInfo(
            baseUrl = baseUrl,
            householdId = household.id,
            sourceId = source.id,
            apiKey = apiKey,
            parentName = household.parentName,
        )
        store.savePairing(info)
        store.setMemberName(memberName.trim())
        apiClient.deviceCredentials = DeviceCredentials(info.householdId, info.sourceId, info.apiKey)
        store.currentFcmToken()?.let { token ->
            runCatching { apiClient.api(info.baseUrl).registerDevice(info.householdId, DeviceTokenRequest(token)) }
        }
        info
    }

    suspend fun unpair() {
        val pairing = store.current()
        val token = store.currentFcmToken()
        if (pairing != null && token != null) {
            runCatching {
                apiClient.api(pairing.baseUrl).unregisterDevice(pairing.householdId, DeviceTokenRequest(token))
            }
        }
        apiClient.deviceCredentials = null
        store.clearPairing()
    }

    suspend fun setBaseUrl(rawUrl: String) {
        val normalized = ApiClient.normalizeBaseUrl(rawUrl) // validates eagerly
        store.setBaseUrl(normalized)
    }

    /** The tick bundle — the family app polls it every ~2 s, like the web. */
    suspend fun fetchState(): Result<FamilyBundleDto> = runCatching {
        val pairing = requireNotNull(store.current()) { "Not paired yet" }
        apiClient.api(pairing.baseUrl).state(pairing.householdId)
    }

    /** Stands the SOS down under this member's name. */
    suspend fun resolveSos(by: String): Result<Unit> = runCatching {
        val pairing = requireNotNull(store.current()) { "Not paired yet" }
        apiClient.api(pairing.baseUrl).resolveSos(pairing.householdId, SosResolveRequest(by = by))
        Unit
    }

    /**
     * Composes a message / reminder / voice note for her phone. NOTE: on the
     * current backend POST /commands requires a family *session* (the web's
     * cookie); a paired phone's credential may answer 404 until the server
     * accepts source credentials there. The caller surfaces that honestly.
     */
    suspend fun sendCommand(type: String, text: String, lang: String?): Result<Unit> = runCatching {
        val pairing = requireNotNull(store.current()) { "Not paired yet" }
        apiClient.api(pairing.baseUrl).sendCommand(
            pairing.householdId,
            CommandCreateRequest(type = type, text = text, lang = lang),
        )
        Unit
    }

    suspend fun registerDeviceToken(token: String): Result<Unit> = runCatching {
        val pairing = requireNotNull(store.current()) { "Not paired yet" }
        apiClient.api(pairing.baseUrl).registerDevice(pairing.householdId, DeviceTokenRequest(token))
        Unit
    }

    /** True when the server refused with "not allowed here" (401/403/404). */
    fun isAuthOrMissing(t: Throwable?): Boolean = t is HttpException && t.code() in intArrayOf(401, 403, 404)
}

private suspend fun FamilyStore.currentBaseUrl(): String = baseUrlFlow.first()
