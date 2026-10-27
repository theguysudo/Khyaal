package com.khayaal.app.care

import android.content.Context
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.khayaal.app.data.api.CallOrderEntryDto
import com.khayaal.app.data.api.HouseholdDto
import com.khayaal.app.data.datastore.CallChainState
import com.khayaal.app.data.datastore.PairingStore
import java.util.concurrent.TimeUnit

/**
 * The tier-3 call chain — free, no Twilio. When the tier rises to 3 and the
 * household carries a `callPlan.callOrder`, the chain:
 *
 *  1. waits `callElderAfterMin` minutes, then dials the first number —
 *     directly via TelecomManager when CALL_PHONE is granted, otherwise the
 *     dialer opens pre-filled (the permissionless fallback);
 *  2. if she doesn't cancel, continues down the list every
 *     `alertCircleAfterMin` minutes (answer state isn't observable without
 *     privileged telephony APIs, so the chain is time-driven and cancellable
 *     at every step);
 *  3. shows a persistent notification with a Cancel action, and the in-app
 *     alarm carries the same button.
 *
 * The order is snapshotted into DataStore when armed, so the chain survives
 * process death and doesn't depend on the network to dial.
 */
object CallChainManager {

    const val WORK_NAME = "khayaal-call-chain"

    /** Arms the chain from the household's callPlan, replacing any previous run. */
    suspend fun arm(context: Context, store: PairingStore, household: HouseholdDto?) {
        val plan = household?.callPlan ?: return
        val order = plan.callOrder.filter { it.phone.isNotBlank() }
        if (order.isEmpty()) return

        val callElderAfterMin = (plan.callElderAfterMin ?: 0L).coerceIn(0L, 240L)
        val gapMin = (plan.alertCircleAfterMin ?: DEFAULT_GAP_MIN).coerceIn(1L, 120L)
        val state = CallChainState(
            entries = order.map { CallChainState.Entry(name = it.name, phone = it.phone) },
            nextIndex = 0,
            cancelled = false,
            callElderAfterMin = callElderAfterMin,
            alertCircleAfterMin = gapMin,
        )
        store.saveCallChain(state)
        scheduleNext(context, callElderAfterMin)
    }

    /** Visible, one-tap off-ramp: notification button or the alarm overlay. */
    suspend fun cancel(context: Context, store: PairingStore) {
        store.currentCallChain()?.let { store.saveCallChain(it.copy(cancelled = true)) }
        WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
    }

    /** True when the chain has nothing left to do; clears the stored state. */
    suspend fun settleIfDone(context: Context, store: PairingStore): Boolean {
        val state = store.currentCallChain() ?: return true
        if (state.cancelled || state.nextIndex >= state.entries.size) {
            store.saveCallChain(null)
            WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
            return true
        }
        return false
    }

    /** Re-arms the worker for the step after the one just dialled. */
    fun scheduleNext(context: Context, delayMinutes: Long) {
        val request = OneTimeWorkRequestBuilder<CallChainWorker>()
            .setInitialDelay(delayMinutes.coerceAtLeast(0L), TimeUnit.MINUTES)
            .build()
        WorkManager.getInstance(context)
            .enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.REPLACE, request)
    }

    /** DataStore snapshot → the worker's dial list. */
    internal fun List<CallOrderEntryDto>.toEntries(): List<CallChainState.Entry> =
        map { CallChainState.Entry(name = it.name, phone = it.phone) }

    const val DEFAULT_GAP_MIN = 5L
}
