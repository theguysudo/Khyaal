package com.khayaal.family

import com.khayaal.family.ui.home.FamilyTime
import com.khayaal.family.ui.home.SosContacts
import com.khayaal.family.data.api.CareCircleMemberDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FamilyTimeTest {

    @Test
    fun `ago speaks in minutes, hours and days`() {
        val now = 1_730_000_000_000L
        assertEquals("just now", FamilyTime.ago(now - 30_000, now))
        assertEquals("5 min ago", FamilyTime.ago(now - 5 * 60_000, now))
        assertEquals("3 h ago", FamilyTime.ago(now - 3 * 3_600_000, now))
        assertEquals("2 d ago", FamilyTime.ago(now - 2 * 86_400_000, now))
    }

    @Test
    fun `a future timestamp never reads negative`() {
        val now = 1_730_000_000_000L
        assertEquals("just now", FamilyTime.ago(now + 500_000, now))
    }
}

class SosContactsTest {

    @Test
    fun `only members with numbers are callable, family first`() {
        val circle = listOf(
            CareCircleMemberDto(name = "Neighbour Ravi", phone = "9876500001", role = "neighbor"),
            CareCircleMemberDto(name = "Aditya", phone = "9876500002", role = "family"),
            CareCircleMemberDto(name = "No phone", email = "x@y.z", role = "family"),
        )
        val callable = SosContacts.callable(circle)
        assertEquals(listOf("Aditya", "Neighbour Ravi"), callable.map { it.name })
    }

    @Test
    fun `duplicate numbers drop, keeping the first`() {
        val circle = listOf(
            CareCircleMemberDto(name = "Aditya", phone = "9876500002", role = "family"),
            CareCircleMemberDto(name = "Duplicate", phone = "9876500002", role = "family"),
        )
        assertEquals(1, SosContacts.callable(circle).size)
    }

    @Test
    fun `wa number keeps digits only`() {
        assertEquals("919876500002", SosContacts.waNumber("+91 98765-00002"))
    }
}
