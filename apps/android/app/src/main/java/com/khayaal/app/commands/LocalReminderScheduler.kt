package com.khayaal.app.commands

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.khayaal.app.MainActivity
import com.khayaal.app.R
import com.khayaal.app.data.datastore.PairingStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

/**
 * A reminder she sets for herself, by talking to Khayaal.
 *
 * This one lives entirely on the phone: an alarm in AlarmManager, a line in
 * DataStore so it survives a restart, and a notification that is also read
 * aloud. Nothing is uploaded — it is her reminder, not the family's.
 */
@Serializable
data class LocalReminder(
    val id: String,
    val text: String,
    val atMs: Long,
    val fired: Boolean = false,
)

/**
 * Schedules and cancels the phone's own reminders. The alarm wakes the
 * [LocalReminderReceiver], which posts the notification and speaks it.
 */
object LocalReminderScheduler {

    private const val CHANNEL_REMINDERS = "khayaal-local-reminders"
    private const val REQUEST_BASE = 7300

    /** Creates the notification channel (idempotent). */
    fun ensureChannel(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            CHANNEL_REMINDERS,
            context.getString(R.string.channel_local_reminders_name),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = context.getString(R.string.channel_local_reminders_description)
        }
        manager.createNotificationChannel(channel)
    }

    /** Schedules the alarm for one reminder. */
    fun schedule(context: Context, reminder: LocalReminder) {
        ensureChannel(context)
        val alarmManager = context.getSystemService(AlarmManager::class.java) ?: return
        val intent = Intent(context, LocalReminderReceiver::class.java).apply {
            putExtra(LocalReminderReceiver.EXTRA_ID, reminder.id)
            putExtra(LocalReminderReceiver.EXTRA_TEXT, reminder.text)
        }
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            REQUEST_BASE + (reminder.id.hashCode() and 0xFFF),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val triggerAt = reminder.atMs.coerceAtLeast(System.currentTimeMillis() + 1_000L)
        runCatching {
            // setAndAllowWhileIdle: the reminder still comes when the phone is
            // dozing, which is exactly when she needs to hear it.
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
        }
    }

    /** Cancels the alarm for one reminder. */
    fun cancel(context: Context, reminder: LocalReminder) {
        val alarmManager = context.getSystemService(AlarmManager::class.java) ?: return
        val intent = Intent(context, LocalReminderReceiver::class.java).apply {
            putExtra(LocalReminderReceiver.EXTRA_ID, reminder.id)
        }
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            REQUEST_BASE + (reminder.id.hashCode() and 0xFFF),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        runCatching { alarmManager.cancel(pendingIntent) }
    }
}

/**
 * Fires when a reminder comes due: a notification, the reminder spoken aloud,
 * and the line marked as done in DataStore.
 */
class LocalReminderReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(EXTRA_ID).orEmpty()
        val text = intent.getStringExtra(EXTRA_TEXT).orEmpty()
        if (id.isBlank()) return

        LocalReminderScheduler.ensureChannel(context)

        val openApp = PendingIntent.getActivity(
            context,
            REQUEST_OPEN,
            Intent(context, MainActivity::class.java)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_khayaal)
            .setContentTitle(context.getString(R.string.local_reminder_title))
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(openApp)
            .setAutoCancel(true)
            .build()
        runCatching {
            NotificationManagerCompat.from(context).notify(id.hashCode(), notification)
        }

        // Read it aloud too — she may not be looking at the screen.
        val container = (context.applicationContext as? com.khayaal.app.KhayaalApp)?.container
        container?.ttsSpeaker?.speak(text)

        // Mark it done so it does not come back after a restart.
        val pending = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                val store = (context.applicationContext as? com.khayaal.app.KhayaalApp)
                    ?.container?.pairingStore
                store?.markLocalReminderFired(id)
            } finally {
                pending.finish()
            }
        }
    }

    companion object {
        const val EXTRA_ID = "reminder_id"
        const val EXTRA_TEXT = "reminder_text"
        private const val CHANNEL = "khayaal-local-reminders"
        private const val REQUEST_OPEN = 7301
    }
}
