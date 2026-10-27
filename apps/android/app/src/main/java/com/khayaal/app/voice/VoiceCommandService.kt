package com.khayaal.app.voice

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.khayaal.app.KhayaalApp
import com.khayaal.app.R
import com.khayaal.app.care.FamilyCall
import com.khayaal.app.signals.WorkScheduler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking

/**
 * "Hey Khayaal" — an opt-in (default OFF) microphone foreground service that
 * turns a handful of spoken phrases into actions. Grammar-free on-device
 * recognition ([SpeechRecognizer], `EXTRA_PREFER_OFFLINE` when supported):
 *
 *   "Khayaal, call Aditya"   → dial the matching callOrder contact
 *   "Khayaal, main theek hoon" / "I'm OK" → post a check-in
 *   "Khayaal, status" / "kaisi ho" → read the current status aloud
 *
 * PRIVACY: transcripts are used in memory only, to trigger these actions.
 * Nothing is stored, uploaded or logged. Recognition restarts with a backoff
 * after errors, and the service caps its own runtime at 12 hours.
 */
class VoiceCommandService : android.app.Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val mainHandler = Handler(Looper.getMainLooper())
    private val container by lazy { (applicationContext as KhayaalApp).container }

    @Volatile
    private var running = false
    private var startedAtMs = 0L
    private var backoffMs = BACKOFF_START_MS
    private var recognizer: SpeechRecognizer? = null

    private val recognitionListener = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {
            backoffMs = BACKOFF_START_MS
        }

        override fun onBeginningOfSpeech() = Unit
        override fun onRmsChanged(rmsdB: Float) = Unit
        override fun onBufferReceived(buffer: ByteArray?) = Unit
        override fun onEndOfSpeech() = Unit

        override fun onError(error: Int) {
            if (!running) return
            if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
                scope.launch { stopSelfQuietly() }
                return
            }
            scheduleRestart(backoffMs)
            backoffMs = (backoffMs * 2).coerceAtMost(BACKOFF_MAX_MS)
        }

        override fun onResults(results: Bundle?) {
            if (!running) return
            val transcript = results
                ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                ?.firstOrNull()
            if (!transcript.isNullOrBlank()) handleTranscript(transcript)
            scheduleRestart(RESULT_RESTART_DELAY_MS)
        }

        override fun onPartialResults(partialResults: Bundle?) = Unit
        override fun onEvent(eventType: Int, params: Bundle?) = Unit
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        if (!VoiceCommandManager.hasRecordPermission(this) || !VoiceCommandManager.isAvailable(this)) {
            stopSelf()
            return
        }
        startedAtMs = System.currentTimeMillis()
        if (!enterForeground()) {
            stopSelf()
            return
        }
        running = true
        scope.launch { container.pairingStore.setVoiceActive(true) }
        startListening()
        scope.launch { watchdog() }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    override fun onDestroy() {
        running = false
        mainHandler.post {
            runCatching { recognizer?.destroy() }
            recognizer = null
        }
        runBlocking { container.pairingStore.setVoiceActive(false) }
        scope.cancel()
        super.onDestroy()
    }

    // -- Recognition loop ------------------------------------------------------

    private fun startListening() {
        if (!running) return
        mainHandler.post {
            if (!running) return@post
            runCatching {
                val old = recognizer
                old?.destroy()
                recognizer = SpeechRecognizer.createSpeechRecognizer(this).apply {
                    setRecognitionListener(recognitionListener)
                    startListening(listeningIntent())
                }
            }
        }
    }

    private fun listeningIntent(): Intent =
        Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(
                RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM,
            )
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, java.util.Locale.getDefault())
            // Prefer the on-device model: lower latency, nothing leaves the phone.
            putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        }

    private fun scheduleRestart(delayMs: Long) {
        mainHandler.postDelayed({ startListening() }, delayMs)
    }

    // -- Command handling --------------------------------------------------------

    private fun handleTranscript(transcript: String) {
        scope.launch {
            val contacts = container.pairingStore.currentCallOrder()
                .map { VoiceCommandParser.Contact(name = it.name, phone = it.phone) }
            when (val command = VoiceCommandParser.resolve(transcript, contacts)) {
                is VoiceCommandParser.Command.Call -> {
                    FamilyCall.openDialer(this@VoiceCommandService, command.name.ifBlank { null })
                }
                is VoiceCommandParser.Command.CheckIn -> {
                    container.repository.checkIn()
                    WorkScheduler.flushNow(this@VoiceCommandService, expedited = false)
                    container.ttsSpeaker.speak(getString(R.string.voice_checkin_done))
                }
                is VoiceCommandParser.Command.ReadStatus -> {
                    val status = container.pairingStore.lastStatusFlow.first()
                    container.ttsSpeaker.speak(
                        status.ifBlank { getString(R.string.voice_status_unknown) },
                    )
                }
                VoiceCommandParser.Command.None -> Unit
            }
        }
    }

    // -- Housekeeping ---------------------------------------------------------------

    private suspend fun watchdog() {
        while (running) {
            delay(WATCHDOG_INTERVAL_MS)
            if (System.currentTimeMillis() - startedAtMs > MAX_RUNTIME_MS) {
                stopSelfQuietly()
                return
            }
        }
    }

    private suspend fun stopSelfQuietly() {
        running = false
        container.pairingStore.setVoiceActive(false)
        runCatching { stopSelf() }
    }

    private fun enterForeground(): Boolean = runCatching {
        val manager = getSystemService(NotificationManager::class.java)
        manager?.createNotificationChannel(
            NotificationChannel(
                VoiceCommandManager.CHANNEL_VOICE,
                getString(R.string.channel_voice_name),
                NotificationManager.IMPORTANCE_LOW,
            ).apply { description = getString(R.string.channel_voice_description) },
        )
        val notification = NotificationCompat.Builder(this, VoiceCommandManager.CHANNEL_VOICE)
            .setSmallIcon(R.drawable.ic_stat_khayaal)
            .setContentTitle(getString(R.string.voice_notification_title))
            .setContentText(getString(R.string.voice_notification_body))
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceCompat.startForeground(
                this,
                VoiceCommandManager.NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE,
            )
        } else {
            startForeground(VoiceCommandManager.NOTIFICATION_ID, notification)
        }
        true
    }.getOrDefault(false)

    private companion object {
        const val BACKOFF_START_MS = 2_000L
        const val BACKOFF_MAX_MS = 30_000L
        const val RESULT_RESTART_DELAY_MS = 1_500L
        const val WATCHDOG_INTERVAL_MS = 60_000L
        const val MAX_RUNTIME_MS = 12 * 60 * 60 * 1000L
    }
}
