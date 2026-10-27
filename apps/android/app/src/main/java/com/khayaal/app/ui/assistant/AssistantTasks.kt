package com.khayaal.app.ui.assistant

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime

/**
 * What Khayaal can do, not just say.
 *
 * The chat is two doors: the ones that need the family's server (a joke, a
 * question, a conversation) and the ones that must work on this phone alone
 * (check in, call, read the status, set a reminder). The second kind is
 * decided here, on the phone, in plain words — so "Khayaal, call Aditya" or
 * "remind me to take my tablets in 20 minutes" works even when the network
 * is down.
 *
 * Pure Kotlin, no Android imports: the grammar is unit-tested.
 */
object AssistantTasks {

    sealed interface Task {
        /** "I'm OK" — tell the family she is fine. */
        data object CheckIn : Task

        /** "Call Aditya" — [name] is empty when she just says "call family". */
        data class Call(val name: String) : Task

        /** "How am I?" — read the status the backend already knows. */
        data object ReadStatus : Task

        /** "How many steps?" — today's step count from the phone's own sensor. */
        data object ReadSteps : Task

        /** "What medicine is next?" — the next reminder from the family. */
        data object NextMedicine : Task

        /** "Remind me to water the plants in 20 minutes." */
        data class SetReminder(val text: String, val at: LocalDateTime) : Task

        /**
         * "Remind me to water the plants." — she asked for a reminder but did
         * not say when. Khayaal asks her for the time rather than guessing.
         */
        data class ReminderWithoutTime(val text: String) : Task

        /** Nothing the phone can do by itself — the server should answer. */
        data object None : Task
    }

    private val CHECK_IN_PHRASES = listOf(
        "i'm ok", "i am ok", "im ok", "i am okay", "i'm okay", "im okay",
        "check in", "checkin", "check-in",
        "main theek hoon", "theek hoon", "theek hu", "thik hoon", "ठीक हूँ", "ठीक हुँ",
    )

    private val STATUS_PHRASES = listOf(
        "status", "how am i", "how am i doing", "kaisi ho", "kaise ho", "kaisi hu",
        "kaise hain", "am i okay",
    )

    private val STEPS_PHRASES = listOf(
        "steps", "step count", "how much have i walked", "walking today",
    )

    private val MEDICINE_PHRASES = listOf(
        "medicine", "medicines", "medication", "medications", "tablet", "tablets",
        "dawai", "दवाई",
    )

    private val CALL_WORDS = listOf("call ", "phone ", "dial ", "ring ")

    private val REMINDER_WORDS = listOf(
        "remind me", "remind", "reminder", "set a reminder", "yaad dilana", "yaad karao",
    )

    /** The name that follows "call", with the filler words stripped. */
    private val NAME_NOISE = listOf(
        "family", "the family", "my family", "someone", "somebody", "them", "everyone",
        "everyone at home", "help", "someone for me", "khayaal", "please", "my",
    )

    /**
     * Reads the sentence and decides what it means. The order is deliberate:
     * a reminder is checked before a call, because "call me in ten minutes"
     * is a reminder, not a phone call.
     */
    fun parse(text: String, now: LocalDateTime = LocalDateTime.now()): Task {
        val raw = text.trim().lowercase()
        if (raw.isEmpty()) return Task.None

        if (REMINDER_WORDS.any { raw.contains(it) }) {
            // A reminder word always means a reminder, even without a time —
            // otherwise "remind me to take my tablets" would be mistaken for a
            // question about the next medicine.
            val subject = reminderSubject(raw)
            val at = reminderTime(raw, now)
            return if (at != null) Task.SetReminder(subject, at) else Task.ReminderWithoutTime(subject)
        }

        if (CHECK_IN_PHRASES.any { raw.contains(it) }) return Task.CheckIn

        if (STATUS_PHRASES.any { raw.contains(it) }) return Task.ReadStatus

        if (STEPS_PHRASES.any { raw.contains(it) }) return Task.ReadSteps

        if (MEDICINE_PHRASES.any { raw.contains(it) }) return Task.NextMedicine

        for (word in CALL_WORDS) {
            val index = raw.indexOf(word)
            if (index >= 0) {
                val name = raw.substring(index + word.length)
                    .trim()
                    .trim('.', ',', '!', '?')
                val cleaned = name
                    .split(Regex("\\s+"))
                    .dropWhile { it in NAME_NOISE }
                    .joinToString(" ")
                    .trim()
                return Task.Call(cleaned)
            }
        }

        return Task.None
    }

    /**
     * Pulls a time out of the sentence: "in 20 minutes", "in 2 hours",
     * "at 5 pm", "tonight", "tomorrow morning". Returns null when the
     * sentence has no time in it — a reminder without a time is a guess, and
     * Khayaal does not guess.
     */
    fun reminderTime(text: String, now: LocalDateTime): LocalDateTime? = when {
        // "in 20 minutes" / "in 2 hours"
        IN_PATTERN.containsMatchIn(text) -> {
            val match = IN_PATTERN.find(text)!!
            val amount = match.groupValues[1].toLongOrNull() ?: 0L
            val unit = match.groupValues[2]
            now.plusMinutes(if (unit.startsWith("h")) amount * 60 else amount)
        }

        // "at 5 pm" / "at 17:30"
        AT_PATTERN.containsMatchIn(text) -> {
            val match = AT_PATTERN.find(text)!!
            val hour = match.groupValues[1].toIntOrNull() ?: 9
            val minute = match.groupValues[2].toIntOrNull() ?: 0
            val meridiem = match.groupValues[3]
            val targetHour = when {
                meridiem.equals("pm", true) && hour < 12 -> hour + 12
                meridiem.equals("am", true) && hour == 12 -> 0
                else -> hour
            }
            var candidate = now.toLocalDate().atTime(targetHour.coerceIn(0, 23), minute.coerceIn(0, 59))
            if (!candidate.isAfter(now)) candidate = candidate.plusDays(1)
            candidate
        }

        text.contains("tonight") -> now.toLocalDate().atTime(20, 0)
        text.contains("tomorrow morning") -> now.toLocalDate().plusDays(1).atTime(9, 0)
        text.contains("tomorrow evening") -> now.toLocalDate().plusDays(1).atTime(18, 0)
        text.contains("tomorrow") -> now.toLocalDate().plusDays(1).atTime(9, 0)
        text.contains("morning") -> now.toLocalDate().atTime(9, 0)
        text.contains("evening") -> now.toLocalDate().atTime(18, 0)
        text.contains("night") -> now.toLocalDate().atTime(20, 0)
        else -> null
    }

    /** The thing to be reminded about, with the timing words stripped out. */
    fun reminderSubject(text: String): String = text
        .replace(REMINDER_WORDS.first(), "")
        .replace(Regex("\\b(in|at|on|by)\\b"), " ")
        .replace(Regex("\\b(minutes?|mins?|hours?|hrs?|tomorrow|today|tonight|morning|evening|night)\\b"), " ")
        .replace(Regex("\\b(am|pm)\\b"), " ")
        .replace(Regex("[0-9]+"), " ")
        .replace(Regex("\\s+"), " ")
        .trim()
        .trim('.', ',', '!', '?')
        // "remind me to take my tablets" → "take my tablets" — the reply
        // already says "I'll remind you to …".
        .removePrefix("to ")
        .trim()
        .ifBlank { "your reminder" }

    private val IN_PATTERN = Regex("\\bin\\s+(\\d+)\\s*(minutes?|mins?|hours?|hrs?)\\b")
    private val AT_PATTERN = Regex("\\bat\\s+(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?\\b")
}
