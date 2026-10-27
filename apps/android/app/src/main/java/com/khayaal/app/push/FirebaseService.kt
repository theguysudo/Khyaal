package com.khayaal.app.push

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.khayaal.app.KhayaalApp
import com.khayaal.app.care.CheckInManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * FCM stub — an instant wake-up on top of the 10-minute state poll, not a
 * replacement for it. Khayaal is fully functional with polling alone; this
 * service simply stays dormant until a google-services.json is added
 * (see README, "Firebase setup").
 *
 * Expected data payload:
 *   { "tier": "2", "parentName": "Amma", "childName": "Aditya", "status": "Waiting for Amma's check-in" }
 */
class FirebaseService : FirebaseMessagingService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onMessageReceived(message: RemoteMessage) {
        val tier = message.data[TIER_KEY]?.toIntOrNull() ?: return
        if (tier !in 1..3) return
        CheckInManager.notifyTier(
            context = this,
            tier = tier,
            parentName = message.data[PARENT_NAME_KEY].orEmpty(),
            childName = message.data[CHILD_NAME_KEY].orEmpty(),
        )
    }

    override fun onNewToken(token: String) {
        // Remember the token (idempotent re-registration) and try to register
        // it right away. The endpoint may not exist yet, the phone may not be
        // paired, google-services.json may be absent — every failure is a
        // silent no-op; pairing re-registers the stored token automatically.
        scope.launch {
            val container = (applicationContext as? KhayaalApp)?.container ?: return@launch
            container.pairingStore.setFcmToken(token)
            runCatching { container.repository.registerDeviceToken(token) }
        }
        super.onNewToken(token)
    }

    private companion object {
        const val TIER_KEY = "tier"
        const val PARENT_NAME_KEY = "parentName"
        const val CHILD_NAME_KEY = "childName"
    }
}
