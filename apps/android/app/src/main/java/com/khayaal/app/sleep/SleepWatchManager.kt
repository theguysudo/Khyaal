package com.khayaal.app.sleep

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.khayaal.app.data.datastore.PairingStore

/**
 * Start/stop plumbing for the night watch. The toggle on Home is the only way
 * the service ever starts — explicit opt-in, default OFF. The service sets
 * `nightWatchActive` itself so the UI mirrors reality, not intention.
 */
object SleepWatchManager {

    const val NOTIFICATION_ID = 3001
    const val CHANNEL_NIGHT_WATCH = "khayaal-night-watch"
    const val LOW_BATTERY_PERCENT = 10
    const val MAX_RUNTIME_MS = 14 * 60 * 60 * 1000L

    fun hasRecordPermission(context: Context): Boolean =
        ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.RECORD_AUDIO,
        ) == PackageManager.PERMISSION_GRANTED

    /**
     * Turns the watch on: marks the user's intent, then starts the microphone
     * foreground service (allowed only while the app is in the foreground).
     */
    suspend fun start(context: Context, store: PairingStore) {
        if (!hasRecordPermission(context)) return
        store.setNightWatchEnabled(true)
        val intent = Intent(context, SleepWatchService::class.java)
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(context, intent)
            } else {
                context.startService(intent)
            }
        }
    }

    /** Turns the watch off and remembers the user's choice across reboots. */
    suspend fun stop(context: Context, store: PairingStore) {
        store.setNightWatchEnabled(false)
        context.stopService(Intent(context, SleepWatchService::class.java))
    }
}
