package com.khayaal.app.voice

/**
 * Pure grammar for "Hey Khayaal" — no Android imports, fully unit-testable.
 * Grammar-free recognition: any transcript arrives here; it only becomes a
 * command if the wake word is present and a known phrase follows.
 *
 * Understood (case-insensitive, Hinglish or English):
 *   - "<wake> call <name>"      → call the matching callOrder contact
 *   - "<wake> main theek hoon" / "I am OK" / "I'm OK" → post a check-in
 *   - "<wake> status" / "kaisi ho" / "kaise ho" → read the status aloud
 */
object VoiceCommandParser {

    sealed interface Command {
        /** Call a contact by name; [name] is empty when unmatched → plain dialer. */
        data class Call(val name: String) : Command
        data object CheckIn : Command
        data object ReadStatus : Command
        data object None : Command
    }

    /** A dial target: first name (as spoken) and the number. */
    data class Contact(val name: String, val phone: String)

    private val WAKE_WORDS = listOf(
        "khayaal", "khayal", "khyal", "खयाल", "ख़याल", "ख्याल",
    )

    private val CALL_WORDS = listOf("call", "phone", "dial", "फोन", "कॉल")

    private val CHECKIN_PHRASES = listOf(
        "theek hoon", "theek hu", "thik hoon", "ठीक हूँ", "ठीक हुँ",
        "i am ok", "i'm ok", "im ok", "i am okay", "i'm okay",
    )

    private val STATUS_PHRASES = listOf(
        "status", "kaisi ho", "kaise ho", "kaisi hu", "kaise hain",
        "how am i", "how is my status",
    )

    fun hasWakeWord(transcript: String): Boolean {
        val text = normalize(transcript)
        return WAKE_WORDS.any { text.contains(it) }
    }

    fun parse(transcript: String): Command {
        val text = normalize(transcript)
        if (WAKE_WORDS.none { text.contains(it) }) return Command.None

        if (CHECKIN_PHRASES.any { text.contains(it) }) return Command.CheckIn

        if (CALL_WORDS.any { text.contains(it) }) {
            return Command.Call("") // contact matching happens against the live callOrder
        }

        if (STATUS_PHRASES.any { text.contains(it) }) return Command.ReadStatus

        return Command.None
    }

    /** Fuzzy contact match: any word of the spoken name appears in the contact's name. */
    fun matchContact(transcript: String, contacts: List<Contact>): Contact? {
        val text = normalize(transcript)
        if (text.isBlank()) return null
        return contacts
            .map { contact ->
                val spoken = normalize(contact.name)
                val words = spoken.split(Regex("\\s+")).filter { it.length >= 2 }
                val hit = words.any { text.contains(it) }
                contact to hit
            }
            .firstOrNull { it.second }
            ?.first
    }

    /**
     * Turns "call amma" + matched contact into a resolved command. Returns the
     * original command untouched when there is nothing to resolve.
     */
    fun resolve(transcript: String, contacts: List<Contact>): Command {
        val command = parse(transcript)
        if (command !is Command.Call) return command
        val contact = matchContact(transcript, contacts)
        return Command.Call(contact?.phone.orEmpty())
    }

    private fun normalize(raw: String): String = raw.lowercase().trim()
}
