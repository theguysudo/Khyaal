package com.khayaal.app.signals

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Re-arms the periodic signal flush and state poll after a reboot — the two
 * unique periodic jobs are KEEP-policy, so this is cheap and idempotent.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        WorkScheduler.ensurePeriodicWork(context)
    }
}
