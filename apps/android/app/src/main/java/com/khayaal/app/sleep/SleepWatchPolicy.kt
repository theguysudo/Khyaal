package com.khayaal.app.sleep

import com.khayaal.app.signals.SignalEvent
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId

/** Three loudness buckets for one window of ambient sound. */
enum class SoundLevel { QUIET, NOISE, LOUD }

/**
 * Pure RMS → level classification. Thresholds sit on the 16-bit PCM scale
 * (0..32767): a calm bedroom rests well under 400 RMS; a television or a
 * raised voice crosses 2500. Only the bucket ever leaves the device.
 */
object SleepClassifier {

    const val QUIET_MAX_RMS = 400.0
    const val LOUD_MIN_RMS = 2500.0

    fun classify(rms: Double): SoundLevel = when {
        rms >= LOUD_MIN_RMS -> SoundLevel.LOUD
        rms >= QUIET_MAX_RMS -> SoundLevel.NOISE
        else -> SoundLevel.QUIET
    }
}

/**
 * The nightly narration, decided entirely on-device. Windows of classified
 * loudness become at most a handful of signals per night:
 *
 *  - `sleep_event 'asleep'`   — 10 sustained quiet minutes during the night,
 *                               once per night;
 *  - `sound_event noise/loud` — any spike, rate-limited to one per 2 minutes;
 *  - `sleep_event 'restless'` — 2 minutes of steady noise while asleep, once;
 *  - `sleep_event 'woke'`     — 30 seconds of sustained loudness while asleep, once;
 *  - `sleep_event 'awake'`    — morning has come (hour in 7..12), or the watch
 *                               was stopped while she was judged asleep.
 *
 * Deterministic and clock-injected at the call sites, so every rule is
 * unit-testable without an emulator.
 */
class SleepWatchPolicy(private val zone: ZoneId = ZoneId.systemDefault()) {

    data class Emission(val signalType: String, val value: String)

    private enum class Phase { AWAKE, ASLEEP }

    private var phase = Phase.AWAKE
    private var asleepNightKey: String? = null
    private var restlessNightKey: String? = null
    private var wokeNightKey: String? = null
    private var awakeNightKey: String? = null
    private var lastSoundEmitMs: Long? = null
    private var quietStreak = 0
    private var noiseStreak = 0
    private var loudStreak = 0

    /** True once this watch judged her asleep at least once tonight. */
    val asleepDetectedTonight: Boolean get() = asleepNightKey != null

    fun onWindow(rms: Double, nowMs: Long): List<Emission> {
        val level = SleepClassifier.classify(rms)
        val emissions = mutableListOf<Emission>()
        val hour = hourOf(nowMs)
        val nightKey = nightKeyFor(nowMs)

        when (level) {
            SoundLevel.QUIET -> {
                quietStreak++
                noiseStreak = 0
                loudStreak = 0
            }
            SoundLevel.NOISE -> {
                noiseStreak++
                quietStreak = 0
                loudStreak = 0
            }
            SoundLevel.LOUD -> {
                loudStreak++
                noiseStreak = 0
                quietStreak = 0
            }
        }

        // Any spike becomes a sound event — at most one every two minutes.
        val sinceLastSound = lastSoundEmitMs?.let { nowMs - it } ?: Long.MAX_VALUE
        if (level != SoundLevel.QUIET && sinceLastSound >= SOUND_RATE_LIMIT_MS) {
            lastSoundEmitMs = nowMs
            emissions += Emission(SignalEvent.Types.SOUND_EVENT, level.wireValue())
        }

        val night = isNightHour(hour)

        // Sustained quiet at night: she has settled. Once per night.
        if (night && level == SoundLevel.QUIET &&
            quietStreak >= ASLEEP_QUIET_WINDOWS &&
            asleepNightKey != nightKey
        ) {
            asleepNightKey = nightKey
            phase = Phase.ASLEEP
            emissions += Emission(SignalEvent.Types.SLEEP_EVENT, SignalEvent.SleepValues.ASLEEP)
        }

        // Minutes of steady noise while asleep: a restless stretch. Once per night.
        if (night && phase == Phase.ASLEEP &&
            noiseStreak >= RESTLESS_NOISE_WINDOWS &&
            restlessNightKey != nightKey
        ) {
            restlessNightKey = nightKey
            emissions += Emission(SignalEvent.Types.SLEEP_EVENT, SignalEvent.SleepValues.RESTLESS)
        }

        // Sustained loudness while asleep: she is likely up. Once per night.
        if (phase == Phase.ASLEEP && loudStreak >= WOKE_LOUD_WINDOWS && wokeNightKey != nightKey) {
            wokeNightKey = nightKey
            phase = Phase.AWAKE
            emissions += Emission(SignalEvent.Types.SLEEP_EVENT, SignalEvent.SleepValues.WOKE)
        }

        // Morning has come while she was judged asleep.
        if (!night && hour < MORNING_END_HOUR && phase == Phase.ASLEEP && awakeNightKey != nightKey) {
            awakeNightKey = nightKey
            phase = Phase.AWAKE
            emissions += Emission(SignalEvent.Types.SLEEP_EVENT, SignalEvent.SleepValues.AWAKE)
        }

        return emissions
    }

    /** The watch is ending (toggle, battery, morning): close an open night. */
    fun onStopped(nowMs: Long): Emission? {
        val nightKey = nightKeyFor(nowMs)
        if (phase == Phase.ASLEEP && awakeNightKey != nightKey) {
            awakeNightKey = nightKey
            phase = Phase.AWAKE
            return Emission(SignalEvent.Types.SLEEP_EVENT, SignalEvent.SleepValues.AWAKE)
        }
        return null
    }

    fun hourOf(nowMs: Long): Int =
        LocalDateTime.ofInstant(Instant.ofEpochMilli(nowMs), zone).hour

    /**
     * Which night "owns" this moment: evenings (21:00+) belong to today's date,
     * the small hours belong to yesterday's — so "once per night" survives
     * midnight rollover.
     */
    fun nightKeyFor(nowMs: Long): String {
        val moment = LocalDateTime.ofInstant(Instant.ofEpochMilli(nowMs), zone)
        val date = if (moment.hour >= NIGHT_START_HOUR) {
            moment.toLocalDate()
        } else {
            moment.toLocalDate().minusDays(1)
        }
        return date.toString()
    }

    fun isNightHour(hour: Int): Boolean = hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR

    private fun SoundLevel.wireValue(): String = when (this) {
        SoundLevel.QUIET -> SignalEvent.SoundValues.QUIET
        SoundLevel.NOISE -> SignalEvent.SoundValues.NOISE
        SoundLevel.LOUD -> SignalEvent.SoundValues.LOUD
    }

    companion object {
        const val NIGHT_START_HOUR = 21
        const val NIGHT_END_HOUR = 7
        const val MORNING_END_HOUR = 12

        /** 120 windows of 5 s = 10 minutes of sustained quiet → asleep. */
        const val ASLEEP_QUIET_WINDOWS = 120

        /** 24 windows of 5 s = 2 minutes of steady noise → restless. */
        const val RESTLESS_NOISE_WINDOWS = 24

        /** 6 windows of 5 s = 30 seconds of loudness → woke. */
        const val WOKE_LOUD_WINDOWS = 6

        const val SOUND_RATE_LIMIT_MS = 2 * 60 * 1000L

        /** One classification window. */
        const val WINDOW_MS = 5_000L
    }
}
