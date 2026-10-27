package com.khayaal.app.care

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.khayaal.app.MainActivity
import com.khayaal.app.R
import com.khayaal.app.data.api.StateBundleDto
import com.khayaal.app.data.datastore.PairingStore

/**
 * Turns backend tiers into calm, dignified notifications on her phone.
 * One notification at a time; a tier only speaks when it rises.
 *
 *  - Tier 1: a soft hello in the shade (khayaal-care).
 *  - Tier 2: a clearer question with "I'm OK" / "Snooze 1h" actions.
 *  - Tier 3: high importance on khayaal-urgent with a full-screen intent.
 */
object CheckInManager {

    const val CHANNEL_CARE = "khayaal-care"
    const val CHANNEL_URGENT = "khayaal-urgent"
    const val TIER_NOTIFICATION_ID = 2001
    const val REQUEST_CODE_CALL_FAMILY = 2203

    fun ensureChannels(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        val care = NotificationChannel(
            CHANNEL_CARE,
            context.getString(R.string.channel_care_name),
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = context.getString(R.string.channel_care_description)
        }
        val urgent = NotificationChannel(
            CHANNEL_URGENT,
            context.getString(R.string.channel_urgent_name),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = context.getString(R.string.channel_urgent_description)
        }
        manager.createNotificationChannels(listOf(care, urgent))
    }

    /**
     * Called after every state poll (and from FCM): decides whether the tier
     * has risen far enough to deserve a moment of her attention.
     */
    suspend fun handleState(
        context: Context,
        bundle: StateBundleDto,
        store: PairingStore,
    ) {
        val tier = bundle.state?.tier ?: 0
        val lastNotifiedTier = store.currentLastNotifiedTier()
        store.setLastNotifiedTier(tier)

        if (tier <= lastNotifiedTier) {
            if (tier == 0) NotificationManagerCompat.from(context).cancel(TIER_NOTIFICATION_ID)
            return
        }

        notifyTier(
            context = context,
            tier = tier,
            parentName = bundle.household?.parentName.orEmpty(),
            childName = bundle.household?.childName.orEmpty(),
        )
    }

    /** Public so the FCM stub can wake the phone directly from a data push. */
    fun notifyTier(context: Context, tier: Int, parentName: String, childName: String) {
        ensureChannels(context)
        if (!canPostNotifications(context)) return

        val openApp = PendingIntent.getActivity(
            context,
            0,
            Intent(context, MainActivity::class.java)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = when (tier) {
            3 -> urgentNotification(context, openApp, childName)
            2 -> checkInQuestionNotification(context, openApp)
            else -> gentleHelloNotification(context, openApp)
        }
        runCatching {
            NotificationManagerCompat.from(context).notify(TIER_NOTIFICATION_ID, notification)
        }
    }

    private fun gentleHelloNotification(context: Context, openApp: PendingIntent) =
        base(context, CHANNEL_CARE)
            .setContentTitle(context.getString(R.string.notification_tier1_title))
            .setContentText(context.getString(R.string.notification_tier1_body))
            .setContentIntent(openApp)
            // Best-effort softness; the channel still governs sound on API 26+.
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setAutoCancel(true)
            .build()

    private fun checkInQuestionNotification(context: Context, openApp: PendingIntent) =
        base(context, CHANNEL_CARE)
            .setContentTitle(context.getString(R.string.notification_tier2_title))
            .setContentText(context.getString(R.string.notification_tier2_body))
            .setContentIntent(openApp)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .addAction(checkInAction(context))
            .addAction(snoozeAction(context))
            .build()

    private fun urgentNotification(context: Context, openApp: PendingIntent, childName: String): android.app.Notification {
        val body = if (childName.isBlank()) {
            context.getString(R.string.notification_tier3_body, context.getString(R.string.app_name))
        } else {
            context.getString(R.string.notification_tier3_body, childName)
        }
        val fullScreen = PendingIntent.getActivity(
            context,
            1,
            Intent(context, MainActivity::class.java)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return base(context, CHANNEL_URGENT)
            .setContentTitle(context.getString(R.string.notification_tier3_title))
            .setContentText(body)
            .setContentIntent(openApp)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setFullScreenIntent(fullScreen, true)
            .setAutoCancel(true)
            // The dialer, not a call — no CALL_PHONE permission, she presses call.
            .addAction(
                NotificationCompat.Action.Builder(
                    R.drawable.ic_stat_khayaal,
                    context.getString(R.string.notification_action_call_family),
                    PendingIntent.getActivity(
                        context,
                        REQUEST_CODE_CALL_FAMILY,
                        FamilyCall.dialIntent(null),
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                    ),
                ).build(),
            )
            .addAction(checkInAction(context))
            .build()
    }

    private fun base(context: Context, channelId: String): NotificationCompat.Builder =
        NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_stat_khayaal)
            .setOnlyAlertOnce(false)

    /** Shared by the tier-2 nudge and the commands channel's "request check-in". */
    fun checkInAction(context: Context): NotificationCompat.Action {
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            CheckInActionReceiver.REQUEST_CODE_CHECK_IN,
            Intent(context, CheckInActionReceiver::class.java)
                .setAction(CheckInActionReceiver.ACTION_CHECK_IN),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Action.Builder(
            R.drawable.ic_stat_khayaal,
            context.getString(R.string.notification_action_im_ok),
            pendingIntent,
        ).build()
    }

    private fun snoozeAction(context: Context): NotificationCompat.Action {
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            CheckInActionReceiver.REQUEST_CODE_SNOOZE,
            Intent(context, CheckInActionReceiver::class.java)
                .setAction(CheckInActionReceiver.ACTION_SNOOZE),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Action.Builder(
            R.drawable.ic_stat_khayaal,
            context.getString(R.string.notification_action_snooze),
            pendingIntent,
        ).build()
    }

    /** True when the app may post; the commands channel checks before every post. */
    fun canPostNotifications(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED
    }
}
