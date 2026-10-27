package com.khayaal.app.signals

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.khayaal.app.care.StatePollWorker
import java.util.concurrent.TimeUnit

/**
 * All WorkManager scheduling in one place. Two periodic jobs keep the phone
 * talking to the backend while it is in use — a batched signal flush every
 * 15 minutes and a state poll every 10 minutes — plus one-shot flushes for
 * the events that matter right now (an unlock especially).
 */
object WorkScheduler {

    private const val PERIODIC_INGEST = "khayaal-ingest-periodic"
    private const val ONE_SHOT_INGEST = "khayaal-ingest-now"
    private const val PERIODIC_STATE_POLL = "khayaal-state-poll-periodic"

    /** Idempotent — safe to call at app start and after every reboot. */
    fun ensurePeriodicWork(context: Context) {
        ensurePeriodicIngest(context)
        ensurePeriodicStatePoll(context)
    }

    /**
     * The battery-friendly heartbeat: at least one flush every 15 minutes
     * while the network is up, regardless of what else is happening.
     */
    fun ensurePeriodicIngest(context: Context) {
        val request = PeriodicWorkRequestBuilder<IngestWorker>(15, TimeUnit.MINUTES)
            .setConstraints(networkConnected())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.MINUTES)
            .build()
        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork(PERIODIC_INGEST, ExistingPeriodicWorkPolicy.KEEP, request)
    }

    /** Picks up tier changes for the gentle notifications. */
    fun ensurePeriodicStatePoll(context: Context) {
        val request = PeriodicWorkRequestBuilder<StatePollWorker>(10, TimeUnit.MINUTES)
            .setConstraints(networkConnected())
            .build()
        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork(PERIODIC_STATE_POLL, ExistingPeriodicWorkPolicy.KEEP, request)
    }

    /**
     * Immediate flush for unlock / charge / check-in events. Only the unlock
     * flush is expedited — a small Doze-friendly allowance; everything else
     * waits politely for the network constraint.
     */
    fun flushNow(context: Context, expedited: Boolean) {
        val request = if (expedited) {
            OneTimeWorkRequestBuilder<IngestWorker>()
                .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                .build()
        } else {
            OneTimeWorkRequestBuilder<IngestWorker>()
                .setConstraints(networkConnected())
                .build()
        }
        WorkManager.getInstance(context)
            .enqueueUniqueWork(ONE_SHOT_INGEST, ExistingWorkPolicy.REPLACE, request)
    }

    private fun networkConnected(): Constraints =
        Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
}
