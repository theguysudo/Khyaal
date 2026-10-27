package com.khayaal.app.data.queue

import com.khayaal.app.data.datastore.PairingStore
import com.khayaal.app.signals.SignalEvent
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * A durable, ordered buffer of signals waiting to leave the phone. Events are
 * enqueued the moment they happen (screen unlock, charger click, a walk) and
 * drained by [com.khayaal.app.signals.IngestWorker]. The live list is kept in
 * memory for speed and mirrored into DataStore so nothing is lost if the
 * process dies between the tap and the flush.
 */
class SignalQueue(private val store: PairingStore) {

    private val mutex = Mutex()
    private val cached = mutableListOf<SignalEvent>()
    private var loaded = false

    suspend fun enqueue(event: SignalEvent) = mutex.withLock {
        ensureLoaded()
        cached += event
        persist()
    }

    suspend fun enqueueAll(events: List<SignalEvent>) = mutex.withLock {
        if (events.isEmpty()) return@withLock
        ensureLoaded()
        cached += events
        persist()
    }

    suspend fun snapshot(): List<SignalEvent> = mutex.withLock {
        ensureLoaded()
        cached.toList()
    }

    /** Removes exactly the events that were posted successfully. */
    suspend fun removeAll(events: List<SignalEvent>) = mutex.withLock {
        if (events.isEmpty()) return@withLock
        ensureLoaded()
        val doomed = events.toHashSet()
        cached.removeAll(doomed)
        persist()
    }

    suspend fun clear() = mutex.withLock {
        ensureLoaded()
        cached.clear()
        persist()
    }

    private suspend fun persist() {
        store.saveQueue(cached)
    }

    private suspend fun ensureLoaded() {
        if (!loaded) {
            cached += store.loadQueue()
            loaded = true
        }
    }
}
