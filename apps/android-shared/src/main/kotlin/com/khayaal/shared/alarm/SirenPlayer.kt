package com.khayaal.shared.alarm

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.PowerManager

/**
 * THE shared SOS siren player. Every Khayaal app — the elder's phone, Khayaal
 * Family and Khayaal Neighbour — rings this exact object, so an SOS sounds
 * the same everywhere and the "must be heard" guarantees live in one place.
 *
 * The guarantees, deliberately boring:
 *  - **Alarm stream, at max.** The AudioTrack carries `USAGE_ALARM`, which
 *    Android routes to `STREAM_ALARM` regardless of the ringer mode — a phone
 *    left on silent still rings. Before playing, the alarm volume is raised
 *    to the stream's maximum (the previous level is restored on stop).
 *  - **Loops until stopped.** One seamless [SirenSynth] sweep is written to a
 *    static AudioTrack and looped infinitely; [stop] is the only way out.
 *  - **Partial wake lock while ringing.** The CPU stays up so the siren
 *    cannot be throttled away with the screen off.
 *
 * Lifecycle contract: [start] is idempotent while ringing; [stop] is safe to
 * call from any path (resolve, "I'm safe", activity teardown) and always
 * releases the wake lock and the audio resource.
 */
object SirenPlayer {

    private const val WAKE_LOCK_TAG = "khayaal:sos-siren"

    /** A stuck siren must not hold the CPU forever; see [WAKE_LOCK_MS]. */
    private const val WAKE_LOCK_MS = 60L * 60 * 1000

    @Volatile
    var isRinging: Boolean = false
        private set

    private var track: AudioTrack? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var previousAlarmVolume: Int = -1

    /** Starts the siren at full alarm volume. No-op if already ringing. */
    @Synchronized
    fun start(context: Context) {
        if (isRinging) return
        val appContext = context.applicationContext
        val audioManager = appContext.getSystemService(AudioManager::class.java)
            ?: return

        // The alarm stream is the one stream silent mode does not silence;
        // max it out so the siren carries to another room.
        previousAlarmVolume = audioManager.getStreamVolume(AudioManager.STREAM_ALARM)
        val maxVolume = audioManager.getStreamMaxVolume(AudioManager.STREAM_ALARM)
        runCatching {
            audioManager.setStreamVolume(AudioManager.STREAM_ALARM, maxVolume, 0)
        }

        val sweep = SirenSynth.sweep()
        val bytes = toPcmBytes(sweep)

        val newTrack = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build(),
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(SirenSynth.SAMPLE_RATE)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build(),
            )
            .setTransferMode(AudioTrack.MODE_STATIC)
            .setBufferSizeInBytes(bytes.size)
            .build()

        val written = newTrack.write(bytes, 0, bytes.size)
        if (written < 0) {
            // The resource is refused (audio focus policy, media server down).
            // Give up quietly — the full-screen SOS notification still fires.
            runCatching { newTrack.release() }
            return
        }
        // Loop the single sweep forever; -1 means "until stopped".
        runCatching { newTrack.setLoopPoints(0, sweep.size, -1) }
        runCatching { newTrack.play() }
        track = newTrack

        // Hold the CPU while the siren sounds so doze cannot mute the alarm.
        val powerManager = appContext.getSystemService(PowerManager::class.java)
        wakeLock = powerManager?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WAKE_LOCK_TAG)?.apply {
            setReferenceCounted(false)
            acquire(WAKE_LOCK_MS)
        }

        isRinging = true
    }

    /** Stops the siren and restores the alarm volume that was there before. */
    @Synchronized
    fun stop(context: Context) {
        if (!isRinging && track == null && wakeLock == null) return
        runCatching {
            track?.stop()
            track?.release()
        }
        track = null
        runCatching { wakeLock?.release() }
        wakeLock = null

        val volume = previousAlarmVolume
        if (volume >= 0) {
            context.applicationContext.getSystemService(AudioManager::class.java)?.let { am ->
                runCatching {
                    am.setStreamVolume(AudioManager.STREAM_ALARM, volume.coerceIn(0, am.getStreamMaxVolume(AudioManager.STREAM_ALARM)), 0)
                }
            }
            previousAlarmVolume = -1
        }
        isRinging = false
    }

    /** PCM 16-bit little-endian bytes, the layout AudioTrack expects. */
    private fun toPcmBytes(samples: ShortArray): ByteArray {
        val out = ByteArray(samples.size * 2)
        for (i in samples.indices) {
            val v = samples[i].toInt()
            out[i * 2] = (v and 0xFF).toByte()
            out[i * 2 + 1] = ((v shr 8) and 0xFF).toByte()
        }
        return out
    }
}
