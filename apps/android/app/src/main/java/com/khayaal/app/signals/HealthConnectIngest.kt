package com.khayaal.app.signals

import android.content.Context
import com.khayaal.app.data.datastore.PairingStore
import com.khayaal.app.data.queue.SignalQueue
import com.khayaal.app.smartwatch.HealthConnectCollector

/**
 * The band, drained into the signal queue at flush time — the same shape as
 * [StepsCollector.drainInto] and `AppUsageCollector.drainInto`.
 *
 * [HealthConnectCollector] reads Health Connect (the Fastrack band's route
 * into Android) and turns it into signals. This object decides WHEN and WHAT:
 * at most one read per flush cadence, and — deliberately — no `steps` events.
 * The phone's own step counter already reports a daily total under this
 * household's phone source; a second step total from the band for the same
 * source would fight the baseline. The band contributes what the phone
 * cannot measure: pulse, sleep, active minutes.
 *
 * NOTE ON SOURCES: the events ride the phone's own source credentials. The
 * backend's `smartwatch` corroboration semantics key on a `smartwatch`-type
 * source (packages/engine/src/risk.ts), but minting one requires a fresh
 * pairing code (POST /sources rotates it on first use), which the phone's own
 * pairing already consumed. Until the backend offers a device-credential path
 * to mint a band source, band data flows under the phone's source — recorded,
 * graphed on the family dashboard, but not double-counted as a second witness.
 */
object HealthConnectIngest {

    /** One read per flush cadence — the 15-minute heartbeat gates this. */
    private const val MIN_INTERVAL_MS = 15 * 60 * 1000L

    /** The first read looks back a day, so a freshly granted band fills in. */
    private const val INITIAL_LOOKBACK_MS = 24 * 60 * 60 * 1000L

    suspend fun drainInto(context: Context, store: PairingStore, queue: SignalQueue) {
        val pairing = store.current() ?: return
        val collector = HealthConnectCollector(context)
        if (!collector.isAvailable()) return

        val now = System.currentTimeMillis()
        val last = store.currentHealthConnectPollTs()
        if (last != 0L && now - last < MIN_INTERVAL_MS) return

        val since = if (last == 0L) now - INITIAL_LOOKBACK_MS else last
        val events = runCatching {
            collector.collect(since, pairing.sourceId)
        }.getOrDefault(emptyList())

        events
            .filter { it.type != SignalEvent.Types.STEPS }
            .forEach { queue.enqueue(it) }
        store.setHealthConnectPollTs(now)
    }
}
