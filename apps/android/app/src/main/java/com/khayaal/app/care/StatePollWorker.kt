package com.khayaal.app.care

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.khayaal.app.KhayaalApp

/**
 * The 10-minute state poll. Fetches the tick bundle from the backend and lets
 * [CheckInManager] decide whether the tier has risen enough to speak. This is
 * the app's heartbeat even when nothing pushes to it.
 */
class StatePollWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val container = (applicationContext as? KhayaalApp)?.container ?: return Result.failure()
        val result = container.repository.fetchState()
        val bundle = result.getOrNull()
            ?: return if (result.exceptionOrNull() is IllegalStateException) {
                // Not paired yet — nothing to poll; stay quiet rather than retry-loop.
                Result.success()
            } else {
                Result.retry()
            }

        CheckInManager.handleState(applicationContext, bundle, container.pairingStore)
        return Result.success()
    }
}
