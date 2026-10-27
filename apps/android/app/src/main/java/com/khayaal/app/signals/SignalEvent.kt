package com.khayaal.app.signals

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive

/**
 * One observed moment on her phone — the smallest unit Khayaal understands.
 * Events are enqueued the instant they happen and posted in batches; the app
 * never interprets them, the backend computes all risk.
 */
@Serializable
data class SignalEvent(
    /** One of [Types] — mirrors the backend's SignalType union. */
    val type: String,
    /** String, number or boolean payload, kept raw as JSON. */
    val value: JsonElement,
    /** Epoch milliseconds on the phone; the batch poster adds the demo time offset. */
    val ts: Long,
) {
    object Types {
        const val SCREEN_EVENT = "screen_event"
        const val MOTION = "motion"
        const val CHARGING = "charging"
        const val APP_USAGE = "app_usage"
        const val LOCATION_ZONE = "location_zone"
        const val MANUAL_CHECKIN = "manual_checkin"
        const val STEPS = "steps"
        const val PRESENCE = "presence"
    }

    companion object {
        fun unlock(nowMs: Long = System.currentTimeMillis()) =
            SignalEvent(Types.SCREEN_EVENT, JsonPrimitive("unlock"), nowMs)

        fun motion(nowMs: Long = System.currentTimeMillis()) =
            SignalEvent(Types.MOTION, JsonPrimitive(1), nowMs)

        fun charging(connected: Boolean, nowMs: Long = System.currentTimeMillis()) =
            SignalEvent(Types.CHARGING, JsonPrimitive(connected), nowMs)

        fun appUsage(packageName: String, nowMs: Long = System.currentTimeMillis()) =
            SignalEvent(Types.APP_USAGE, JsonPrimitive(packageName), nowMs)

        /** Presence only — 'home' / 'away' from a Wi-Fi SSID match. Never a trail. */
        fun presence(home: Boolean, nowMs: Long = System.currentTimeMillis()) =
            SignalEvent(Types.LOCATION_ZONE, JsonPrimitive(if (home) "home" else "away"), nowMs)

        fun manualCheckIn(nowMs: Long = System.currentTimeMillis()) =
            SignalEvent(Types.MANUAL_CHECKIN, JsonPrimitive(true), nowMs)
    }
}
