package com.khayaal.app.care

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.khayaal.app.KhayaalApp
import com.khayaal.app.data.datastore.CallChainState

/**
 * Dials one number from the armed call chain, then re-arms itself for the
 * next. Every step re-reads the DataStore snapshot — a cancel between steps
 * stops the chain dead. Without CALL_PHONE the dialer opens pre-filled
 * (ACTION_DIAL), so the chain still works, just with her pressing call.
 */
class CallChainWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val container = (applicationContext as? KhayaalApp)?.container ?: return Result.failure()
        val store = container.pairingStore
        val context = applicationContext

        if (CallChainManager.settleIfDone(context, store)) return Result.success()
        val state = store.currentCallChain() ?: return Result.success()
        val entry = state.entries.getOrNull(state.nextIndex) ?: return Result.success()

        // The call itself: direct when allowed, dialer otherwise.
        val placed = FamilyCall.placeCall(context, entry.phone)
        if (!placed) FamilyCall.openDialer(context, entry.phone)
        CallChainNotifier.notifyCalling(context, entry, state)

        val advanced = state.copy(nextIndex = state.nextIndex + 1)
        store.saveCallChain(advanced)
        if (advanced.nextIndex < advanced.entries.size) {
            CallChainManager.scheduleNext(context, advanced.alertCircleAfterMin)
        } else {
            // Chain exhausted; leave state so the UI can show it, next poll settles.
        }
        return Result.success()
    }
}
