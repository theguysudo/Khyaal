package com.khayaal.app.signals

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Charger in, charger out — the evening ritual the backend uses to learn her
 * bedtime. Plugging events arrive as broadcasts; the current charging state
 * is read from the sticky [BatteryManager] broadcast so a freshly booted
 * phone still reports accurately (and only when the state actually changed).
 */
class ChargingCollector(
    private val context: Context,
    private val store: com.khayaal.app.data.datastore.PairingStore,
    private val onEvent: (SignalEvent) -> Unit,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.action) {
                Intent.ACTION_POWER_CONNECTED -> emit(connected = true)
                Intent.ACTION_POWER_DISCONNECTED -> emit(connected = false)
            }
        }
    }

    fun start() {
        val filter = IntentFilter(Intent.ACTION_POWER_CONNECTED).apply {
            addAction(Intent.ACTION_POWER_DISCONNECTED)
        }
        ContextCompat.registerReceiver(context, receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
        syncInitialState()
    }

    fun stop() {
        runCatching { context.unregisterReceiver(receiver) }
    }

    private fun emit(connected: Boolean) {
        scope.launch {
            store.setLastChargingState(connected)
            onEvent(SignalEvent.charging(connected))
        }
    }

    private fun syncInitialState() {
        val batteryStatus = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val status = batteryStatus?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val connected = status == BatteryManager.BATTERY_STATUS_CHARGING ||
            status == BatteryManager.BATTERY_STATUS_FULL
        scope.launch {
            if (store.currentLastChargingState() != connected) {
                store.setLastChargingState(connected)
                onEvent(SignalEvent.charging(connected))
            }
        }
    }
}
