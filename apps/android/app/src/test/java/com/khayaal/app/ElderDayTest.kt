package com.khayaal.app

import com.khayaal.app.commands.LocalReminder
import com.khayaal.app.data.api.CommandDto
import com.khayaal.app.ui.home.BatteryLine
import com.khayaal.app.ui.home.DaySummary
import com.khayaal.app.ui.home.ReminderDue
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The pure logic behind the elder app's reassurance features: the due
 * reminder with the big Done, the battery line, and the day read aloud.
 */
class ElderDayTest {

    private fun command(
        id: String,
        text: String,
        ts: Long,
        type: String = CommandDto.Types.REMINDER,
        lang: String? = null,
    ) = CommandDto(id = id, type = type, text = text, ts = ts, lang = lang)

    // -- ReminderDue -----------------------------------------------------------

    @Test
    fun `a reminder that has come due is surfaced`() {
        val now = 1_000_000L
        val due = ReminderDue.next(
            commands = listOf(command("c1", "Blood pressure tablet", now - 60_000)),
            localReminders = emptyList(),
            nowMs = now,
            dismissedIds = emptySet(),
        )
        assertEquals("Blood pressure tablet", due?.text)
        assertTrue(due!!.fromFamily)
    }

    @Test
    fun `a future reminder never surfaces`() {
        val now = 1_000_000L
        assertNull(
            ReminderDue.next(
                commands = listOf(command("c1", "Evening walk", now + 600_000)),
                localReminders = emptyList(),
                nowMs = now,
                dismissedIds = emptySet(),
            ),
        )
    }

    @Test
    fun `a dismissed reminder stays gone`() {
        val now = 1_000_000L
        assertNull(
            ReminderDue.next(
                commands = listOf(command("c1", "Blood pressure tablet", now - 60_000)),
                localReminders = emptyList(),
                nowMs = now,
                dismissedIds = setOf("c1"),
            ),
        )
    }

    @Test
    fun `when two are due the newest wins`() {
        val now = 1_000_000L
        val due = ReminderDue.next(
            commands = listOf(
                command("c1", "Morning tablet", now - 3 * 60 * 60_000),
                command("c2", "Call Aditya back", now - 60_000),
            ),
            localReminders = emptyList(),
            nowMs = now,
            dismissedIds = emptySet(),
        )
        assertEquals("Call Aditya back", due?.text)
    }

    @Test
    fun `fired local reminders join the same queue`() {
        val now = 1_000_000L
        val due = ReminderDue.next(
            commands = emptyList(),
            localReminders = listOf(
                LocalReminder(id = "l1", text = "Water the plants", atMs = now - 30_000, fired = true),
                LocalReminder(id = "l2", text = "Not yet fired", atMs = now - 30_000, fired = false),
            ),
            nowMs = now,
            dismissedIds = emptySet(),
        )
        assertEquals("Water the plants", due?.text)
        assertFalse(due!!.fromFamily)
    }

    @Test
    fun `plain messages are never reminders`() {
        val now = 1_000_000L
        assertNull(
            ReminderDue.next(
                commands = listOf(command("c1", "How are you?", now - 60_000, type = CommandDto.Types.MESSAGE)),
                localReminders = emptyList(),
                nowMs = now,
                dismissedIds = emptySet(),
            ),
        )
    }

    @Test
    fun `local reminders not yet fired are invisible`() {
        val now = 1_000_000L
        assertNull(
            ReminderDue.next(
                commands = emptyList(),
                localReminders = listOf(
                    LocalReminder(id = "l1", text = "Tea time", atMs = now + 60_000, fired = false),
                ),
                nowMs = now,
                dismissedIds = emptySet(),
            ),
        )
    }

    // -- BatteryLine -----------------------------------------------------------

    @Test
    fun `charging always reads as charging`() {
        assertEquals(BatteryLine.Tone.CHARGING, BatteryLine.tone(15, charging = true))
        assertEquals(BatteryLine.Tone.CHARGING, BatteryLine.tone(100, charging = true))
    }

    @Test
    fun `low begins at twenty percent`() {
        assertEquals(BatteryLine.Tone.LOW, BatteryLine.tone(20, charging = false))
        assertEquals(BatteryLine.Tone.GOOD, BatteryLine.tone(21, charging = false))
        assertEquals(BatteryLine.Tone.FULL, BatteryLine.tone(95, charging = false))
    }

    @Test
    fun `an unknown level stays unknown`() {
        assertEquals(BatteryLine.Tone.UNKNOWN, BatteryLine.tone(null, charging = false))
    }

    // -- DaySummary ------------------------------------------------------------

    @Test
    fun `a full day reads as one calm paragraph`() {
        val spoken = DaySummary.compose(
            herName = "Amma",
            greeting = "Good morning",
            status = "Amma is doing fine.",
            nextReminderText = "Blood pressure tablet",
            nextReminderClock = "14:00",
            stepsToday = 2_436,
            charging = true,
        )
        assertTrue(spoken.startsWith("Good morning, Amma."))
        assertTrue(spoken.contains("doing fine"))
        assertTrue(spoken.contains("Next: Blood pressure tablet at 14:00"))
        assertTrue(spoken.contains("2,436 steps"))
        assertTrue(spoken.endsWith("The phone is on charge — all good."))
    }

    @Test
    fun `a day with no data still reads, briefly`() {
        val spoken = DaySummary.compose(
            herName = "",
            greeting = "Good evening",
            status = null,
            nextReminderText = null,
            nextReminderClock = null,
            stepsToday = null,
            charging = false,
        )
        assertEquals("Good evening.", spoken)
    }

    @Test
    fun `not charging is silence, not news`() {
        val spoken = DaySummary.compose(
            herName = "Amma",
            greeting = "Good evening",
            status = "All well",
            nextReminderText = null,
            nextReminderClock = null,
            stepsToday = 0,
            charging = false,
        )
        assertFalse(spoken.contains("charge"))
        assertFalse(spoken.contains("steps")) // zero steps are not worth saying
    }
}
