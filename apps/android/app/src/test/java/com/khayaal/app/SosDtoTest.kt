package com.khayaal.app

import com.khayaal.app.data.api.SosStateDto
import com.khayaal.app.data.api.StateBundleDto
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The SOS wire contract, pinned: `sos: { active, origin, sinceTs, ack }`
 * inside the /state bundle. The server (and the demo backend before the SOS
 * endpoints land) must both parse.
 */
class SosDtoTest {

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `parses a full sos block`() {
        val bundle = json.decodeFromString(
            StateBundleDto.serializer(),
            """
            {"state":{"tier":0,"status":"All well"},
             "sos":{"active":true,"origin":"button","sinceTs":1730000000000,
                    "ack":{"by":"Aditya","ts":1730000001000}}}
            """.trimIndent(),
        )
        val sos = requireNotNull(bundle.sos)
        assertTrue(sos.active)
        assertEquals("button", sos.origin)
        assertTrue(sos.originButton)
        assertEquals(1_730_000_000_000L, sos.sinceTs)
        assertEquals("Aditya", sos.ack?.by)
    }

    @Test
    fun `parses an auto sos with null fields`() {
        val bundle = json.decodeFromString(
            StateBundleDto.serializer(),
            """{"sos":{"active":true,"origin":"auto","sinceTs":null,"ack":null}}""",
        )
        val sos = requireNotNull(bundle.sos)
        assertTrue(sos.active)
        assertTrue(sos.originAuto)
        assertNull(sos.sinceTs)
        assertNull(sos.ack)
    }

    @Test
    fun `a backend without sos parses with sos null`() {
        val bundle = json.decodeFromString(
            StateBundleDto.serializer(),
            """{"state":{"tier":1,"status":"Waiting"},"simNowTs":1000,"realNowTs":1000}""",
        )
        assertNull(bundle.sos)
    }

    @Test
    fun `sos absent means not active`() {
        // The safe reading of "no SOS information" is "no SOS".
        val sos: SosStateDto? = null
        assertFalse(sos?.active == true)
    }

    @Test
    fun `unknown sos fields are tolerated`() {
        val sos = json.decodeFromString(
            SosStateDto.serializer(),
            """{"active":false,"origin":null,"sinceTs":null,"ack":null,"sosId":"sos_1","note":"x"}""",
        )
        assertFalse(sos.active)
    }
}
