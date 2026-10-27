package com.khayaal.app.talkback

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import com.khayaal.app.data.api.TalkbackAudio

/**
 * The microphone side of the walkie-talkie.
 *
 * The recorder is only ever constructed after the *other* side has tapped
 * Allow — the manager checks the consent flag before it calls [start], so
 * there is no path that opens the mic without permission from both sides.
 *
 * Audio is read in slices of [TalkbackAudio.CHUNK_SAMPLES] (about 250 ms) and
 * handed straight to the callback; nothing is written to disk.
 */
class TalkbackRecorder(
    private val onChunk: (ShortArray) -> Unit,
) {

    private var record: AudioRecord? = null
    private var running = false

    val isRunning: Boolean get() = running

    /**
     * Opens the microphone and starts reading. Returns false when the phone
     * has no usable input or the mic is held by something else.
     */
    @SuppressLint("MissingPermission")
    fun start(): Boolean {
        if (running) return true
        val minBuffer = AudioRecord.getMinBufferSize(
            TalkbackAudio.SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        if (minBuffer <= 0) return false
        val bufferSize = maxOf(minBuffer, TalkbackAudio.CHUNK_SAMPLES * 4)

        val audioRecord = runCatching {
            AudioRecord(
                MediaRecorder.AudioSource.MIC,
                TalkbackAudio.SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                bufferSize,
            )
        }.getOrNull() ?: return false
        if (audioRecord.state != AudioRecord.STATE_INITIALIZED) {
            runCatching { audioRecord.release() }
            return false
        }

        record = audioRecord
        running = true
        audioRecord.startRecording()
        return true
    }

    /**
     * Reads slices until [stop] is called. Runs on the caller's thread, so
     * the manager gives it a background dispatcher.
     */
    fun readLoop() {
        val audioRecord = record ?: return
        val buffer = ShortArray(TalkbackAudio.CHUNK_SAMPLES)
        while (running) {
            var filled = 0
            while (running && filled < buffer.size) {
                val read = audioRecord.read(buffer, filled, buffer.size - filled)
                if (read <= 0) {
                    // A negative value is an error; 0 means "no data yet".
                    if (read < 0) {
                        running = false
                        break
                    }
                    // Nothing yet — wait a moment instead of spinning.
                    Thread.sleep(5)
                    continue
                }
                filled += read
            }
            if (!running || filled == 0) continue
            val slice = if (filled == buffer.size) buffer else buffer.copyOf(filled)
            onChunk(slice)
        }
    }

    /** Stops reading and releases the microphone. Safe to call twice. */
    fun stop() {
        if (!running && record == null) return
        running = false
        val audioRecord = record
        record = null
        runCatching { audioRecord?.stop() }
        runCatching { audioRecord?.release() }
    }
}
