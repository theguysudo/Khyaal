package com.khayaal.app

import com.khayaal.app.signals.SignalEvent
import com.khayaal.app.sleep.SleepClassifier
import com.khayaal.app.sleep.SleepWatchPolicy
import com.khayaal.app.sleep.SoundLevel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDateTime
import java.time.ZoneOffset

/**
 * The nightly narration, clock-injected via UTC zones: asleep once per night,
 * sound events rate-limited, awake on morning and on stop.
 */
class SleepWatchPolicyTest {

    private val zone = ZoneOffset.UTC

    private fun at(hour: Int, minute: Int = 0, day: Int = 10): Long =
        LocalDateTime.of(2026, 10, day, hour, minute).toInstant(ZoneOffset.UTC).toEpochMilli()

    private fun feedQuietMinutes(policy: SleepWatchPolicy, minutes: Int, startMs: Long): List<SleepWatchPolicy.Emission> {
        val emissions = mutableListOf<SleepWatchPolicy.Emission>()
        val windowsPerMinute = 60_000L / SleepWatchPolicy.WINDOW_MS
        repeat(minutes * windowsPerMinute.toInt()) { index ->
            emissions += policy.onWindow(
                rms = SleepClassifier.QUIET_MAX_RMS / 10,
                nowMs = startMs + index * SleepWatchPolicy.WINDOW_MS,
            )
        }
        return emissions
    }

    @Test
    fun `rms buckets split at the documented thresholds`() {
        assertEquals(SoundLevel.QUIET, SleepClassifier.classify(50.0))
        assertEquals(SoundLevel.QUIET, SleepClassifier.classify(SleepClassifier.QUIET_MAX_RMS - 1))
        assertEquals(SoundLevel.NOISE, SleepClassifier.classify(SleepClassifier.QUIET_MAX_RMS))
        assertEquals(SoundLevel.NOISE, SleepClassifier.classify(1000.0))
        assertEquals(SoundLevel.LOUD, SleepClassifier.classify(SleepClassifier.LOUD_MIN_RMS))
        assertEquals(SoundLevel.LOUD, SleepClassifier.classify(10_000.0))
    }

    @Test
    fun `sustained quiet at night emits asleep exactly once`() {
        val policy = SleepWatchPolicy(zone)
        val night = at(23)

        val first = feedQuietMinutes(policy, 11, night)
        val again = feedQuietMinutes(policy, 11, night + 30 * 60_000L)

        val asleepEvents = (first + again).filter { it.value == SignalEvent.SleepValues.ASLEEP }
        assertEquals(1, asleepEvents.size)
    }

    @Test
    fun `quiet during the day never emits asleep`() {
        val policy = SleepWatchPolicy(zone)
        val afternoon = at(14)

        val emissions = feedQuietMinutes(policy, 15, afternoon)

        assertTrue(emissions.none { it.signalType == SignalEvent.Types.SLEEP_EVENT })
    }

    @Test
    fun `sound events are rate limited to one per two minutes`() {
        val policy = SleepWatchPolicy(zone)
        val night = at(22)

        val first = policy.onWindow(3000.0, night)
        val second = policy.onWindow(3000.0, night + 60_000L) // 1 min later: suppressed
        val third = policy.onWindow(3000.0, night + 2 * 60_000L + 1) // past the window

        assertEquals(1, first.filter { it.signalType == SignalEvent.Types.SOUND_EVENT }.size)
        assertEquals(0, second.filter { it.signalType == SignalEvent.Types.SOUND_EVENT }.size)
        assertEquals(1, third.filter { it.signalType == SignalEvent.Types.SOUND_EVENT }.size)
    }

    @Test
    fun `morning after an asleep night emits awake once`() {
        val policy = SleepWatchPolicy(zone)
        feedQuietMinutes(policy, 11, at(23)) // asleep at ~23:11
        policy.onWindow(SleepClassifier.QUIET_MAX_RMS / 10, at(0, day = 11)) // small hours

        val morning = policy.onWindow(SleepClassifier.QUIET_MAX_RMS / 10, at(8, day = 11))

        assertTrue(morning.any { it.value == SignalEvent.SleepValues.AWAKE })
        val later = policy.onWindow(SleepClassifier.QUIET_MAX_RMS / 10, at(9, day = 11))
        assertTrue(later.none { it.value == SignalEvent.SleepValues.AWAKE })
    }

    @Test
    fun `stopping mid-night closes the night with awake`() {
        val policy = SleepWatchPolicy(zone)
        feedQuietMinutes(policy, 11, at(23)) // asleep

        val closing = policy.onStopped(at(1, day = 11))

        assertEquals(SignalEvent.SleepValues.AWAKE, closing?.value)
        // A second stop says nothing — one close per night.
        assertNull(policy.onStopped(at(2, day = 11)))
    }

    @Test
    fun `night key wraps so small hours belong to the previous evening`() {
        val policy = SleepWatchPolicy(zone)
        assertEquals("2026-10-10", policy.nightKeyFor(at(22)))
        assertEquals("2026-10-10", policy.nightKeyFor(at(3, day = 11)))
        assertEquals("2026-10-11", policy.nightKeyFor(at(21, day = 11)))
    }

    @Test
    fun `a new night may emit asleep again`() {
        val policy = SleepWatchPolicy(zone)
        feedQuietMinutes(policy, 11, at(23, day = 10)) // night one
        policy.onWindow(SleepClassifier.QUIET_MAX_RMS / 10, at(9, day = 11)) // morning awake

        val nextNight = feedQuietMinutes(policy, 11, at(23, day = 11)) // night two

        assertTrue(nextNight.any { it.value == SignalEvent.SleepValues.ASLEEP })
    }
}
