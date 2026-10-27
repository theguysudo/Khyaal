package com.khayaal.app.care

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.telecom.TelecomManager
import androidx.core.content.ContextCompat

/**
 * "Call family" — the app never places a call without the platform's say-so:
 *
 *  - With CALL_PHONE granted, [placeCall] uses [TelecomManager.placeCall],
 *    which places the call directly (used by the tier-3 call chain).
 *  - Without it, [dialIntent] opens the dialer with the number pre-filled and
 *    she presses call — the dignified fallback.
 */
object FamilyCall {

    fun hasCallPhonePermission(context: Context): Boolean =
        ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.CALL_PHONE,
        ) == PackageManager.PERMISSION_GRANTED

    fun dialIntent(phoneNumber: String? = null): Intent {
        val intent = if (phoneNumber.isNullOrBlank()) {
            Intent(Intent.ACTION_DIAL)
        } else {
            Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phoneNumber"))
        }
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
        return intent
    }

    /**
     * Attempts a direct call. Returns false when the permission is missing or
     * the platform refuses — callers then fall back to [dialIntent].
     */
    fun placeCall(context: Context, phoneNumber: String): Boolean {
        if (phoneNumber.isBlank()) return false
        if (!hasCallPhonePermission(context)) return false
        val telecom = context.getSystemService(TelecomManager::class.java) ?: return false
        return runCatching {
            // minSdk 26 — placeCall has existed since the same API level.
            telecom.placeCall(Uri.parse("tel:$phoneNumber"), null)
            true
        }.getOrDefault(false)
    }

    /** Opens the dialer; safe from any context (NEW_TASK is always set). */
    fun openDialer(context: Context, phoneNumber: String? = null) {
        runCatching { context.startActivity(dialIntent(phoneNumber)) }
    }
}
