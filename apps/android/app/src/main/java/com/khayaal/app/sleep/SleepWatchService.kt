package com.khayaal.app.sleep

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.khayaal.app.KhayaalApp
import com.khayaal.app.R
import com.khayaal.app.care.CheckInManager
import com.khayaal.app.signals.SignalEvent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlin.math.sqrt

/**
 * Night watch — a microphone foreground service, strictly opt-in (default OFF),
 * that turns ambient loudness into a handful of classified events.
 *
 * PRIVACY MODEL (the whole point of this service):
 *   AudioRecord → RMS amplitude → a quiet/noise/loud bucket → at most a few
 *   signals per night. Audio bytes are NEVER written to disk, NEVER uploaded,
 *   and exist in memory only for the few milliseconds an RMS window takes.
 *   Nothing is recorded; the phone listens for loud sounds only.
 *
 * The persistent notification says so, and the Home screen discloses it in
 * plain words. The service stops itself when: the toggle turns off, morning
 * comes after a detected night's sleep, the battery drops under 10%, or it
 * has run for 14 hours.
 */
class SleepWatchService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val container by lazy { (applicationContext as KhayaalApp).container }
    private val policy by lazy { SleepWatchPolicy() }

    @Volatile
    private var audioThread: Thread? = null

    @Volatile
    private var running = false

    private var startedAtMs = 0L

    private val batteryReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (batteryPercent() < SleepWatchManager.LOW_BATTERY_PERCENT) {
                scope.launch { stopWithClosingEvent("battery") }
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        if (!SleepWatchManager.hasRecordPermission(this)) {
            stopSelf()
            return
        }
        startedAtMs = System.currentTimeMillis()
        if (!enterForeground()) {
            stopSelf()
            return
        }
        registerReceiver(
            batteryReceiver,
            IntentFilter(Intent.ACTION_BATTERY_CHANGED),
        )
        scope.launch { container.pairingStore.setNightWatchActive(true, startedAtMs) }
        startAudioLoop()
        scope.launch { watchLoop() }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    override fun onDestroy() {
        running = false
        audioThread?.interrupt()
        runCatching { unregisterReceiver(batteryReceiver) }
        // Closing a detected night happens even on a cold kill — a final
        // DataStore write, safely under a second.
        runBlocking {
            container.pairingStore.setNightWatchActive(false)
            closeOpenNight("destroy")
        }
        scope.cancel()
        super.onDestroy()
    }

    // -- Foreground plumbing ------------------------------------------------

    private fun enterForeground(): Boolean = runCatching {
        ensureChannel()
        val notification = NotificationCompat.Builder(this, SleepWatchManager.CHANNEL_NIGHT_WATCH)
            .setSmallIcon(R.drawable.ic_stat_khayaal)
            .setContentTitle(getString(R.string.night_watch_notification_title))
            .setContentText(getString(R.string.night_watch_notification_body))
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceCompat.startForeground(
                this,
                SleepWatchManager.NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE,
            )
        } else {
            startForeground(SleepWatchManager.NOTIFICATION_ID, notification)
        }
        true
    }.getOrDefault(false)

    private fun ensureChannel() {
        val manager = getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            SleepWatchManager.CHANNEL_NIGHT_WATCH,
            getString(R.string.channel_night_watch_name),
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = getString(R.string.channel_night_watch_description)
        }
        manager.createNotificationChannel(channel)
    }

    // -- Audio → RMS → classified windows -------------------------------------

    private fun startAudioLoop() {
        running = true
        audioThread = Thread({ audioLoop() }, "khayaal-night-watch").apply { start() }
    }

    private fun audioLoop() {
        val minBuffer = AudioRecord.getMinBufferSize(
            SAMPLE_RATE_HZ,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        if (minBuffer <= 0) {
            scope.launch { stopWithClosingEvent("audio") }
            return
        }
        val record = runCatching {
            @Suppress("MissingPermission") // onCreate verified RECORD_AUDIO
            AudioRecord(
                MediaRecorder.AudioSource.MIC,
                SAMPLE_RATE_HZ,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                minBuffer * 2,
            )
        }.getOrNull()
        if (record == null || record.state != AudioRecord.STATE_INITIALIZED) {
            record?.release()
            scope.launch { stopWithClosingEvent("audio") }
            return
        }

        runCatching { record.startRecording() }
        val buffer = ShortArray(READ_SAMPLES)
        var windowSumSquares = 0.0
        var windowSamples = 0
        var windowStartMs = System.currentTimeMillis()

        try {
            while (running && !Thread.currentThread().isInterrupted) {
                val read = record.read(buffer, 0, buffer.size)
                if (read <= 0) continue
                for (i in 0 until read) {
                    val sample = buffer[i].toDouble()
                    windowSumSquares += sample * sample
                }
                windowSamples += read

                val now = System.currentTimeMillis()
                if (now - windowStartMs >= SleepWatchPolicy.WINDOW_MS && windowSamples > 0) {
                    val rms = sqrt(windowSumSquares / windowSamples)
                    windowSumSquares = 0.0
                    windowSamples = 0
                    windowStartMs = now
                    handleWindow(rms, now)
                }
            }
        } finally {
            runCatching { record.stop() }
            record.release()
        }
    }

    /** The only place audio-derived data becomes anything persistent: a bucket. */
    private fun handleWindow(rms: Double, nowMs: Long) {
        for (emission in policy.onWindow(rms, nowMs)) {
            record(emission.signalType, emission.value, nowMs)
        }
    }

    // -- Watchdog: morning, battery, max runtime -------------------------------

    private suspend fun watchLoop() {
        while (scope.isActive && running) {
            delay(WATCHDOG_INTERVAL_MS)
            val now = System.currentTimeMillis()
            val battery = batteryPercent()
            if (battery in 1 until SleepWatchManager.LOW_BATTERY_PERCENT) {
                stopWithClosingEvent("battery")
                return
            }
            if (now - startedAtMs > SleepWatchManager.MAX_RUNTIME_MS) {
                stopWithClosingEvent("runtime")
                return
            }
            // A detected night ends in the morning: say 'awake' and go quiet.
            val hour = policy.hourOf(now)
            if (policy.asleepDetectedTonight &&
                hour >= SleepWatchPolicy.NIGHT_END_HOUR &&
                hour < SleepWatchPolicy.NIGHT_START_HOUR
            ) {
                stopWithClosingEvent("morning")
                return
            }
        }
    }

    private fun batteryPercent(): Int {
        val sticky = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)) ?: return 100
        val level = sticky.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = sticky.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
        if (level < 0 || scale <= 0) return 100
        return (level * 100) / scale
    }

    /** Every stop path funnels here so an open night always closes with 'awake'. */
    private fun stopWithClosingEvent(reason: String) {
        running = false
        scope.launch {
            closeOpenNight(reason)
            runCatching { stopSelf() }
        }
    }

    private suspend fun closeOpenNight(reason: String) {
        val closing = policy.onStopped(System.currentTimeMillis())
        if (closing != null) {
            record(closing.signalType, closing.value, System.currentTimeMillis())
        }
    }

    private fun record(signalType: String, value: String, ts: Long) {
        scope.launch {
            container.signalRecorder.record(
                if (signalType == SignalEvent.Types.SOUND_EVENT) {
                    SignalEvent.soundEvent(value, ts)
                } else {
                    SignalEvent.sleepEvent(value, ts)
                },
            )
            if (signalType == SignalEvent.Types.SLEEP_EVENT) {
                container.pairingStore.setLastSleepEvent(value, ts)
            }
        }
    }

    private companion object {
        /** 8 kHz mono is ample for loudness classification and cheap to run. */
        const val SAMPLE_RATE_HZ = 8_000
        const val READ_SAMPLES = 400 // 50 ms of audio per read
        const val WATCHDOG_INTERVAL_MS = 30_000L
    }
}
