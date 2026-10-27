package com.khayaal.app.signals

/**
 * Pure step-accounting for the TYPE_STEP_COUNTER sensor (cumulative since the
 * last boot). Two quirks to survive:
 *
 *  - the counter resets to 0 when the device reboots — a drop means "rebase",
 *    never "negative steps";
 *  - the value we post is the *daily* delta (steps so far today), so the
 *    accumulator resets at local midnight.
 *
 * Free of Android imports so the edge cases are unit-testable.
 */
class StepsAccumulator(
    var day: String? = null,
    var dayTotal: Long = 0,
    var lastCumulative: Double = -1.0,
) {

    data class Outcome(
        /** Steps taken so far today — the value posted on the wire. */
        val dayTotal: Long,
        /** True when the total moved (worth a signal). */
        val changed: Boolean,
        /** True when the sensor was rebased after a reboot. */
        val rebased: Boolean,
    )

    fun onSample(cumulative: Double, today: String): Outcome {
        var rebased = false
        if (lastCumulative >= 0 && cumulative < lastCumulative) {
            // The phone rebooted; the counter restarted. Anchor here, lose nothing.
            lastCumulative = cumulative
            rebased = true
        }
        val delta = if (lastCumulative < 0) 0.0 else cumulative - lastCumulative
        lastCumulative = cumulative

        if (day != today) {
            day = today
            dayTotal = 0
        }
        if (delta > 0) dayTotal += delta.toLong()

        return Outcome(dayTotal = dayTotal, changed = delta > 0 || rebased, rebased = rebased)
    }
}
