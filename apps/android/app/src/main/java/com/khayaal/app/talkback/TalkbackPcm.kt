package com.khayaal.app.talkback

import java.util.Base64

/**
 * The PCM helpers for talkback, kept free of Android classes so they can be
 * unit-tested. The wire format is the one the browser speaks:
 * signed 16-bit LITTLE-ENDIAN PCM, mono, 16 000 Hz, base64-encoded.
 */
object TalkbackPcm {

    /**
     * Short samples to the little-endian bytes the wire expects. Android's
     * AudioRecord already gives little-endian PCM16 on every phone we care
     * about, but we write the bytes ourselves so the format never depends on
     * the device's byte order.
     */
    fun samplesToBytes(samples: ShortArray): ByteArray {
        val out = ByteArray(samples.size * 2)
        for (i in samples.indices) {
            val value = samples[i].toInt()
            out[i * 2] = (value and 0xFF).toByte()
            out[i * 2 + 1] = ((value shr 8) and 0xFF).toByte()
        }
        return out
    }

    /** The bytes the wire carries back into short samples. */
    fun bytesToSamples(bytes: ByteArray): ShortArray {
        val out = ShortArray(bytes.size / 2)
        for (i in out.indices) {
            val low = bytes[i * 2].toInt() and 0xFF
            val high = bytes[i * 2 + 1].toInt()
            out[i] = ((high shl 8) or low).toShort()
        }
        return out
    }

    fun encode(samples: ShortArray): String =
        Base64.getEncoder().encodeToString(samplesToBytes(samples))

    fun decode(base64: String): ShortArray =
        bytesToSamples(Base64.getDecoder().decode(base64))
}
