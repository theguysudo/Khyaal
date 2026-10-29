package com.khayaal.family.care

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.khayaal.family.FamilyApp
import com.khayaal.family.sos.FamilySosManager

/**
 * The background state poll — PATH B of SOS delivery (the path that works
 * with zero Firebase config). Feeds the household's SOS flag to
 * [FamilySosManager], which latches the start/stop edges and rings.
 */
class StatePollWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val container = (applicationContext as? FamilyApp)?.container ?: return Result.failure()
        val result = container.repository.fetchState()
        val bundle = result.getOrNull()
            ?: return if (result.exceptionOrNull() is IllegalStateException) {
                // Not paired yet — nothing to poll; stay quiet.
                Result.success()
            } else {
                Result.retry()
            }
        runCatching { FamilySosManager.onSosObservation(applicationContext, bundle.sos, "background-poll") }
        return Result.success()
    }
}
