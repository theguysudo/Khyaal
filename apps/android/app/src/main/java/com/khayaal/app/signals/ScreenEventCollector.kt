package com.khayaal.app.signals

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import androidx.core.content.ContextCompat

/**
 * Listens for the moment the screen is actually unlocked
 * ([Intent.ACTION_USER_PRESENT]) — the day's strongest single signal that
 * she is up and about. App-open detail, when the user grants usage access,
 * is handled separately by [AppUsageCollector].
 */
class ScreenEventCollector(
    private val context: Context,
    private val onEvent: (SignalEvent) -> Unit,
) {
    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == Intent.ACTION_USER_PRESENT) {
                onEvent(SignalEvent.unlock())
            }
        }
    }

    fun start() {
        ContextCompat.registerReceiver(
            context,
            receiver,
            IntentFilter(Intent.ACTION_USER_PRESENT),
            ContextCompat.RECEIVER_NOT_EXPORTED,
        )
    }

    fun stop() {
        runCatching { context.unregisterReceiver(receiver) }
    }
}
