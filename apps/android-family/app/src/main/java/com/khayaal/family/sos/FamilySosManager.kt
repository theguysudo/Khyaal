package com.khayaal.family.sos

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.khayaal.family.FamilyApp
import com.khayaal.family.R
import com.khayaal.family.data.datastore.PairingInfo
import com.khayaal.family.data.api.SosStateDto
import com.khayaal.family.ui.sos.SosAlarmActivity
import com.khayaal.shared.alarm.SirenPlayer
import com.khayaal.shared.alarm.SosLatch
import kotlinx.coroutines.runBlocking

/**
 * Turns "the household has an active SOS" into the full-volume alarm, for the
 * family phone. Two delivery paths converge here — the same design as the
 * elder app:
 *
 *  - **PATH A — the FCM data push** (`type == "sos_alarm"`, via
 *    `push.FirebaseService`): instant, needs google-services.json.
 *  - **PATH B — the /state poll** (2 s in the foreground, 5 min in the
 *    background): slower, needs nothing but the network. Always works.
 *
 * The siren is the shared [SirenPlayer] — alarm stream at max volume, seamless
 * loop, partial wake lock — identical to the elder's phone and the neighbour's.
 * The latch means a START edge rings once; re-observing `active` never
 * re-triggers and the inactive edge stops everything.
 */
object FamilySosManager {

    const val CHANNEL_SOS = "khayaal-family-sos"
    const val SOS_NOTIFICATION_ID = 4001

    /** True while this phone considers the household SOS active and ringing. */
    @Volatile
    private var ringingLatch: Boolean = false

    fun ensureChannel(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            CHANNEL_SOS,
            context.getString(R.string.channel_sos_name),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = context.getString(R.string.channel_sos_description)
            // The siren is our own AudioTrack on the ALARM stream; the channel
            // must not layer its own sound on top.
            setSound(null, null)
            enableVibration(true)
        }
        manager.createNotificationChannel(channel)
    }

    /** PATH A: an `sos_alarm` data push arrived. Ring now, don't wait for the poll. */
    fun onSosPush(context: Context, householdId: String) {
        val pairing = currentPairing(context) ?: return
        if (householdId != pairing.householdId) return // stale push, wrong household
        startRinging(context, "push")
    }

    /** PATH B: a /state observation. Null sos on old backends means "no SOS". */
    fun onSosObservation(context: Context, sos: SosStateDto?, source: String) {
        val active = sos?.active == true
        when (SosLatch.action(ringingLatch, active)) {
            SosLatch.Action.START -> startRinging(context, source)
            SosLatch.Action.STOP -> stopRinging(context)
            SosLatch.Action.NONE -> Unit
        }
    }

    /** The family member tapped "Stand down": local stop; the resolve rides the network. */
    fun onUserStoodDown(context: Context) {
        stopRinging(context)
    }

    private fun startRinging(context: Context, source: String) {
        if (ringingLatch) return
        ringingLatch = true
        ensureChannel(context)
        SirenPlayer.start(context)
        postAlarmNotification(context)
        runCatching {
            context.startActivity(
                Intent(context, SosAlarmActivity::class.java)
                    .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            )
        }
        android.util.Log.i("FamilySos", "SOS siren started (path=$source)")
    }

    private fun stopRinging(context: Context) {
        if (!ringingLatch) {
            SirenPlayer.stop(context)
            return
        }
        ringingLatch = false
        SirenPlayer.stop(context)
        NotificationManagerCompat.from(context).cancel(SOS_NOTIFICATION_ID)
        android.util.Log.i("FamilySos", "SOS siren stopped")
    }

    private fun postAlarmNotification(context: Context) {
        if (!canPostNotifications(context)) return
        val pairing = currentPairing(context)
        val who = pairing?.parentName?.takeIf { it.isNotBlank() }
            ?: context.getString(R.string.app_name)
        val open = PendingIntent.getActivity(
            context,
            1,
            Intent(context, SosAlarmActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_SOS)
            .setSmallIcon(R.drawable.ic_stat_khayaal)
            .setContentTitle(context.getString(R.string.sos_notification_title, who))
            .setContentText(context.getString(R.string.sos_notification_body))
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setOngoing(true)
            .setFullScreenIntent(open, true)
            .setContentIntent(open)
            .build()
        runCatching { NotificationManagerCompat.from(context).notify(SOS_NOTIFICATION_ID, notification) }
    }

    private fun canPostNotifications(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
        return androidx.core.content.ContextCompat.checkSelfPermission(
            context,
            android.Manifest.permission.POST_NOTIFICATIONS,
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
    }

    private fun currentPairing(context: Context): PairingInfo? {
        val store = (context.applicationContext as? FamilyApp)?.container?.store ?: return null
        // Callers sit on background threads (FCM handler, WorkManager) or the
        // main thread at process start; the read is a tiny DataStore lookup.
        return runBlocking { store.current() }
    }
}
