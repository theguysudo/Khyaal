package com.khayaal.app.sos

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.khayaal.app.KhayaalApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * The "Stand down" button on the SOS notification (visible on the lock
 * screen): stop this phone's siren immediately, then file the resolve with
 * the backend best-effort. If the network refuses, the SOS alarm screen —
 * one tap away — retries on every tick.
 */
class SosActionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_STAND_DOWN) return
        SosManager.onUserStoodDown(context)
        val appContext = context.applicationContext
        val result = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                (appContext as? KhayaalApp)?.container?.repository
                    ?.resolveSos(appContext.getString(com.khayaal.app.R.string.sos_by_elder))
            } finally {
                result.finish()
            }
        }
    }

    companion object {
        const val ACTION_STAND_DOWN = "com.khayaal.app.sos.STAND_DOWN"
    }
}
