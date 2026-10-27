package com.khayaal.app.care

import android.content.Intent
import android.net.Uri

/**
 * "Call family" — always [Intent.ACTION_DIAL], which opens the dialer with the
 * number pre-filled. The app holds no CALL_PHONE permission and never places a
 * call itself; she stays the one who presses call. The care circle carries
 * emails, not numbers, so the common path is the plain dialer.
 */
object FamilyCall {

    fun dialIntent(phoneNumber: String? = null): Intent =
        if (phoneNumber.isNullOrBlank()) {
            Intent(Intent.ACTION_DIAL)
        } else {
            Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phoneNumber"))
        }
}
