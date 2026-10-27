package com.khayaal.app.care

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationManagerCompat
import com.khayaal.app.KhayaalApp
import com.khayaal.app.signals.WorkScheduler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Notification action buttons — "I'm OK" and "Snooze 1h" — so she never has
 * to find the app to reassure her family. Runs off the main thread via
 * [goAsync]; a slow network just means the receiver finishes a little later.
 */
class CheckInActionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val container = (context.applicationContext as? KhayaalApp)?.container ?: return
        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                when (intent.action) {
                    ACTION_CHECK_IN -> {
                        container.repository.checkIn()
                        WorkScheduler.flushNow(context, expedited = false)
                    }
                    ACTION_SNOOZE -> container.repository.snooze(DEFAULT_SNOOZE_MINUTES)
                }
                NotificationManagerCompat.from(context).cancel(CheckInManager.TIER_NOTIFICATION_ID)
            } finally {
                pendingResult.finish()
            }
        }
    }

    companion object {
        const val ACTION_CHECK_IN = "com.khayaal.app.action.CHECK_IN"
        const val ACTION_SNOOZE = "com.khayaal.app.action.SNOOZE"
        const val REQUEST_CODE_CHECK_IN = 5301
        const val REQUEST_CODE_SNOOZE = 5302
        const val DEFAULT_SNOOZE_MINUTES = 60L
    }
}
