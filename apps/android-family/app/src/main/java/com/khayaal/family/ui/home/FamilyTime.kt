package com.khayaal.family.ui.home

import android.content.Context
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * Small pure helpers for the family status card — Android-free so they are
 * unit-testable. Deliberately modest: "12 min ago" and "14:05" are the only
 * time ideas this app needs.
 */
object FamilyTime {

    private val clockFormat = DateTimeFormatter.ofPattern("HH:mm")

    /** "just now" / "N min ago" / "N h ago" / "N d ago" — the web's fmtAgo. */
    fun ago(ts: Long, nowMs: Long = System.currentTimeMillis()): String {
        val delta = (nowMs - ts).coerceAtLeast(0)
        val minutes = delta / 60_000
        return when {
            minutes < 1 -> "just now"
            minutes < 60 -> "$minutes min ago"
            minutes < 60 * 24 -> "${minutes / 60} h ago"
            else -> "${minutes / (60 * 24)} d ago"
        }
    }

    /** "14:05" in the device's timezone. */
    fun clock(ts: Long, zone: ZoneId = ZoneId.systemDefault()): String =
        clockFormat.format(Instant.ofEpochMilli(ts).atZone(zone))
}

/** The one-line "who to call" builder for the SOS screen's contact rows. */
object SosContacts {

    data class Contact(val name: String, val phone: String)

    /**
     * The care-circle members with a phone number, family first (they live
     * closest to the household), then neighbours. Duplicates by phone drop.
     */
    fun callable(members: List<com.khayaal.family.data.api.CareCircleMemberDto>): List<Contact> {
        val seen = mutableSetOf<String>()
        return members.asSequence()
            .filter { !it.phone.isNullOrBlank() }
            .sortedBy { if (it.role == "neighbor") 1 else 0 }
            .mapNotNull { member ->
                val phone = member.phone?.trim() ?: return@mapNotNull null
                if (seen.add(phone)) Contact(member.name.ifBlank { phone }, phone) else null
            }
            .toList()
    }

    /** Strips everything WhatsApp's wa.me link cannot carry. */
    fun waNumber(phone: String): String = phone.filter { it.isDigit() }

    /** True when this context can actually open a WhatsApp chat. */
    fun canOpenWhatsApp(context: Context, number: String): Boolean =
        number.isNotBlank() && runCatching {
            context.packageManager.getLaunchIntentForPackage("com.whatsapp") != null
        }.getOrDefault(false)
}
