package com.khayaal.app.data.repo

import com.khayaal.app.data.api.ApiClient
import com.khayaal.app.data.api.AssistantMessageDto
import com.khayaal.app.data.api.AssistantRequest
import com.khayaal.app.data.api.CommandAckRequest
import com.khayaal.app.data.api.DeviceCredentials
import com.khayaal.app.data.api.DeviceTokenRequest
import com.khayaal.app.data.api.IngestRequest
import com.khayaal.app.data.api.PairRequest
import com.khayaal.app.data.api.SnoozeRequest
import com.khayaal.app.data.api.SourceCreateRequest
import com.khayaal.app.data.api.StateBundleDto
import com.khayaal.app.data.api.TalkbackAnswerBody
import com.khayaal.app.data.api.TalkbackAudio
import com.khayaal.app.data.api.TalkbackChunkBody
import com.khayaal.app.data.api.TalkbackChunksResponse
import com.khayaal.app.data.api.TalkbackEndBody
import com.khayaal.app.data.api.TalkbackOkResponse
import com.khayaal.app.data.api.TalkbackRequestBody
import com.khayaal.app.data.api.TalkbackSessionResponse
import com.khayaal.app.data.datastore.CallChainState
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
        // Source creation mints our API key — the pairing code we just used is
        // the credential; the server rotates it after this call.
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
            homeSsid = store.currentHomeSsid(),
        )
        store.savePairing(info)
        apiClient.deviceCredentials = DeviceCredentials(
            householdId = info.householdId,
            sourceId = info.sourceId,
            apiKey = info.apiKey,
        )
        store.setLastIngestError(null)
        // If this phone already holds an FCM token, register it with the new
        // household right away (idempotent — the token lives in DataStore).
        store.currentFcmToken()?.let { token ->
            runCatching { apiClient.api(info.baseUrl).registerDevice(info.householdId, DeviceTokenRequest(token)) }
        }
        info
    }

    suspend fun unpair() {
        // Best-effort token unregister — the household may already be gone.
        val pairing = store.current()
        val token = store.currentFcmToken()
        if (pairing != null && token != null) {
            runCatching {
                apiClient.api(pairing.baseUrl).unregisterDevice(pairing.householdId, DeviceTokenRequest(token))
            }
        }
        queue.clear()
        apiClient.deviceCredentials = null
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
                        meta = event.meta.takeIf { it.isNotEmpty() },
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

    /** Polls the tick bundle; re-syncs the demo time offset, the status string
     *  (for voice) and the callOrder cache (for "call <name>" and the alarm). */
    suspend fun fetchState(): Result<StateBundleDto> = runCatching {
        val pairing = requireNotNull(store.current()) { "Not paired yet" }
        val bundle = apiClient.api(pairing.baseUrl).state(pairing.householdId)
        val simNow = bundle.simNowTs
        val realNow = bundle.realNowTs
        if (simNow != null && realNow != null) {
            store.setTimeOffsetMs(simNow - realNow)
        }
        bundle.state?.status?.takeIf { it.isNotBlank() }?.let { store.setLastStatus(it) }
        val order = bundle.household?.callPlan?.callOrder
            ?.filter { it.phone.isNotBlank() }
            ?.map { CallChainState.Entry(name = it.name, phone = it.phone) }
            .orEmpty()
        store.cacheCallOrder(order)
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

    // -- Commands channel -------------------------------------------------------

    /** Confirms one family command reached her phone. Best-effort by design. */
    suspend fun ackCommand(commandId: String): Result<Unit> = runCatching {
        val pairing = requireNotNull(store.current()) { "Not paired yet" }
        apiClient.api(pairing.baseUrl).ackCommand(pairing.householdId, CommandAckRequest(commandId))
        Unit
    }

    // -- FCM device token ---------------------------------------------------------

    /** Registers this phone's push token. Best-effort; callers wrap in runCatching. */
    suspend fun registerDeviceToken(token: String): Result<Unit> = runCatching {
        val pairing = requireNotNull(store.current()) { "Not paired yet" }
        apiClient.api(pairing.baseUrl).registerDevice(pairing.householdId, DeviceTokenRequest(token))
        Unit
    }

    // -- Ask Khayaal --------------------------------------------------------------

    /**
     * One turn of the assistant chat. The app never holds an API key — the
     * conversation goes to the backend, which proxies to the LLM and replies
     * with `{reply, provider, model}`.
     *
     * Any non-blank reply is a success. That includes the server's own
     * friendly fallback sentence, which it returns with HTTP 200 when no LLM
     * provider can be reached — the phone shows it as a normal answer rather
     * than an error.
     */
    suspend fun askAssistant(messages: List<AssistantMessageDto>): Result<AssistantReply> = runCatching {
        val pairing = requireNotNull(store.current()) { "Not paired yet" }
        val response = apiClient.api(pairing.baseUrl)
            .assistant(pairing.householdId, AssistantRequest(messages))
        val reply = response.reply?.takeIf { it.isNotBlank() }
            ?: error(response.error ?: "The assistant had no reply")
        AssistantReply(
            text = reply,
            provider = response.provider,
            model = response.model,
        )
    }

    // -- Talkback ------------------------------------------------------------------
    // The walkie-talkie. The server owns the consent rule and the "from" stamp
    // on every chunk; the phone only asks, answers and carries audio.

    /** The live session plus the server's idea of which side we are. */
    suspend fun talkbackSession(): Result<TalkbackSessionResponse> = runCatching {
        val pairing = requireNotNull(store.current()) { "Not paired yet" }
        apiClient.api(pairing.baseUrl).talkbackSession(pairing.householdId)
    }

    /** Asks the other side to talk. Nothing happens until they tap Allow. */
    suspend fun requestTalkback(direction: String): Result<TalkbackSessionResponse> = runCatching {
        val pairing = requireNotNull(store.current()) { "Not paired yet" }
        apiClient.api(pairing.baseUrl)
            .talkbackRequest(pairing.householdId, TalkbackRequestBody(direction = direction))
    }

    /** The consent answer — only the side being called may send it. */
    suspend fun answerTalkback(sessionId: String, allow: Boolean): Result<TalkbackSessionResponse> =
        runCatching {
            val pairing = requireNotNull(store.current()) { "Not paired yet" }
            apiClient.api(pairing.baseUrl)
                .talkbackAnswer(pairing.householdId, TalkbackAnswerBody(sessionId, allow))
        }

    /** Posts one ~250 ms slice of PCM16 audio. */
    suspend fun postTalkbackChunk(sessionId: String, data: String): Result<TalkbackOkResponse> =
        runCatching {
            val pairing = requireNotNull(store.current()) { "Not paired yet" }
            apiClient.api(pairing.baseUrl).talkbackChunk(
                pairing.householdId,
                TalkbackChunkBody(sessionId = sessionId, mime = TalkbackAudio.MIME, data = data),
            )
        }

    /** Long-polls for the other side's audio. */
    suspend fun fetchTalkbackChunks(sessionId: String, after: Long): Result<TalkbackChunksResponse> =
        runCatching {
            val pairing = requireNotNull(store.current()) { "Not paired yet" }
            apiClient.api(pairing.baseUrl)
                .talkbackChunks(pairing.householdId, after, sessionId)
        }

    /** Hangs up. The audio slices are dropped with the session. */
    suspend fun endTalkback(sessionId: String): Result<TalkbackOkResponse> = runCatching {
        val pairing = requireNotNull(store.current()) { "Not paired yet" }
        apiClient.api(pairing.baseUrl)
            .talkbackEnd(pairing.householdId, TalkbackEndBody(sessionId = sessionId))
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

/** One answer from "Ask Khayaal" — the text plus who answered it. */
data class AssistantReply(
    val text: String,
    val provider: String? = null,
    val model: String? = null,
)
