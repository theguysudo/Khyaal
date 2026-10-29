package com.khayaal.shared.alarm

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SosPushPayloadTest {

    @Test
    fun `parses the contract payload`() {
        val push = SosPushPayload.parse(
            mapOf(
                "type" to "sos_alarm",
                "householdId" to "hh_123",
                "sosId" to "sos_abc",
                "origin" to "button",
                "ts" to "1730000000000",
            ),
        )
        assertEquals("hh_123", push?.householdId)
        assertEquals("sos_abc", push?.sosId)
        assertEquals("button", push?.origin)
        assertEquals(1_730_000_000_000L, push?.ts)
    }

    @Test
    fun `origin auto is accepted`() {
        val push = SosPushPayload.parse(mapOf("type" to "sos_alarm", "householdId" to "hh", "origin" to "auto"))
        assertEquals("auto", push?.origin)
    }

    @Test
    fun `non-sos messages are ignored`() {
        assertNull(SosPushPayload.parse(mapOf("type" to "tier", "tier" to "3")))
        assertNull(SosPushPayload.parse(emptyMap()))
    }

    @Test
    fun `a push without a household id is rejected`() {
        assertNull(SosPushPayload.parse(mapOf("type" to "sos_alarm", "sosId" to "sos_1")))
    }

    @Test
    fun `missing optional fields survive`() {
        val push = SosPushPayload.parse(mapOf("type" to "sos_alarm", "householdId" to "hh"))
        assertEquals("hh", push?.householdId)
        assertEquals("", push?.sosId)
        assertNull(push?.origin)
        assertNull(push?.ts)
    }

    @Test
    fun `a malformed timestamp degrades to null, not an exception`() {
        val push = SosPushPayload.parse(mapOf("type" to "sos_alarm", "householdId" to "hh", "ts" to "not-a-number"))
        assertNull(push?.ts)
    }

    @Test
    fun `an unknown origin survives as null, not a crash`() {
        val push = SosPushPayload.parse(mapOf("type" to "sos_alarm", "householdId" to "hh", "origin" to "telepathy"))
        assertNull(push?.origin)
    }
}
