package com.khayaal.shared.alarm

/**
 * The FCM **data** message the Khayaal backend sends to every device token of
 * a household when an SOS goes up:
 *
 * ```
 * { "type": "sos_alarm", "householdId": "hh_…", "sosId": "sos_…",
 *   "origin": "button" | "auto", "ts": "1730000000000" }
 * ```
 *
 * Every field arrives as a string (FCM data payloads are string maps). Kept
 * free of Android and Firebase classes so all three apps can parse and test
 * it identically — and so the parse never depends on the Firebase SDK being
 * configured at all.
 */
object SosPushPayload {

    const val TYPE = "sos_alarm"

    /** The parsed push, or null when the message is not an SOS alarm. */
    fun parse(data: Map<String, String>): SosAlarmPush? {
        if (data[KEY_TYPE] != TYPE) return null
        val householdId = data[KEY_HOUSEHOLD_ID]?.takeIf { it.isNotBlank() } ?: return null
        return SosAlarmPush(
            householdId = householdId,
            sosId = data[KEY_SOS_ID].orEmpty(),
            origin = data[KEY_ORIGIN]?.takeIf { it == ORIGIN_BUTTON || it == ORIGIN_AUTO },
            ts = data[KEY_TS]?.toLongOrNull(),
        )
    }

    const val ORIGIN_BUTTON = "button"
    const val ORIGIN_AUTO = "auto"

    private const val KEY_TYPE = "type"
    private const val KEY_HOUSEHOLD_ID = "householdId"
    private const val KEY_SOS_ID = "sosId"
    private const val KEY_ORIGIN = "origin"
    private const val KEY_TS = "ts"
}

/** One `sos_alarm` push, with every field except the household id optional. */
data class SosAlarmPush(
    val householdId: String,
    val sosId: String,
    /** "button" | "auto", or null when the backend did not say. */
    val origin: String?,
    val ts: Long?,
)
