package com.khayaal.neighbour

import com.khayaal.neighbour.data.api.NeighbourBundleDto
import com.khayaal.neighbour.data.api.SosStateDto
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The SOS wire contract and the state bundle shape, pinned — the NEIGHBOUR
 * shape, deliberately trimmed down: no events, no score, no learning flag.
 * The neighbour's phone never even parses health data, so it can never
 * display or leak it. Unknown fields (events, learning, …) are tolerated.
 */
class SosDtoTest {

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `parses a full sos block inside the bundle`() {
        val bundle = json.decodeFromString(
            NeighbourBundleDto.serializer(),
            """
            {"state":{"tier":3,"status":"Needs attention"},
             "household":{"id":"hh_1","parentName":"Amma",
                          "careCircle":[{"name":"Aditya","email":"a@b.c","phone":"9876500002","role":"family"}]},
             "events":[{"id":"e1","ts":1000,"type":"tier","meta":"Tier 2 → 3"}],
             "sos":{"active":true,"origin":"button","sinceTs":1730000000000,
                    "ack":{"by":"Aditya","ts":1730000001000}}}
            """.trimIndent(),
        )
        val sos = requireNotNull(bundle.sos)
        assertTrue(sos.active)
        assertTrue(sos.originButton)
        assertEquals("Amma", bundle.household?.parentName)
        assertEquals(1, bundle.household?.careCircle?.size)
        assertEquals("9876500002", bundle.household?.careCircle?.first()?.phone)
        assertEquals(3, bundle.state?.tier)
    }

    @Test
    fun `a backend without sos parses cleanly`() {
        val bundle = json.decodeFromString(
            NeighbourBundleDto.serializer(),
            """{"state":{"tier":0,"status":"All well"},"simNowTs":1,"realNowTs":1}""",
        )
        assertNull(bundle.sos)
        assertEquals(0, bundle.state?.tier)
    }

    @Test
    fun `unknown sos fields are tolerated`() {
        val sos = json.decodeFromString(
            SosStateDto.serializer(),
            """{"active":false,"origin":null,"sinceTs":null,"ack":null,"sosId":"sos_1"}""",
        )
        assertFalse(sos.active)
        assertFalse(sos.originAuto)
    }
}
