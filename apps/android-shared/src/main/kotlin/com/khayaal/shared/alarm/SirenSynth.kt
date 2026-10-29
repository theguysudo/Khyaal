package com.khayaal.shared.alarm

import kotlin.math.PI
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * The SOS siren waveform, generated on the fly — no asset, no download, no
 * asset to forget. Kept free of Android classes so it can be unit-tested.
 *
 * The sound is a classic two-second "whoop": the pitch glides up from 600 Hz
 * to 1150 Hz and back down, with a little second harmonic for edge. The
 * phase is integrated from the frequency itself, so the loop point is
 * seamless — a listener cannot hear where the buffer restarts.
 *
 * The [SirenPlayer] feeds this into an AudioTrack on the ALARM stream at max
 * volume. It must be unmistakable in another room; it is also deliberately
 * *not* a recording of a real emergency siren, which would be both legally
 * fraught and less locally distinctive than a sound that only ever means
 * "someone in this household needs help".
 */
object SirenSynth {

    const val SAMPLE_RATE = 22_050

    /** Length of one up-and-down sweep, in seconds. The player loops this. */
    const val SWEEP_SECONDS = 2.0

    const val FREQ_LOW_HZ = 600.0
    const val FREQ_HIGH_HZ = 1_150.0

    /** Peak amplitude as a fraction of full scale — loud, but zero clipping. */
    const val PEAK = 0.85

    /**
     * One seamless sweep of the siren, PCM 16-bit mono at [SAMPLE_RATE].
     * Deterministic: the same call always returns the same samples.
     *
     * The free-running phase integral does not land exactly on a whole number
     * of cycles, which would make the loop point click. The glide is
     * therefore micro-tuned (well under a hundredth of a semitone) so the
     * accumulated phase closes on an exact multiple of 2π — the buffer loops
     * with no discontinuity at all.
     */
    fun sweep(): ShortArray {
        val frames = (SAMPLE_RATE * SWEEP_SECONDS).toInt()

        // Pass 1: how much phase does the free-running glide accumulate?
        var totalPhase = 0.0
        for (i in 0 until frames) {
            totalPhase += 2.0 * PI * frequencyAt(i.toDouble() / SAMPLE_RATE) / SAMPLE_RATE
        }
        // Pass 2: stretch it onto the nearest whole number of cycles.
        val cycles = (totalPhase / (2.0 * PI)).let { if (it < 1.0) 1.0 else it.roundToInt().toDouble() }
        val tune = cycles * 2.0 * PI / totalPhase

        val out = ShortArray(frames)
        var phase = 0.0
        for (i in 0 until frames) {
            val fundamental = sin(phase)
            val harmonic = 0.25 * sin(2.0 * phase)
            val sample = PEAK * (fundamental + harmonic) / 1.25
            out[i] = (sample * Short.MAX_VALUE).toInt().toShort()
            val t = i.toDouble() / SAMPLE_RATE
            phase += 2.0 * PI * frequencyAt(t) * tune / SAMPLE_RATE
        }
        return out
    }

    /**
     * The sweep's instantaneous frequency: a triangle glide up, then back
     * down, once per [SWEEP_SECONDS]. Public so tests can check the extremes.
     */
    fun frequencyAt(t: Double): Double {
        val half = SWEEP_SECONDS / 2.0
        val progress = (t % SWEEP_SECONDS) / half // 0..2 across the sweep
        return if (progress < 1.0) {
            FREQ_LOW_HZ + (FREQ_HIGH_HZ - FREQ_LOW_HZ) * progress
        } else {
            FREQ_HIGH_HZ - (FREQ_HIGH_HZ - FREQ_LOW_HZ) * (progress - 1.0)
        }
    }
}
