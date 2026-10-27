package com.khayaal.app

import com.khayaal.app.commands.CommandBook
import com.khayaal.app.data.api.CommandDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The commands channel must never re-surface a command she has already seen. */
class CommandBookTest {

    private fun command(id: String, text: String = "Take your medicine") =
        CommandDto(id = id, type = CommandDto.Types.REMINDER, text = text, ts = 1)

    @Test
    fun `unseen filters out ids already surfaced`() {
        val book = CommandBook(seenIds = setOf("a"), ackedIds = emptySet())

        val fresh = book.unseen(listOf(command("a"), command("b")))

        assertEquals(listOf("b"), fresh.map { it.id })
    }

    @Test
    fun `blank ids are never tracked`() {
        val book = CommandBook()

        assertTrue(book.unseen(listOf(command(""))).isEmpty())
        assertTrue(book.unacked(listOf(command(""))).isEmpty())
    }

    @Test
    fun `marking seen is stable across copies`() {
        val book = CommandBook().withSeen(listOf("a", "b"))

        assertTrue(book.unseen(listOf(command("a"), command("b"))).isEmpty())
        assertEquals(setOf("a", "b"), book.seenIds)
    }

    @Test
    fun `acks are tracked separately from seen`() {
        val book = CommandBook().withSeen(listOf("a")).withAcked("a")

        assertTrue(book.unseen(listOf(command("a"))).isEmpty())
        assertTrue(book.unacked(listOf(command("a"))).isEmpty())
        assertEquals(setOf("a"), book.ackedIds)
    }

    @Test
    fun `pending acks survive until confirmed`() {
        val book = CommandBook(seenIds = setOf("a", "b"), ackedIds = setOf("a"))

        val pending = book.unacked(listOf(command("a"), command("b")))

        assertEquals(listOf("b"), pending.map { it.id })
    }

    @Test
    fun `the memory is bounded — oldest ids fall off the back`() {
        val ids = (0 until CommandBook.CAP + 50).map { "cmd-$it" }
        val book = CommandBook().withSeen(ids)

        assertEquals(CommandBook.CAP, book.seenIds.size)
        // The oldest fifty are forgotten, the newest remain.
        assertTrue("cmd-0" !in book.seenIds)
        assertTrue("cmd-${CommandBook.CAP + 49}" in book.seenIds)
    }

    @Test
    fun `blank ids do not enter the book`() {
        val book = CommandBook().withSeen(listOf("", "  "))

        assertTrue(book.seenIds.isEmpty())
    }
}
