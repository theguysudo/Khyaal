package com.khayaal.app.ui.home

import com.khayaal.app.commands.LocalReminder
import com.khayaal.app.data.api.CommandDto

/*
 * Three pieces of pure, unit-tested logic behind the elder app's
 * reassurance features (researched additions — see docs/DESIGN_SYSTEM.md and
 * the geriatric-UX sources in the dev log):
 *
 *  1. ReminderDue — the family's reminder that has come DUE, needing one big
 *     "Done". Research is blunt here: a reminder that pops up and disappears
 *     is a failure mode for older adults; the dismissal must be a large,
 *     deliberate tap on the same screen (ESEO Space; PreferHome's large-print
 *     / audio reminder guidance).
 *  2. BatteryLine — the battery as reassurance, not an alarm. A phone that
 *     dies silently takes the whole guardian system with it; the daily
 *     check-in apps (Snug & co.) all treat "charge the phone" as a core
 *     loop. The line is calm: charging → "all good", low → one gentle ask.
 *  3. DaySummary — the day read aloud, on one tap. For eyes that tire and
 *     hands that shake, TTS is the second channel every accessibility guide
 *     asks for (audio reminders; PreferHome; UDMIG's redundancy principle).
 */

/** The family reminder that has come due on her phone. */
object ReminderDue {

    data class Due(
        val id: String,
        val text: String,
        val dueTs: Long,
        /** "hi" | "en" — speak the dismissal flow in the language it arrived in. */
        val lang: String?,
        val fromFamily: Boolean,
    )

    /**
     * The one reminder to show now: the NEWEST family reminder/tts note that
     * has come due (ts ≤ [nowMs]) and is not locally dismissed. Locally-set
     * reminders join the same queue once they have fired (their notification
     * already rang; this card is the big, un-missable version). Nothing due
     * → null — the card disappears and the day stays quiet.
     */
    fun next(
        commands: List<CommandDto>,
        localReminders: List<LocalReminder>,
        nowMs: Long,
        dismissedIds: Set<String>,
    ): Due? {
        val fromFamily = commands
            .asSequence()
            .filter { it.type == CommandDto.Types.REMINDER || it.type == CommandDto.Types.TTS }
            .filter { it.ts <= nowMs }
            .filter { it.id !in dismissedIds }
            .map { Due(it.id, it.text, it.ts, it.lang, fromFamily = true) }
        val fromLocal = localReminders
            .asSequence()
            .filter { it.fired }
            .filter { it.atMs <= nowMs }
            .filter { it.id !in dismissedIds }
            .map { Due(it.id, it.text, it.atMs, lang = null, fromFamily = false) }
        return (fromFamily + fromLocal).maxByOrNull { it.dueTs }
    }

    /** "Later" — ten minutes of grace, as a locally-scheduled reminder. */
    const val SNOOZE_MS: Long = 10 * 60 * 1000L
}

/** The battery, phrased as reassurance. */
object BatteryLine {

    enum class Tone { CHARGING, FULL, GOOD, LOW, UNKNOWN }

    /**
     * [levelPct] 0–100, or null when the OS would not say. The thresholds are
     * deliberately calm: LOW begins at 20% — a warning, not a siren.
     */
    fun tone(levelPct: Int?, charging: Boolean): Tone = when {
        levelPct == null -> Tone.UNKNOWN
        charging -> Tone.CHARGING
        levelPct >= 95 -> Tone.FULL
        levelPct > 20 -> Tone.GOOD
        else -> Tone.LOW
    }
}

/** Her day, as one short spoken paragraph. */
object DaySummary {

    /**
     * Composes what Khayaal says when she taps "speak my day". Every part is
     * optional — a day with no data is still worth speaking. [status] is the
     * backend's own plain-language line ("Amma is doing fine").
     */
    fun compose(
        herName: String,
        greeting: String,
        status: String?,
        nextReminderText: String?,
        nextReminderClock: String?,
        stepsToday: Int?,
        charging: Boolean?,
    ): String = buildString {
        append(greeting)
        append(if (herName.isNotBlank()) ", $herName" else "")
        append(". ")
        if (!status.isNullOrBlank()) {
            append(status.trimEnd('.', ' '))
            append(". ")
        }
        if (nextReminderText != null) {
            append("Next: ")
            append(nextReminderText)
            if (nextReminderClock != null) append(" at ").append(nextReminderClock)
            append(". ")
        }
        if (stepsToday != null && stepsToday > 0) {
            append("You have walked ")
            append(String.format("%,d", stepsToday))
            append(" steps today. ")
        }
        when (charging) {
            true -> append("The phone is on charge — all good.")
            false -> Unit // not charging is not news; silence is kind here
            null -> Unit
        }
    }.trim()
}
