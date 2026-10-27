package com.khayaal.app

import com.khayaal.app.voice.VoiceCommandParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** "Hey Khayaal": wake word required, phrases map to actions, contacts match loosely. */
class VoiceCommandParserTest {

    private val contacts = listOf(
        VoiceCommandParser.Contact("Aditya Sharma", "+919000000001"),
        VoiceCommandParser.Contact("Amma", "+919000000002"),
        VoiceCommandParser.Contact("Meera Aunty", "+919000000003"),
    )

    @Test
    fun `no wake word means no command`() {
        assertEquals(VoiceCommandParser.Command.None, VoiceCommandParser.parse("what time is it"))
        assertFalse(VoiceCommandParser.hasWakeWord("call amma"))
    }

    @Test
    fun `wake word alone does nothing`() {
        assertEquals(VoiceCommandParser.Command.None, VoiceCommandParser.parse("khayaal"))
        assertEquals(VoiceCommandParser.Command.None, VoiceCommandParser.parse("hey khayaal"))
    }

    @Test
    fun `call phrases resolve to the matching contact phone`() {
        val command = VoiceCommandParser.resolve("khayaal call aditya", contacts)

        assertEquals(VoiceCommandParser.Command.Call("+919000000001"), command)
    }

    @Test
    fun `call without a matching contact dials the plain dialer`() {
        val command = VoiceCommandParser.resolve("khayaal call ramesh", contacts)

        assertEquals(VoiceCommandParser.Command.Call(""), command)
    }

    @Test
    fun `main theek hoon posts a check-in`() {
        assertEquals(VoiceCommandParser.Command.CheckIn, VoiceCommandParser.parse("khayaal main theek hoon"))
        assertEquals(VoiceCommandParser.Command.CheckIn, VoiceCommandParser.parse("hey khayaal I am ok"))
    }

    @Test
    fun `status phrases read the status aloud`() {
        assertEquals(VoiceCommandParser.Command.ReadStatus, VoiceCommandParser.parse("khayaal status"))
        assertEquals(VoiceCommandParser.Command.ReadStatus, VoiceCommandParser.parse("khayaal kaisi ho"))
        assertEquals(VoiceCommandParser.Command.ReadStatus, VoiceCommandParser.parse("Khayaal, how am I"))
    }

    @Test
    fun `checkin wins when phrases overlap`() {
        // "theek hoon" must not be eaten by the "call" branch even if both appear.
        assertEquals(VoiceCommandParser.Command.CheckIn, VoiceCommandParser.parse("khayaal call me main theek hoon"))
    }

    @Test
    fun `contact matching tolerates partial and multi-word names`() {
        assertEquals("+919000000002", VoiceCommandParser.matchContact("khayaal call amma", contacts)?.phone)
        assertEquals("+919000000003", VoiceCommandParser.matchContact("khayaal call meera", contacts)?.phone)
        assertNull(VoiceCommandParser.matchContact("khayaal call", contacts))
    }

    @Test
    fun `case does not matter`() {
        assertEquals(VoiceCommandParser.Command.ReadStatus, VoiceCommandParser.parse("KHAYAAL STATUS"))
        assertTrue(VoiceCommandParser.hasWakeWord("Khayaal, please help"))
    }
}
