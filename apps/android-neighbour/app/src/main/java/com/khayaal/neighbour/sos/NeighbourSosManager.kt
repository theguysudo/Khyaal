package com.khayaal.neighbour.sos

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.khayaal.neighbour.NeighbourApp
import com.khayaal.neighbour.R
import com.khayaal.neighbour.data.api.SosStateDto
import com.khayaal.neighbour.data.datastore.PairingInfo
import com.khayaal.neighbour.ui.sos.SosAlarmActivity
import com.khayaal.shared.alarm.SirenPlayer
import kotlinx.coroutines.runBlocking

/**
 * Turns "the household has an active SOS" into the full-volume alarm, for the
 * neighbour phone. Two delivery paths converge here — the same design as the
 * elder and family apps:
 *
 *  - **PATH A — the FCM data push** (`type == "sos_alarm"`, via
 *    `push.FirebaseService`): instant, needs google-services.json.
 *  - **PATH B — the /state poll** (2 s in the foreground, 5 min in the
 *    background): slower, needs nothing but the network. Always works.
 *
 * The siren is the shared [SirenPlayer] — alarm stream at max volume, seamless
 * loop, partial wake lock — identical across all three Khayaal apps.
 *
 * The neighbour-specific rules live in the pure [NeighbourSosPolicy]: off-duty
 * phones never ring, and "Silence for me" kills the siren for THIS SOS only
 * (keyed on the SOS's sinceTs) — never the household alarm itself, which is
 * the family's to stand down.
 */
object NeighbourSosManager {

    const val CHANNEL_SOS = "khayaal-neighbour-sos"
    const val SOS_NOTIFICATION_ID = 5001

    @Volatile
    private var ringing: Boolean = false

    /** The sinceTs of the SOS this phone was locally silenced for. */
    @Volatile
    private var silencedForSince: Long? = null

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

    /** PATH A: an `sos_alarm` data push arrived. */
    fun onSosPush(context: Context, householdId: String) {
        val pairing = currentPairing(context) ?: return
        if (householdId != pairing.householdId) return // stale push, wrong household
        // A push carries no sinceTs; it is a START unless off duty or already
        // ringing. If the phone was silenced for the current SOS, the next
        // poll's sinceTs re-anchors the silence.
        val offDuty = runBlocking { currentStore(context)?.currentOffDuty() } ?: false
        applyPolicy(context, active = true, sinceTs = null, offDuty = offDuty, source = "push")
    }

    /** PATH B: a /state observation. Null sos on old backends means "no SOS". */
    fun onSosObservation(context: Context, sos: SosStateDto?, source: String) {
        val offDuty = runBlocking { currentStore(context)?.currentOffDuty() } ?: false
        applyPolicy(
            context,
            active = sos?.active == true,
            sinceTs = sos?.sinceTs,
            offDuty = offDuty,
            source = source,
        )
    }

    /** "Silence for me" — THIS phone only; the household alarm keeps running. */
    fun onSilenceForMe(context: Context, sinceTs: Long?) {
        silencedForSince = sinceTs
        stopRinging(context)
    }

    private fun applyPolicy(context: Context, active: Boolean, sinceTs: Long?, offDuty: Boolean, source: String) {
        when (NeighbourSosPolicy.decide(active, sinceTs, offDuty, ringing, silencedForSince)) {
            NeighbourSosPolicy.Action.START -> startRinging(context, source)
            NeighbourSosPolicy.Action.STOP -> {
                // The SOS is over — the local silence anchor dies with it.
                silencedForSince = null
                stopRinging(context)
            }
            NeighbourSosPolicy.Action.NONE -> Unit
        }
    }

    private fun startRinging(context: Context, source: String) {
        if (ringing) return
        ringing = true
        ensureChannel(context)
        SirenPlayer.start(context)
        postAlarmNotification(context)
        runCatching {
            context.startActivity(
                Intent(context, SosAlarmActivity::class.java)
                    .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            )
        }
        android.util.Log.i("NeighbourSos", "SOS siren started (path=$source)")
    }

    /** Stops and forgets the silence anchor (the SOS is over or changed). */
    private fun stopRinging(context: Context) {
        if (!ringing && silencedForSince == null) return
        ringing = false
        SirenPlayer.stop(context)
        NotificationManagerCompat.from(context).cancel(SOS_NOTIFICATION_ID)
        android.util.Log.i("NeighbourSos", "SOS siren stopped")
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

    private fun currentStore(context: Context) =
        (context.applicationContext as? NeighbourApp)?.container?.store

    private fun currentPairing(context: Context): PairingInfo? {
        val store = currentStore(context) ?: return null
        // Callers sit on background threads (FCM handler, WorkManager) or the
        // main thread at process start; the read is a tiny DataStore lookup.
        return runBlocking { store.current() }
    }
}
