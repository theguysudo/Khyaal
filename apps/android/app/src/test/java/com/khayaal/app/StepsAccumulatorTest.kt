package com.khayaal.app

import com.khayaal.app.signals.SignalEvent
import com.khayaal.app.signals.StepsAccumulator
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Daily step accounting: midnight resets, reboot rebases, honest deltas. */
class StepsAccumulatorTest {

    @Test
    fun `first sample anchors the counter without a phantom delta`() {
        val accumulator = StepsAccumulator()

        val outcome = accumulator.onSample(cumulative = 1000.0, today = "2026-10-23")

        assertEquals(0, outcome.dayTotal)
        assertFalse(outcome.changed)
    }

    @Test
    fun `deltas accumulate into the daily total`() {
        val accumulator = StepsAccumulator()

        accumulator.onSample(1000.0, "2026-10-23")
        val a = accumulator.onSample(1400.0, "2026-10-23")
        val b = accumulator.onSample(1900.0, "2026-10-23")

        assertEquals(400, a.dayTotal)
        assertTrue(a.changed)
        assertEquals(900, b.dayTotal)
    }

    @Test
    fun `midnight resets the daily total`() {
        val accumulator = StepsAccumulator()

        accumulator.onSample(1000.0, "2026-10-22")
        accumulator.onSample(8000.0, "2026-10-22")
        val newDay = accumulator.onSample(8100.0, "2026-10-23")

        assertEquals(100, newDay.dayTotal)
        assertTrue(newDay.changed)
    }

    @Test
    fun `a rebooted counter rebases instead of going negative`() {
        val accumulator = StepsAccumulator()

        accumulator.onSample(9000.0, "2026-10-23")
        accumulator.onSample(9500.0, "2026-10-23")
        // Device rebooted; the sensor restarts at a small number.
        val rebase = accumulator.onSample(30.0, "2026-10-23")
        val next = accumulator.onSample(230.0, "2026-10-23")

        assertTrue(rebase.rebased)
        assertEquals(500, rebase.dayTotal) // rebasing itself adds no steps
        assertEquals(700, next.dayTotal)
    }

    @Test
    fun `wire value is a plain number with the steps type`() {
        val event = SignalEvent.steps(1234, nowMs = 42)

        assertEquals("steps", event.type)
        assertEquals(JsonPrimitive(1234), event.value)
        assertEquals(42, event.ts)
    }

    @Test
    fun `sleep and sound factories carry the documented wire values`() {
        assertEquals("sleep_event", SignalEvent.sleepEvent("asleep").type)
        assertEquals(JsonPrimitive("asleep"), SignalEvent.sleepEvent("asleep").value)
        assertEquals(JsonPrimitive("restless"), SignalEvent.sleepEvent("restless").value)

        assertEquals("sound_event", SignalEvent.soundEvent("loud").type)
        assertEquals(JsonPrimitive("loud"), SignalEvent.soundEvent("loud").value)
        assertEquals(JsonPrimitive("quiet"), SignalEvent.soundEvent("quiet").value)
    }
}
