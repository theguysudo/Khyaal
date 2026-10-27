package com.khayaal.app.data.repo

import com.khayaal.app.data.api.ApiClient
import com.khayaal.app.data.api.IngestRequest
import com.khayaal.app.data.api.PairRequest
import com.khayaal.app.data.api.SnoozeRequest
import com.khayaal.app.data.api.SourceCreateRequest
import com.khayaal.app.data.api.StateBundleDto
import com.khayaal.app.data.datastore.PairingInfo
import com.khayaal.app.data.datastore.PairingStore
import com.khayaal.app.data.queue.SignalQueue
import com.khayaal.app.signals.SignalEvent
import kotlinx.coroutines.flow.Flow
import retrofit2.HttpException
import java.io.IOException

/**
 * The single gateway between the phone and the Khayaal backend. The app never
 * computes wellbeing — it pairs, posts raw signals, and reads back state.
 */
class KhayaalRepository(
    private val store: PairingStore,
    private val apiClient: ApiClient,
    private val queue: SignalQueue,
) {
    val pairing: Flow<PairingInfo?> = store.pairing
    val lastIngestError: Flow<String?> = store.lastIngestErrorFlow

    // -- Pairing ---------------------------------------------------------------

    /**
     * Joins a household with the 6-digit code, then registers this phone as a
     * "phone" source and receives its API key. Both are stored atomically —
     * if source creation fails, nothing is kept, so pairing can be retried.
     */
    suspend fun pairWithCode(code: String): Result<PairingInfo> = runCatching {
        val baseUrl = store.currentBaseUrl()
        val api = apiClient.api(baseUrl)
        val household = api.pair(PairRequest(action = "join", code = code)).household
            ?: error("Pairing response had no household")

        val label = if (household.parentName.isNotBlank()) {
            "${household.parentName}'s phone"
        } else {
            "Her phone"
        }
        val source = api.createSource(household.id, SourceCreateRequest(type = "phone", label = label))
        val apiKey = requireNotNull(source.apiKey) { "Source response had no API key" }

        val info = PairingInfo(
            baseUrl = baseUrl,
            householdId = household.id,
            sourceId = source.id,
            apiKey = apiKey,
            parentName = household.parentName,
            homeSsid = store.currentHomeSsid(),
        )
        store.savePairing(info)
        store.setLastIngestError(null)
        info
    }

    suspend fun unpair() {
        queue.clear()
        store.clearPairing()
    }

    // -- Settings ----------------------------------------------------------------

    suspend fun setBaseUrl(rawUrl: String) {
        val normalized = ApiClient.normalizeBaseUrl(rawUrl) // validates eagerly
        store.setBaseUrl(normalized)
    }

    suspend fun setHomeSsid(ssid: String?) = store.setHomeSsid(ssid)

    // -- Signals -----------------------------------------------------------------

    suspend fun enqueueSignal(event: SignalEvent) {
        queue.enqueue(event)
    }

    /**
     * Drains the queue into /api/v1/ingest, one request per signal (the API is
     * single-signal by design so a stream can come from any device). Timestamps
     * are shifted by the demo time offset so signals land on the backend's clock.
     */
    suspend fun flushQueue(): FlushOutcome {
        val pairing = store.current() ?: return FlushOutcome.NothingToDo
        val events = queue.snapshot()
        if (events.isEmpty()) return FlushOutcome.NothingToDo

        val offsetMs = store.currentTimeOffsetMs()
        val api = apiClient.api(pairing.baseUrl)
        val posted = mutableListOf<SignalEvent>()
        val dropped = mutableListOf<SignalEvent>()
        var outcome: FlushOutcome = FlushOutcome.Uploaded

        for (event in events) {
            try {
                api.ingest(
                    IngestRequest(
                        householdId = pairing.householdId,
                        sourceId = pairing.sourceId,
                        type = event.type,
                        value = event.value,
                        ts = event.ts + offsetMs,
                        apiKey = pairing.apiKey,
                    ),
                )
                posted += event
                store.setLastIngestError(null)
            } catch (http: HttpException) {
                when (http.code()) {
                    // Wrong key or unknown source: keeping the queue would loop forever.
                    401, 403 -> {
                        queue.clear()
                        store.setLastIngestError("Signals were rejected (HTTP ${http.code()})")
                        return FlushOutcome.Rejected
                    }
                    // Malformed signal — drop just this one, keep the rest.
                    in 400..422 -> dropped += event
                    else -> {
                        // 5xx: server trouble; retry the remainder later.
                        outcome = FlushOutcome.RetryLater
                        break
                    }
                }
            } catch (io: IOException) {
                outcome = FlushOutcome.RetryLater
                break
            }
        }
        queue.removeAll(posted + dropped)
        return outcome
    }

    // -- State -------------------------------------------------------------------

    /** Polls the tick bundle; also re-syncs the demo time offset when present. */
    suspend fun fetchState(): Result<StateBundleDto> = runCatching {
        val pairing = requireNotNull(store.current()) { "Not paired yet" }
        val bundle = apiClient.api(pairing.baseUrl).state(pairing.householdId)
        val simNow = bundle.simNowTs
        val realNow = bundle.realNowTs
        if (simNow != null && realNow != null) {
            store.setTimeOffsetMs(simNow - realNow)
        }
        bundle
    }

    /** The one-tap "I'm OK". Returns the fresh bundle so the UI can update at once. */
    suspend fun checkIn(): Result<StateBundleDto> = runCatching {
        val pairing = requireNotNull(store.current()) { "Not paired yet" }
        queue.enqueue(SignalEvent.manualCheckIn())
        apiClient.api(pairing.baseUrl).checkIn(pairing.householdId)
    }

    suspend fun snooze(minutes: Long): Result<StateBundleDto> = runCatching {
        val pairing = requireNotNull(store.current()) { "Not paired yet" }
        apiClient.api(pairing.baseUrl).snooze(pairing.householdId, SnoozeRequest(minutes.coerceIn(1, 720)))
    }
}

/** What a queue flush achieved; workers map this onto WorkManager results. */
sealed interface FlushOutcome {
    data object Uploaded : FlushOutcome
    data object NothingToDo : FlushOutcome
    data object RetryLater : FlushOutcome

    /** 401/403 — the stored key was rejected; the queue was cleared. */
    data object Rejected : FlushOutcome
}
