package com.khayaal.app

import com.khayaal.app.ui.assistant.AssistantTasks
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDateTime

/**
 * The grammar behind "Khayaal also does things". Pure Kotlin, so the whole
 * vocabulary is tested without a phone.
 */
class AssistantTasksTest {

    private val noon = LocalDateTime.of(2026, 3, 14, 12, 0)

    @Test
    fun `i am ok is a check in`() {
        assertEquals(AssistantTasks.Task.CheckIn, AssistantTasks.parse("I'm OK", noon))
    }

    @Test
    fun `hindi check in is a check in`() {
        assertEquals(AssistantTasks.Task.CheckIn, AssistantTasks.parse("main theek hoon", noon))
    }

    @Test
    fun `status is read out`() {
        assertEquals(AssistantTasks.Task.ReadStatus, AssistantTasks.parse("what is my status", noon))
    }

    @Test
    fun `steps are read out`() {
        assertEquals(AssistantTasks.Task.ReadSteps, AssistantTasks.parse("how many steps today?", noon))
    }

    @Test
    fun `medicine asks for the next reminder`() {
        assertEquals(AssistantTasks.Task.NextMedicine, AssistantTasks.parse("what medicine is next", noon))
    }

    @Test
    fun `call family opens the plain dialer`() {
        val task = AssistantTasks.parse("call family", noon)
        assertTrue(task is AssistantTasks.Task.Call)
        assertEquals("", (task as AssistantTasks.Task.Call).name)
    }

    @Test
    fun `call with a name keeps the name`() {
        val task = AssistantTasks.parse("call Aditya", noon)
        assertTrue(task is AssistantTasks.Task.Call)
        assertEquals("aditya", (task as AssistantTasks.Task.Call).name)
    }

    @Test
    fun `a joke is not a local task`() {
        assertEquals(AssistantTasks.Task.None, AssistantTasks.parse("tell me a joke", noon))
    }

    @Test
    fun `a reminder with minutes is scheduled`() {
        val task = AssistantTasks.parse("remind me to take my tablets in 20 minutes", noon)
        assertTrue(task is AssistantTasks.Task.SetReminder)
        val reminder = task as AssistantTasks.Task.SetReminder
        assertEquals(noon.plusMinutes(20), reminder.at)
        assertEquals("take my tablets", reminder.text)
    }

    @Test
    fun `a reminder with hours is scheduled`() {
        val task = AssistantTasks.parse("remind me to water the plants in 2 hours", noon)
        assertEquals(noon.plusHours(2), (task as AssistantTasks.Task.SetReminder).at)
    }

    @Test
    fun `a reminder at a clock time rolls to tomorrow when it has passed`() {
        val task = AssistantTasks.parse("remind me to take the tablets at 9 am", noon)
        val at = (task as AssistantTasks.Task.SetReminder).at
        assertEquals(9, at.hour)
        assertEquals(noon.toLocalDate().plusDays(1), at.toLocalDate())
    }

    @Test
    fun `a reminder tonight is at eight`() {
        val task = AssistantTasks.parse("remind me to lock the door tonight", noon)
        assertEquals(20, (task as AssistantTasks.Task.SetReminder).at.hour)
    }

    @Test
    fun `a reminder without a time asks for the time`() {
        val task = AssistantTasks.parse("remind me to take my tablets", noon)
        assertTrue(task is AssistantTasks.Task.ReminderWithoutTime)
        assertTrue("expected the tablets in the text",
            (task as AssistantTasks.Task.ReminderWithoutTime).text.contains("tablets"))
    }
}
