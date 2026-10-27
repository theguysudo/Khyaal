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
    /**
     * Optional detail bag — primitives only (string / number / boolean), at
     * most a handful of keys. The backend sanitises it again before it is
     * stored, so nothing free-form and nothing nested can ever ride along.
     * Coordinates never go in here: GPS is summarised on-device first.
     */
    val meta: Map<String, JsonPrimitive> = emptyMap(),
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
        const val SLEEP_EVENT = "sleep_event"
        const val SOUND_EVENT = "sound_event"

        /** GPS-derived movement — distance / speed / accuracy, never coordinates. */
        const val GPS_MOTION = "gps_motion"
    }

    /** sleep_event values: on-device classification only, never audio. */
    object SleepValues {
        const val ASLEEP = "asleep"
        const val AWAKE = "awake"
        const val RESTLESS = "restless"
        const val WOKE = "woke"
    }

    /** sound_event values: three loudness buckets. */
    object SoundValues {
        const val QUIET = "quiet"
        const val NOISE = "noise"
        const val LOUD = "loud"
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

        /** Steps taken so far today (the daily delta); [absolute] reports the raw counter. */
        fun steps(today: Long, nowMs: Long = System.currentTimeMillis()) =
            SignalEvent(Types.STEPS, JsonPrimitive(today), nowMs)

        fun sleepEvent(value: String, nowMs: Long = System.currentTimeMillis()) =
            SignalEvent(Types.SLEEP_EVENT, JsonPrimitive(value), nowMs)

        fun soundEvent(value: String, nowMs: Long = System.currentTimeMillis()) =
            SignalEvent(Types.SOUND_EVENT, JsonPrimitive(value), nowMs)

        /**
         * One GPS summary, computed entirely on the phone. [zone] is "home" or
         * "away" — a word, not a place. The numbers are movement facts: how far
         * she has walked since the previous fix, how fast, whether she is
         * moving at all, and how sure the phone is. The latitude and longitude
         * themselves are never part of this event.
         */
        fun gpsMotion(
            zone: String,
            distanceM: Double,
            speedKmh: Double,
            moving: Boolean,
            accuracyM: Double,
            nowMs: Long = System.currentTimeMillis(),
        ): SignalEvent = SignalEvent(
            type = Types.GPS_MOTION,
            value = JsonPrimitive(zone),
            ts = nowMs,
            meta = mapOf(
                "zone" to JsonPrimitive(zone),
                "distanceM" to JsonPrimitive(distanceM),
                "speedKmh" to JsonPrimitive(speedKmh),
                "moving" to JsonPrimitive(moving),
                "accuracyM" to JsonPrimitive(accuracyM),
            ),
        )
    }
}
