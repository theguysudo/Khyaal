package com.khayaal.app

import com.khayaal.app.talkback.TalkbackPcm
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The talkback wire format: signed 16-bit LITTLE-ENDIAN PCM, base64-encoded.
 * The browser side writes the same bytes, so a mistake here would make the
 * conversation sound like noise.
 */
class TalkbackPcmTest {

    @Test
    fun `samples are written little endian`() {
        val bytes = TalkbackPcm.samplesToBytes(shortArrayOf(1, -1))
        // 1 -> 01 00, -1 -> FF FF
        assertArrayEquals(byteArrayOf(1, 0, -1, -1), bytes)
    }

    @Test
    fun `samples survive a base64 round trip`() {
        val original = ShortArray(64) { (it * 37 - 1000).toShort() }
        val decoded = TalkbackPcm.decode(TalkbackPcm.encode(original))
        assertArrayEquals(original, decoded)
    }

    @Test
    fun `a chunk is four thousand samples`() {
        val slice = ShortArray(4000) { (it % 100).toShort() }
        val bytes = TalkbackPcm.samplesToBytes(slice)
        // 16-bit samples: two bytes each.
        assertEquals(8000, bytes.size)
    }
}
