package com.khayaal.family

import com.khayaal.family.data.api.FamilyBundleDto
import com.khayaal.family.data.api.SosStateDto
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The SOS wire contract and the state bundle shape, pinned. */
class SosDtoTest {

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `parses a full sos block inside the bundle`() {
        val bundle = json.decodeFromString(
            FamilyBundleDto.serializer(),
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
        assertEquals("Tier 2 → 3", bundle.events.first().meta)
    }

    @Test
    fun `a backend without sos or events parses cleanly`() {
        val bundle = json.decodeFromString(
            FamilyBundleDto.serializer(),
            """{"state":{"tier":0,"status":"All well"},"simNowTs":1,"realNowTs":1}""",
        )
        assertNull(bundle.sos)
        assertTrue(bundle.events.isEmpty())
        assertFalse(bundle.state?.learning ?: true)
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
