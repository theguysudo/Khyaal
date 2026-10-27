package com.khayaal.app.signals

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.khayaal.app.KhayaalApp
import com.khayaal.app.data.repo.FlushOutcome

/**
 * Drains the signal queue into the backend. Runs three ways: the 15-minute
 * periodic heartbeat, a constraint-gated one-shot for charge / check-in
 * events, and an expedited one-shot for unlocks. Anything the network won't
 * take right now stays queued — silence is never lost, only delayed.
 */
class IngestWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val container = (applicationContext as? KhayaalApp)?.container ?: return Result.failure()

        // App-open signals are read in bulk at flush time (see AppUsageCollector);
        // the daily absolute step total rides the same heartbeat.
        AppUsageCollector.drainInto(applicationContext, container.pairingStore, container.signalQueue)
        StepsCollector.drainInto(container.pairingStore, container.signalQueue)

        return when (container.repository.flushQueue()) {
            FlushOutcome.Uploaded,
            FlushOutcome.NothingToDo,
            FlushOutcome.Rejected,
            -> Result.success()
            FlushOutcome.RetryLater -> Result.retry()
        }
    }
}
