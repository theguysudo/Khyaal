package com.khayaal.family.care

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/**
 * The one periodic job: a state poll every 5 minutes while the app is closed.
 * The family app's real-time layer is the ~2 s foreground poll (the web
 * dashboard's cadence); this slower heartbeat exists so an SOS still rings
 * the phone in the background, with or without Firebase.
 */
object WorkScheduler {

    private const val PERIODIC_STATE_POLL = "khayaal-family-state-poll-periodic"

    /** Idempotent — safe to call at app start, after pairing and after boot. */
    fun ensurePeriodicStatePoll(context: Context) {
        val request = PeriodicWorkRequestBuilder<StatePollWorker>(5, TimeUnit.MINUTES)
            .setConstraints(
                Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build(),
            )
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 5, TimeUnit.MINUTES)
            .build()
        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork(PERIODIC_STATE_POLL, ExistingPeriodicWorkPolicy.KEEP, request)
    }
}
