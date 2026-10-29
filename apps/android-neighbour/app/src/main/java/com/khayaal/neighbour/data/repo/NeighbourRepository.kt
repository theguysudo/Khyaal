package com.khayaal.neighbour.data.repo

import com.khayaal.neighbour.data.api.ApiClient
import com.khayaal.neighbour.data.api.CircleAddRequest
import com.khayaal.neighbour.data.api.DeviceCredentials
import com.khayaal.neighbour.data.api.DeviceTokenRequest
import com.khayaal.neighbour.data.api.NeighbourBundleDto
import com.khayaal.neighbour.data.api.PairRequest
import com.khayaal.neighbour.data.api.SosRespondRequest
import com.khayaal.neighbour.data.api.SourceCreateRequest
import com.khayaal.neighbour.data.datastore.NeighbourStore
import com.khayaal.neighbour.data.datastore.PairingInfo
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import retrofit2.HttpException

/**
 * The single gateway between this phone and the Khayaal backend: join a
 * household as a neighbour with its pairing code, watch the household's
 * status, and say "I'm responding" when an SOS is live.
 */
class NeighbourRepository(
    private val store: NeighbourStore,
    private val apiClient: ApiClient,
) {
    val pairing: Flow<PairingInfo?> = store.pairing

    data class PairOutcome(
        val info: PairingInfo,
        /** True when the server accepted the care-circle request. */
        val circleJoined: Boolean,
    )

    /**
     * Joins the household with the 6-digit code and registers this phone as a
     * `phone`-type source — the same pairing flow every Khayaal device uses.
     * Then, best-effort, asks the server to list this neighbour in the care
     * circle with role `neighbor` (the existing circle endpoint's role value).
     * If the server doesn't accept it yet, pairing still succeeds — the alarm
     * works on this phone regardless — and [PairOutcome.circleJoined] says so.
     */
    suspend fun pairWithCode(code: String, memberName: String, email: String?): Result<PairOutcome> =
        runCatching {
            val baseUrl = store.currentBaseUrl()
            val api = apiClient.api(baseUrl)
            val household = api.pair(PairRequest(action = "join", code = code)).household
                ?: error("Pairing response had no household")

            val label = buildString {
                append(memberName.ifBlank { "Neighbour" })
                append(" · neighbour")
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

            var circleJoined = false
            val trimmedEmail = email?.trim().orEmpty()
            if (trimmedEmail.isNotBlank()) {
                circleJoined = runCatching {
                    api.addToCircle(
                        household.id,
                        CircleAddRequest(name = memberName.trim().ifBlank { "Neighbour" }, email = trimmedEmail),
                    )
                }.isSuccess
            }
            PairOutcome(info, circleJoined)
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

    /** The household's tick — the neighbour reads only tier + SOS off it. */
    suspend fun fetchState(): Result<NeighbourBundleDto> = runCatching {
        val pairing = requireNotNull(store.current()) { "Not paired yet" }
        apiClient.api(pairing.baseUrl).state(pairing.householdId)
    }

    /** "I'm responding" — filed under the neighbour's name with an ETA. */
    suspend fun respondSos(by: String, etaMin: Long?): Result<Unit> = runCatching {
        val pairing = requireNotNull(store.current()) { "Not paired yet" }
        apiClient.api(pairing.baseUrl).respondSos(
            pairing.householdId,
            SosRespondRequest(by = by, etaMin = etaMin?.coerceIn(1, 240)),
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

private suspend fun NeighbourStore.currentBaseUrl(): String = baseUrlFlow.first()
