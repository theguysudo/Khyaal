package com.khayaal.app.commands

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.khayaal.app.MainActivity
import com.khayaal.app.R
import com.khayaal.app.care.CheckInManager
import com.khayaal.app.data.api.CommandDto
import com.khayaal.app.data.api.StateBundleDto
import com.khayaal.app.data.datastore.PairingStore
import com.khayaal.app.data.repo.KhayaalRepository

/**
 * The family→app commands channel. The state bundle carries
 * `commands: [{id, type, text, ts, ackTs}]`; this coordinator:
 *
 *  1. dedupes by id against DataStore (a reboot never re-speaks a reminder),
 *  2. posts one notification per new command — 'tts' commands are additionally
 *     read aloud via TextToSpeech (voice reminder; no microphone involved),
 *  3. acks every un-acked command with POST /household/{id}/command-ack,
 *     retrying on later polls until the backend confirms.
 *
 * Everything degrades silently: no commands in the bundle (older backend) is
 * a no-op, a failing ack is retried next poll, notification permission is
 * checked before every post.
 */
class CommandCoordinator(
    private val context: Context,
    private val store: PairingStore,
    private val repository: KhayaalRepository,
    private val tts: TtsSpeaker,
) {

    suspend fun onBundle(bundle: StateBundleDto) {
        val commands = bundle.commands
        if (commands.isEmpty()) return

        ensureChannel()

        val book = store.loadCommandBook()

        // 1. Surface anything new.
        val fresh = book.unseen(commands)
        for (command in fresh) {
            if (command.type == CommandDto.Types.TTS) tts.speak(command.text, command.lang)
            notifyCommand(command)
        }
        if (fresh.isNotEmpty()) {
            store.saveCommandBook(book.withSeen(fresh.map { it.id }))
            store.appendCommandHistory(fresh)
        }

        // 2. Ack everything the backend hasn't confirmed yet (new and stale).
        val latest = store.loadCommandBook()
        for (command in latest.unacked(commands)) {
            val outcome = runCatching { repository.ackCommand(command.id) }
            val failure = outcome.exceptionOrNull()
            // 404 — the backend predates the ack route; nothing more to do,
            // and dedupe already guarantees she is never re-notified.
            val terminal = outcome.isSuccess ||
                (failure is retrofit2.HttpException && failure.code() == 404)
            if (terminal) {
                store.saveCommandBook(store.loadCommandBook().withAcked(command.id))
            }
        }
    }

    private fun notifyCommand(command: CommandDto) {
        if (!CheckInManager.canPostNotifications(context)) return

        val openApp = PendingIntent.getActivity(
            context,
            COMMAND_OPEN_REQUEST_CODE,
            Intent(context, MainActivity::class.java)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val builder = NotificationCompat.Builder(context, CHANNEL_COMMANDS)
            .setSmallIcon(R.drawable.ic_stat_khayaal)
            .setContentTitle(titleFor(command.type))
            .setContentText(command.text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(command.text))
            .setContentIntent(openApp)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)

        if (command.type == CommandDto.Types.REQUEST_CHECKIN) {
            builder.addAction(CheckInManager.checkInAction(context))
        }

        runCatching {
            NotificationManagerCompat.from(context).notify(notificationId(command), builder.build())
        }
    }

    private fun titleFor(type: String): String = when (type) {
        CommandDto.Types.REMINDER -> context.getString(R.string.command_reminder_title)
        CommandDto.Types.TTS -> context.getString(R.string.command_tts_title)
        CommandDto.Types.REQUEST_CHECKIN -> context.getString(R.string.command_request_checkin_title)
        else -> context.getString(R.string.command_message_title)
    }

    /** One notification slot per command id so reminders don't overwrite each other. */
    private fun notificationId(command: CommandDto): Int = 4000 + (command.id.hashCode() and 0xFFFF)

    private fun ensureChannel() = ensureChannelStatic(context)

    companion object {
        const val CHANNEL_COMMANDS = "khayaal-commands"
        const val COMMAND_OPEN_REQUEST_CODE = 6401

        /** Channel creation is idempotent; Application.onCreate calls this early. */
        fun ensureChannelStatic(context: Context) {
            val manager = context.getSystemService(NotificationManager::class.java) ?: return
            val channel = NotificationChannel(
                CHANNEL_COMMANDS,
                context.getString(R.string.channel_commands_name),
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = context.getString(R.string.channel_commands_description)
            }
            manager.createNotificationChannel(channel)
        }
    }
}
