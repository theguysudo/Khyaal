package com.khayaal.app.care

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.khayaal.app.KhayaalApp
import com.khayaal.app.sos.SosManager

/**
 * The 10-minute state poll. Fetches the tick bundle from the backend, lets
 * [CheckInManager] decide whether the tier has risen enough to speak, and —
 * PATH B of SOS delivery — feeds the household's SOS flag to [SosManager].
 * With no Firebase config, this poll (plus the foreground poll in
 * HomeViewModel) is the delivery path that must always work.
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
        // Family→app commands (messages, reminders, tts, request-checkin).
        runCatching { container.commandCoordinator.onBundle(bundle) }
        // PATH B: the state poll as an SOS alarm source (no Firebase needed).
        runCatching { SosManager.onSosObservation(applicationContext, bundle.sos, "background-poll") }
        return Result.success()
    }
}
