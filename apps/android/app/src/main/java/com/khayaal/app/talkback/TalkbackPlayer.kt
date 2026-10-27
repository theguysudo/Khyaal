package com.khayaal.app.talkback

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import com.khayaal.app.data.api.TalkbackAudio

/**
 * The speaker side of the walkie-talkie: PCM16 in, sound out, straight into
 * the phone's normal media stream so it is loud enough for her to hear.
 */
class TalkbackPlayer {

    private var track: AudioTrack? = null

    val isRunning: Boolean get() = track != null

    /** Opens the output track. Returns false when the phone refuses it. */
    fun start(): Boolean {
        if (track != null) return true
        val minBuffer = AudioTrack.getMinBufferSize(
            TalkbackAudio.SAMPLE_RATE,
            AudioFormat.CHANNEL_OUT_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        if (minBuffer <= 0) return false
        val bufferSize = maxOf(minBuffer, TalkbackAudio.CHUNK_SAMPLES * 4)

        val audioTrack = runCatching {
            AudioTrack.Builder()
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build(),
                )
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setSampleRate(TalkbackAudio.SAMPLE_RATE)
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .build(),
                )
                .setBufferSizeInBytes(bufferSize)
                .setTransferMode(AudioTrack.MODE_STREAM)
                .build()
        }.getOrNull() ?: return false

        if (audioTrack.state != AudioTrack.STATE_INITIALIZED) {
            runCatching { audioTrack.release() }
            return false
        }
        track = audioTrack
        audioTrack.play()
        return true
    }

    /** Plays one slice. Silently ignored when the track is not open. */
    fun play(samples: ShortArray) {
        val audioTrack = track ?: return
        if (samples.isEmpty()) return
        val bytes = TalkbackPcm.samplesToBytes(samples)
        var offset = 0
        while (offset < bytes.size) {
            val written = audioTrack.write(bytes, offset, bytes.size - offset)
            if (written <= 0) break
            offset += written
        }
    }

    /** Closes the output track. Safe to call twice. */
    fun stop() {
        val audioTrack = track
        track = null
        runCatching { audioTrack?.stop() }
        runCatching { audioTrack?.release() }
    }
}
