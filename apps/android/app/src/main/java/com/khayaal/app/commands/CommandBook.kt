package com.khayaal.app.commands

/**
 * Pure dedupe + ack bookkeeping for the family→app commands channel, keyed by
 * the command id. The ids live in DataStore (see PairingStore) so a reboot or
 * a process death never re-notifies a command she has already seen, and acks
 * are retried until the backend confirms.
 */
data class CommandBook(
    val seenIds: Set<String> = emptySet(),
    val ackedIds: Set<String> = emptySet(),
) {

    /** Commands this phone has never surfaced before (blank ids are ignored). */
    fun unseen(commands: List<com.khayaal.app.data.api.CommandDto>) =
        commands.filter { it.id.isNotBlank() && it.id !in seenIds }

    /** Commands the backend has not yet confirmed as acknowledged. */
    fun unacked(commands: List<com.khayaal.app.data.api.CommandDto>) =
        commands.filter { it.id.isNotBlank() && it.id !in ackedIds }

    fun withSeen(ids: Collection<String>): CommandBook =
        copy(seenIds = trim(seenIds + ids.filter { it.isNotBlank() }))

    fun withAcked(id: String): CommandBook =
        if (id.isBlank()) this else copy(ackedIds = trim(ackedIds + id))

    companion object {
        /** The bounded memory of the past — old ids fall off the back. */
        const val CAP = 200
        const val HISTORY_CAP = 30

        fun trim(ids: Set<String>): Set<String> = ids.takeLast(CAP).toSet()
    }
}
