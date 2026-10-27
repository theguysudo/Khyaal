package com.khayaal.app.push

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.khayaal.app.care.CheckInManager

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
        // TODO(fcm-config): once the backend gains a device-token endpoint
        // (e.g. POST /api/v1/household/{id}/devices), register this token so
        // escalations can push instantly. Until then polling covers it.
        super.onNewToken(token)
    }

    private companion object {
        const val TIER_KEY = "tier"
        const val PARENT_NAME_KEY = "parentName"
        const val CHILD_NAME_KEY = "childName"
    }
}
