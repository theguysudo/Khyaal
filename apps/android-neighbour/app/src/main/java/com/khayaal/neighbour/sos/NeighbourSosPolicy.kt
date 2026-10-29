package com.khayaal.neighbour.sos

/**
 * The neighbour's ring-decision table — pure and unit-tested, because getting
 * this wrong either wakes a street at 3 a.m. for nothing or sleeps through a
 * real emergency.
 *
 * Rules, in order:
 *  1. SOS inactive → stop ringing (or nothing if not ringing). Off-duty never
 *     suppresses a STOP.
 *  2. Off duty → never START. The phone stays quiet; the server is not told
 *     (availability is the neighbour's private choice — see NeighbourStore).
 *  3. Already ringing → nothing (the 2 s poll must not re-trigger).
 *  4. Silenced for THIS SOS ("Silence for me") → nothing, keyed on the SOS's
 *     sinceTs. A NEW SOS (different sinceTs) rings again even after a silence.
 *  5. Otherwise → START.
 */
object NeighbourSosPolicy {

    enum class Action { START, STOP, NONE }

    fun decide(
        active: Boolean,
        sinceTs: Long?,
        offDuty: Boolean,
        ringing: Boolean,
        silencedForSince: Long?,
    ): Action = when {
        !active -> if (ringing) Action.STOP else Action.NONE
        offDuty -> Action.NONE
        ringing -> Action.NONE
        sinceTs != null && sinceTs == silencedForSince -> Action.NONE
        else -> Action.START
    }
}
