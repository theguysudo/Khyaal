package com.khayaal.app.signals

import android.content.Context
import com.khayaal.app.data.datastore.PairingStore
import com.khayaal.app.data.queue.SignalQueue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * The shared entry point every collector and receiver funnels events through:
 * pair-gate, enqueue, then schedule the earliest sensible flush. Events seen
 * before pairing are dropped — a phone that isn't part of a household has
 * nothing to report.
 */
class SignalRecorder(
    private val context: Context,
    private val store: PairingStore,
    private val queue: SignalQueue,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun record(event: SignalEvent) {
        scope.launch {
            if (store.current() == null) return@launch
            queue.enqueue(event)
            // Unlock is the strongest "she is up and about" moment; let it
            // jump the queue. Everything else rides the 15-minute heartbeat.
            WorkScheduler.flushNow(context, expedited = event.type == SignalEvent.Types.SCREEN_EVENT)
        }
    }
}
