package com.khayaal.app.sos

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.khayaal.app.MainActivity
import com.khayaal.app.R
import com.khayaal.app.data.api.SosStateDto
import com.khayaal.app.data.datastore.PairingInfo
import com.khayaal.app.ui.sos.SosAlarmActivity
import com.khayaal.shared.alarm.SirenPlayer
import com.khayaal.shared.alarm.SosLatch

/**
 * The one place that turns "the household has an active SOS" into noise.
 * Two independent delivery paths feed it, and both are needed:
 *
 *  - **PATH A — the FCM data push** (`type == "sos_alarm"`), handled by
 *    [onSosPush] from `push.FirebaseService`. Instant, but only exists when a
 *    google-services.json is present (it is not, in debug builds).
 *  - **PATH B — the /state poll**, handled by [onSosObservation] from
 *    `care.StatePollWorker`, `ui.home.HomeViewModel` (foreground) and the SOS
 *    alarm screen itself. Slower, but it works with **zero Firebase config** —
 *    this is the path that must always work, and it does.
 *
 * The siren itself is the shared `SirenPlayer` (alarm stream, max volume,
 * seamless loop, partial wake lock), so the elder's phone, Khayaal Family and
 * Khayaal Neighbour all sound identical.
 *
 * The latch lives in [ringingLatch]: a START edge (from either path) rings
 * once; re-observing `active` never re-triggers; the inactive edge (or a
 * "stand down") stops everything. Both paths converge here, so a push that
 * arrives while the poll already fired is a no-op.
 */
object SosManager {

    const val CHANNEL_SOS = "khayaal-sos"
    const val SOS_NOTIFICATION_ID = 3001

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
            // must not layer its own sound on top of it.
            setSound(null, null)
            enableVibration(true)
        }
        manager.createNotificationChannel(channel)
    }

    /** PATH A: an `sos_alarm` data push arrived. Ring now, don't wait for the poll. */
    fun onSosPush(context: Context, householdId: String) {
        val pairing = currentPairing(context) ?: return
        // A push for a household this phone no longer belongs to is stale; ignore.
        if (householdId != pairing.householdId) return
        applyLatch(context, SosLatch.Action.START, "push")
    }

    /**
     * PATH B: a /state observation. [sos] is null on old backends — that means
     * "no SOS anywhere", which is the safe reading.
     */
    fun onSosObservation(context: Context, sos: SosStateDto?, source: String) {
        val active = sos?.active == true
        applyLatch(context, SosLatch.action(ringingLatch, active), source)
    }

    /** The user tapped "I'm safe / Stand down": local stop, regardless of network. */
    fun onUserStoodDown(context: Context) {
        applyLatch(context, SosLatch.Action.STOP, "user")
    }

    /**
     * The elder pressed the SOS button on THIS phone: ring immediately. The
     * network POST happens in parallel (the ViewModel fires it); the local
     * siren must never wait on the network.
     */
    fun onLocalTrigger(context: Context) {
        applyLatch(context, SosLatch.Action.START, "button-press")
    }

    /** Stops everything; used on unpair and from the alarm screen teardown. */
    fun stopAll(context: Context) {
        applyLatch(context, SosLatch.Action.STOP, "stop-all")
    }

    private fun applyLatch(context: Context, action: SosLatch.Action, source: String) {
        when (action) {
            SosLatch.Action.START -> startRinging(context, source)
            SosLatch.Action.STOP -> stopRinging(context)
            SosLatch.Action.NONE -> Unit
        }
    }

    private fun startRinging(context: Context, source: String) {
        if (ringingLatch) return
        ringingLatch = true
        ensureChannel(context)
        // THE SIREN — full alarm volume, loops until stood down, CPU held awake.
        SirenPlayer.start(context)
        postAlarmNotification(context)
        // The full-screen SOS activity: fires over the lock screen via the
        // notification's full-screen intent, and directly when the app process
        // can launch it right now.
        runCatching {
            context.startActivity(alarmIntent(context).setFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP,
            ))
        }
        android.util.Log.i("SosManager", "SOS siren started (path=$source)")
    }

    private fun stopRinging(context: Context) {
        if (!ringingLatch) {
            SirenPlayer.stop(context)
            return
        }
        ringingLatch = false
        SirenPlayer.stop(context)
        NotificationManagerCompat.from(context).cancel(SOS_NOTIFICATION_ID)
        android.util.Log.i("SosManager", "SOS siren stopped")
    }

    /**
     * The alarm notification: high importance with a full-screen intent, so
     * while the screen is locked the SOS activity still takes over the lock
     * screen. Tapping the body opens the alarm screen; "Stand down" stops the
     * siren on this phone and files the resolve best-effort.
     */
    private fun postAlarmNotification(context: Context) {
        if (!com.khayaal.app.care.CheckInManager.canPostNotifications(context)) return
        val pairing = currentPairing(context)
        val who = pairing?.parentName?.takeIf { it.isNotBlank() }
            ?: context.getString(R.string.sos_her_default)
        val title = context.getString(R.string.sos_notification_title, who)
        val body = context.getString(R.string.sos_notification_body)

        val fullScreen = PendingIntent.getActivity(
            context,
            1,
            alarmIntent(context),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val standDown = PendingIntent.getBroadcast(
            context,
            2,
            Intent(context, SosActionReceiver::class.java).setAction(SosActionReceiver.ACTION_STAND_DOWN),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_SOS)
            .setSmallIcon(R.drawable.ic_stat_khayaal)
            .setContentTitle(title)
            .setContentText(body)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setOngoing(true)
            .setFullScreenIntent(fullScreen, true)
            .setContentIntent(fullScreen)
            .addAction(
                NotificationCompat.Action.Builder(
                    R.drawable.ic_stat_khayaal,
                    context.getString(R.string.sos_stand_down),
                    standDown,
                ).build(),
            )
            .build()
        runCatching { NotificationManagerCompat.from(context).notify(SOS_NOTIFICATION_ID, notification) }
    }

    private fun alarmIntent(context: Context): Intent =
        Intent(context, SosAlarmActivity::class.java)

    private fun currentPairing(context: Context): PairingInfo? {
        val store = (context.applicationContext as? com.khayaal.app.KhayaalApp)?.container?.pairingStore
            ?: return null
        // runBlocking is fine here: every caller already sits on a background
        // thread (FCM handler, WorkManager, broadcast receiver) and reads a
        // tiny DataStore — never call this from the main thread.
        return kotlinx.coroutines.runBlocking { store.current() }
    }
}
