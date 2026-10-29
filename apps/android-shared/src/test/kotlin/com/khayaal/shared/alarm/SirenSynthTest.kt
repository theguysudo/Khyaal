package com.khayaal.shared.alarm

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SirenSynthTest {

    @Test
    fun `sweep is exactly one loop long`() {
        val expected = (SirenSynth.SAMPLE_RATE * SirenSynth.SWEEP_SECONDS).toInt()
        assertEquals(expected, SirenSynth.sweep().size)
    }

    @Test
    fun `sweep is loud but never clipped`() {
        val sweep = SirenSynth.sweep()
        val peak = sweep.maxOf { kotlin.math.abs(it.toInt()) }
        // Audible: well above digital silence.
        assertTrue("peak $peak should be a strong signal", peak > 10_000)
        // No clipping: the synth's PEAK envelope guarantees headroom.
        assertTrue("peak $peak must not clip", peak < Short.MAX_VALUE)
    }

    @Test
    fun `sweep glides between the two frequencies and back`() {
        // Rising half: frequency at the start is the low bound.
        assertEquals(
            SirenSynth.FREQ_LOW_HZ,
            SirenSynth.frequencyAt(0.0),
            0.001,
        )
        // Top of the glide at the halfway point.
        assertEquals(
            SirenSynth.FREQ_HIGH_HZ,
            SirenSynth.frequencyAt(SirenSynth.SWEEP_SECONDS / 2.0),
            0.001,
        )
        // And back down for the loop point.
        assertEquals(
            SirenSynth.FREQ_LOW_HZ,
            SirenSynth.frequencyAt(SirenSynth.SWEEP_SECONDS),
            0.001,
        )
    }

    @Test
    fun `sweep is deterministic`() {
        val a = SirenSynth.sweep()
        val b = SirenSynth.sweep()
        assertTrue(a.contentEquals(b))
    }

    @Test
    fun `sweep has no long silent gaps`() {
        // A siren that dips to silence for a stretch is not a siren. Check
        // every 100 ms window carries real amplitude.
        val sweep = SirenSynth.sweep()
        val window = SirenSynth.SAMPLE_RATE / 10
        var i = 0
        while (i + window <= sweep.size) {
            val peak = sweep.copyOfRange(i, i + window).maxOf { kotlin.math.abs(it.toInt()) }
            assertTrue("silent window at $i", peak > 1_000)
            i += window
        }
    }

    @Test
    fun `loop point is phase-continuous`() {
        // The wrap step (last -> first) must be no bigger than an ordinary
        // in-buffer step — a siren cannot click where the buffer restarts.
        val sweep = SirenSynth.sweep()
        var maxStep = 0
        for (i in 1 until sweep.size) {
            maxStep = maxOf(maxStep, kotlin.math.abs(sweep[i].toInt() - sweep[i - 1].toInt()))
        }
        val wrapStep = kotlin.math.abs(sweep.first().toInt() - sweep.last().toInt())
        assertTrue(
            "wrap step $wrapStep exceeds the in-buffer max step $maxStep",
            wrapStep <= maxStep + 64,
        )
    }
}

class SosLatchTest {

    @Test
    fun `inactive to active starts the siren`() {
        assertEquals(SosLatch.Action.START, SosLatch.action(wasActive = false, isActive = true))
    }

    @Test
    fun `active to inactive stops the siren`() {
        assertEquals(SosLatch.Action.STOP, SosLatch.action(wasActive = true, isActive = false))
    }

    @Test
    fun `re-observing active never re-triggers`() {
        assertEquals(SosLatch.Action.NONE, SosLatch.action(wasActive = true, isActive = true))
    }

    @Test
    fun `re-observing inactive does nothing`() {
        assertEquals(SosLatch.Action.NONE, SosLatch.action(wasActive = false, isActive = false))
    }

    @Test
    fun `a full cycle can repeat`() {
        // resolve (ringing -> quiet), then a new SOS: it must ring again.
        assertEquals(SosLatch.Action.STOP, SosLatch.action(wasActive = true, isActive = false))
        assertEquals(SosLatch.Action.START, SosLatch.action(wasActive = false, isActive = true))
    }
}
