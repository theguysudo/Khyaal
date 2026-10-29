package com.khayaal.shared.alarm

/**
 * The tiny state machine that decides what a SOS observer should do when a
 * state poll or a push reports the household's SOS flag. Kept pure so the
 * transition table is unit-tested in every app that shares it.
 *
 * The rule: a siren starts only on the inactive→active edge, and stops only
 * on the active→inactive edge. Re-observing "active" must never re-trigger
 * (the poll runs every couple of seconds), and re-observing "inactive" must
 * never resurrect a notification.
 */
object SosLatch {

    enum class Action { START, STOP, NONE }

    /**
     * [wasActive] — whether the observer already considers the SOS running;
     * [isActive] — what the latest observation says.
     */
    fun action(wasActive: Boolean, isActive: Boolean): Action = when {
        !wasActive && isActive -> Action.START
        wasActive && !isActive -> Action.STOP
        else -> Action.NONE
    }
}
