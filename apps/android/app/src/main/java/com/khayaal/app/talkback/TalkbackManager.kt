package com.khayaal.app.talkback

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.khayaal.app.data.api.TalkbackRequestBody
import com.khayaal.app.data.api.TalkbackSessionDto
import com.khayaal.app.data.repo.KhayaalRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * The walkie-talkie on the phone.
 *
 * The consent rule lives here, and it is the whole point of the feature:
 *
 *  - a request only ever *asks*; nothing is recorded until the other side
 *    has tapped Allow on their own screen;
 *  - the microphone is opened only when the session says `active` AND
 *    `consentGiven` — the server stamps both, so the phone cannot talk
 *    itself into an open mic;
 *  - the popup for an incoming request is full-screen, with two big buttons.
 *
 * The manager also owns the two audio loops: a long poll that plays the other
 * side's slices, and the hold-to-talk recorder that posts ours.
 */
class TalkbackManager(
    private val context: Context,
    private val repository: KhayaalRepository,
) {

    data class UiState(
        /** The live session, as the server sees it. */
        val session: TalkbackSessionDto? = null,
        /** Our side: "parent" for this phone. The server decides, we only read it. */
        val role: String = TalkbackSessionDto.Roles.PARENT,
        /** A request is waiting for us to allow it — show the popup. */
        val incomingPending: Boolean = false,
        /** Our microphone is open (we are holding the talk button). */
        val recording: Boolean = false,
        /** The other side is talking — her speaker is on. */
        val remoteTalking: Boolean = false,
        /** A short, plain sentence for the screen. */
        val status: String = "",
        val error: String? = null,
        /** True once the session is live and the mic may open. */
        val canTalk: Boolean = false,
    ) {
        val isActive: Boolean get() = session?.state == TalkbackSessionDto.States.ACTIVE
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val _ui = MutableStateFlow(UiState())
    val ui: StateFlow<UiState> = _ui.asStateFlow()

    private var pollJob: Job? = null
    private var receiveJob: Job? = null
    private var recordJob: Job? = null
    private val player = TalkbackPlayer()
    private var recorder: TalkbackRecorder? = null

    /** The last sequence number we have played — the poll asks for "after" it. */
    private var lastSeq = 0L

    // -- Lifecycle -----------------------------------------------------------------

    /** Starts the gentle session poll. Safe to call more than once. */
    fun start() {
        if (pollJob?.isActive == true) return
        pollJob = scope.launch {
            while (isActive) {
                pollOnce()
                delay(POLL_INTERVAL_MS)
            }
        }
    }

    fun stop() {
        pollJob?.cancel()
        pollJob = null
        receiveJob?.cancel()
        receiveJob = null
        stopCapture()
        player.stop()
    }

    /** One poll of the session endpoint — this is what finds incoming requests. */
    private suspend fun pollOnce() {
        val result = repository.talkbackSession()
        result.onSuccess { response ->
            val session = response.session
            val role = response.role ?: _ui.value.role
            val incoming = session != null &&
                session.state == TalkbackSessionDto.States.PENDING &&
                session.callee == TalkbackSessionDto.Roles.PARENT

            val previous = _ui.value.session
            _ui.update {
                it.copy(
                    session = session,
                    role = role,
                    incomingPending = incoming,
                    canTalk = session?.canSpeak == true,
                    error = null,
                )
            }

            // A session that just became live starts the playback loop.
            if (session != null && session.state == TalkbackSessionDto.States.ACTIVE) {
                if (previous?.id != session.id) {
                    lastSeq = 0L
                    startReceiveLoop(session.id)
                }
            } else {
                if (receiveJob?.isActive == true) {
                    receiveJob?.cancel()
                    receiveJob = null
                    player.stop()
                    _ui.update { it.copy(remoteTalking = false) }
                }
            }
        }.onFailure {
            // A failed poll is not worth shouting about — the next one tries again.
        }
    }

    // -- Actions ---------------------------------------------------------------------

    /** Asks the family to talk. Nothing opens until they tap Allow. */
    fun requestTalkback() {
        scope.launch {
            repository.requestTalkback(TalkbackRequestBody.Directions.TO_FAMILY)
                .onSuccess { response ->
                    val session = response.session
                    _ui.update {
                        it.copy(
                            session = session,
                            incomingPending = false,
                            status = "Waiting for them to allow it…",
                            error = null,
                        )
                    }
                    if (session != null && session.state == TalkbackSessionDto.States.ACTIVE) {
                        lastSeq = 0L
                        startReceiveLoop(session.id)
                    }
                }
                .onFailure {
                    _ui.update { state -> state.copy(error = "Couldn't reach home just now.") }
                }
        }
    }

    /** The consent decision from the full-screen popup. */
    fun answer(allow: Boolean) {
        val sessionId = _ui.value.session?.id
        if (sessionId.isNullOrBlank()) {
            _ui.update { it.copy(incomingPending = false) }
            return
        }
        scope.launch {
            repository.answerTalkback(sessionId, allow)
                .onSuccess { response ->
                    val updated = response.session
                    _ui.update {
                        it.copy(
                            session = updated,
                            incomingPending = false,
                            canTalk = updated?.canSpeak == true,
                            status = if (allow) "You allowed it. Hold the button to talk." else "You said not now.",
                        )
                    }
                    if (allow && updated?.canSpeak == true) {
                        lastSeq = 0L
                        startReceiveLoop(updated.id)
                    }
                }
                .onFailure {
                    _ui.update { state ->
                        state.copy(
                            incomingPending = false,
                            error = "Couldn't send your answer. Please try again.",
                        )
                    }
                }
        }
    }

    /** Hangs up. The audio is dropped with the session on the server. */
    fun endTalkback() {
        val sessionId = _ui.value.session?.id.orEmpty()
        scope.launch {
            runCatching { repository.endTalkback(sessionId) }
            stopCapture()
            player.stop()
            receiveJob?.cancel()
            receiveJob = null
            _ui.update {
                it.copy(
                    session = null,
                    incomingPending = false,
                    canTalk = false,
                    recording = false,
                    remoteTalking = false,
                    status = "The call ended.",
                )
            }
        }
    }

    // -- Hold to talk ------------------------------------------------------------------

    /** Opens the microphone — only ever when both sides have consented. */
    fun startCapture() {
        if (_ui.value.recording) return
        val session = _ui.value.session
        if (session == null || !session.canSpeak) {
            _ui.update { it.copy(error = "They have not allowed the call yet.") }
            return
        }
        if (!hasMicPermission()) {
            _ui.update { it.copy(error = "Khayaal needs the microphone for the call.") }
            return
        }
        val sessionId = session.id
        val talkbackRecorder = TalkbackRecorder { samples ->
            scope.launch { postChunk(sessionId, samples) }
        }
        if (!talkbackRecorder.start()) {
            _ui.update { it.copy(error = "The microphone could not be opened.") }
            return
        }
        recorder = talkbackRecorder
        _ui.update { it.copy(recording = true, error = null) }
        recordJob = scope.launch {
            withContext(Dispatchers.IO) { talkbackRecorder.readLoop() }
            _ui.update { it.copy(recording = false) }
        }
    }

    /** Closes the microphone. */
    fun stopCapture() {
        recordJob?.cancel()
        recordJob = null
        recorder?.stop()
        recorder = null
        _ui.update { it.copy(recording = false) }
    }

    private suspend fun postChunk(sessionId: String, samples: ShortArray) {
        val encoded = TalkbackPcm.encode(samples)
        runCatching { repository.postTalkbackChunk(sessionId, encoded) }
    }

    // -- Playback -------------------------------------------------------------------------

    /** Long-polls for the other side's slices and plays them. */
    private fun startReceiveLoop(sessionId: String) {
        if (receiveJob?.isActive == true) return
        receiveJob = scope.launch {
            while (isActive) {
                val result = repository.fetchTalkbackChunks(sessionId, lastSeq)
                val response = result.getOrNull()
                if (response == null) {
                    // The server may be restarting; wait a moment and try again.
                    delay(RETRY_DELAY_MS)
                    continue
                }
                for (chunk in response.chunks) {
                    if (chunk.seq <= lastSeq) continue
                    lastSeq = chunk.seq
                    // Only the other side's audio is played out loud.
                    if (chunk.from == _ui.value.role) continue
                    if (!player.isRunning) player.start()
                    _ui.update { it.copy(remoteTalking = true) }
                    val samples = runCatching { TalkbackPcm.decode(chunk.data) }.getOrNull()
                    if (samples != null) player.play(samples)
                }
                if (response.chunks.isNotEmpty()) {
                    // Let the last slice finish before the flag drops.
                    delay(PLAYBACK_TAIL_MS)
                    _ui.update { it.copy(remoteTalking = false) }
                }
                if (response.ended) {
                    _ui.update { it.copy(status = "The call ended.") }
                    break
                }
            }
            player.stop()
        }
    }

    private fun hasMicPermission(): Boolean =
        ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.RECORD_AUDIO,
        ) == PackageManager.PERMISSION_GRANTED

    companion object {
        /** How often the phone asks the server whether anything changed. */
        private const val POLL_INTERVAL_MS = 3_000L

        /** A failed poll waits a little longer before the next try. */
        private const val RETRY_DELAY_MS = 2_000L

        /** How long the "they are talking" light stays on after the last slice. */
        private const val PLAYBACK_TAIL_MS = 700L
    }
}
