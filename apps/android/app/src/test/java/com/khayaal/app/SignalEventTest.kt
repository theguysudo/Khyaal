package com.khayaal.app

import com.khayaal.app.data.api.ApiClient
import com.khayaal.app.signals.SignalEvent
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Pure-logic checks: URL normalization and the signal factory helpers. */
class SignalEventTest {

    @Test
    fun `base url always ends with a trailing slash`() {
        assertEquals("http://10.0.2.2:3100/", ApiClient.normalizeBaseUrl("http://10.0.2.2:3100"))
        assertEquals("http://10.0.2.2:3100/", ApiClient.normalizeBaseUrl("http://10.0.2.2:3100/"))
        assertEquals("http://10.0.2.2:3100/", ApiClient.normalizeBaseUrl(" http://10.0.2.2:3100// "))
    }

    @Test(expected = IllegalArgumentException::class)
    fun `blank base url is rejected`() {
        ApiClient.normalizeBaseUrl("   ")
    }

    @Test
    fun `signal factories carry the documented types and values`() {
        assertEquals("screen_event", SignalEvent.unlock().type)
        assertEquals(JsonPrimitive("unlock"), SignalEvent.unlock().value)

        assertEquals("motion", SignalEvent.motion().type)
        assertEquals(JsonPrimitive(1), SignalEvent.motion().value)

        assertEquals("charging", SignalEvent.charging(connected = true).type)
        assertEquals(JsonPrimitive(true), SignalEvent.charging(connected = true).value)

        assertEquals("location_zone", SignalEvent.presence(home = true).type)
        assertEquals(JsonPrimitive("home"), SignalEvent.presence(home = true).value)
        assertEquals(JsonPrimitive("away"), SignalEvent.presence(home = false).value)

        assertEquals("app_usage", SignalEvent.appUsage("com.whatsapp").type)
        assertEquals(JsonPrimitive("com.whatsapp"), SignalEvent.appUsage("com.whatsapp").value)
    }

    @Test
    fun `timestamps default to now`() {
        val before = System.currentTimeMillis()
        val event = SignalEvent.unlock()
        val after = System.currentTimeMillis()
        assertTrue(event.ts in before..after)
        assertFalse(event.ts == 0L)
    }

    @Test
    fun `queue serialization round-trips through json`() {
        val queueJson = listOf(
            SignalEvent.unlock(nowMs = 1),
            SignalEvent.charging(connected = false, nowMs = 2),
            SignalEvent.presence(home = true, nowMs = 3),
        )
        val encoded = kotlinx.serialization.json.Json.encodeToString(
            kotlinx.serialization.builtins.ListSerializer(SignalEvent.serializer()),
            queueJson,
        )
        val decoded = kotlinx.serialization.json.Json.decodeFromString(
            kotlinx.serialization.builtins.ListSerializer(SignalEvent.serializer()),
            encoded,
        )
        assertEquals(queueJson, decoded)
    }

    @Test
    fun `score null during learning parses as null`() {
        val json = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }
        val state = json.decodeFromString(
            com.khayaal.app.data.api.StateDto.serializer(),
            """{"score":null,"tier":0,"status":"Khayaal is learning","learning":true,"extraField":9}""",
        )
        assertNull(state.scoreValue)
        assertTrue(state.learning)
        assertEquals(0, state.tier)
    }
}
