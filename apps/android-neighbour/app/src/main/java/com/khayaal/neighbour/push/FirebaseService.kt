package com.khayaal.neighbour.push

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.khayaal.neighbour.NeighbourApp
import com.khayaal.neighbour.sos.NeighbourSosManager
import com.khayaal.shared.alarm.SosPushPayload
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * FCM stub — the family app is fully functional on state polling alone
 * (2 s foreground / 5 min background); this service simply stays dormant
 * until a google-services.json is added.
 *
 * Expected data payload (PATH A of SOS delivery):
 *   { "type": "sos_alarm", "householdId": "hh_…", "sosId": "sos_…",
 *     "origin": "button"|"auto", "ts": "…" }
 */
class FirebaseService : FirebaseMessagingService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onMessageReceived(message: RemoteMessage) {
        SosPushPayload.parse(message.data)?.let { push ->
            NeighbourSosManager.onSosPush(this, push.householdId)
        }
    }

    override fun onNewToken(token: String) {
        // Remember the token (idempotent re-registration) and try to register
        // it right away. Every failure is a silent no-op; pairing re-registers
        // the stored token automatically.
        scope.launch {
            val container = (applicationContext as? NeighbourApp)?.container ?: return@launch
            container.store.setFcmToken(token)
            runCatching { container.repository.registerDeviceToken(token) }
        }
        super.onNewToken(token)
    }
}
