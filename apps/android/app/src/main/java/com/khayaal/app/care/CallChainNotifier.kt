package com.khayaal.app.care

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.khayaal.app.KhayaalApp
import com.khayaal.app.MainActivity
import com.khayaal.app.R
import com.khayaal.app.data.datastore.CallChainState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * The call chain's persistent notification: "Khayaal is calling <name> for
 * you" with a visible Cancel button, so the chain is always one tap away
 * from stopping — on the alarm screen or right here.
 */
object CallChainNotifier {

    const val CHANNEL_ID = CheckInManager.CHANNEL_URGENT
    const val NOTIFICATION_ID = 2103
    const val ACTION_CANCEL = "com.khayaal.app.action.CANCEL_CALL_CHAIN"
    const val REQUEST_CODE_CANCEL = 6601
    const val REQUEST_CODE_OPEN = 6602

    fun notifyCalling(context: Context, entry: CallChainState.Entry, state: CallChainState) {
        if (!CheckInManager.canPostNotifications(context)) return

        val openApp = PendingIntent.getActivity(
            context,
            REQUEST_CODE_OPEN,
            Intent(context, MainActivity::class.java)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val cancel = PendingIntent.getBroadcast(
            context,
            REQUEST_CODE_CANCEL,
            Intent(context, CallChainActionReceiver::class.java).setAction(ACTION_CANCEL),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val name = entry.name.ifBlank { context.getString(R.string.alarm_call_family) }
        val remaining = (state.entries.size - state.nextIndex - 1).coerceAtLeast(0)
        val body = if (remaining > 0) {
            context.getString(R.string.call_chain_body_next, remaining)
        } else {
            context.getString(R.string.call_chain_body_last)
        }

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_khayaal)
            .setContentTitle(context.getString(R.string.call_chain_title, name))
            .setContentText(body)
            .setContentIntent(openApp)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(true)
            .addAction(
                NotificationCompat.Action.Builder(
                    R.drawable.ic_stat_khayaal,
                    context.getString(R.string.call_chain_cancel),
                    cancel,
                ).build(),
            )
            .build()
        runCatching { NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification) }
    }

    fun cancel(context: Context) {
        runCatching { NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID) }
    }
}

/** The notification's Cancel button. */
class CallChainActionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != CallChainNotifier.ACTION_CANCEL) return
        val container = (context.applicationContext as? KhayaalApp)?.container ?: return
        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                CallChainManager.cancel(context, container.pairingStore)
                CallChainNotifier.cancel(context)
            } finally {
                pendingResult.finish()
            }
        }
    }
}
