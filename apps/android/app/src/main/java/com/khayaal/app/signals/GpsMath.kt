package com.khayaal.app.signals

import com.khayaal.app.data.datastore.HomeGeofence
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * The small amount of geometry the phone needs to turn GPS fixes into
 * "home / away" and "she has walked N metres". Pure maths, no Android
 * imports, so it can be unit-tested without a device.
 *
 * Every function here runs on the phone. The results that leave the phone
 * are a zone word and a few movement numbers — never a latitude or longitude.
 */
object GpsMath {

    private const val EARTH_RADIUS_M = 6_371_000.0

    /** Great-circle distance in metres between two WGS-84 points. */
    fun distanceMeters(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat / 2) * sin(dLat / 2) +
            cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) *
            sin(dLon / 2) * sin(dLon / 2)
        return 2 * EARTH_RADIUS_M * atan2(sqrt(a), sqrt(1 - a))
    }

    /**
     * "home" when the fix falls inside the learned circle, "away" otherwise.
     * A fix too blurry to trust (accuracy worse than the radius itself) is
     * treated as away rather than home — a wrong "home" is worse than a
     * wrong "away", because "home" silences the absence checks.
     */
    fun zoneFor(
        lat: Double,
        lon: Double,
        geofence: HomeGeofence?,
        accuracyM: Double,
    ): String {
        if (geofence == null) return ZONE_AWAY
        val distance = distanceMeters(lat, lon, geofence.centerLat, geofence.centerLon)
        // A fix that is barely better than the circle's own size proves nothing.
        if (accuracyM > geofence.radiusM) return ZONE_AWAY
        return if (distance <= geofence.radiusM) ZONE_HOME else ZONE_AWAY
    }

    /** Walking pace is roughly 4–5 km/h; anything faster is a vehicle. */
    fun isMoving(speedKmh: Double, distanceM: Double, elapsedMs: Long): Boolean {
        if (speedKmh >= MOVING_SPEED_KMH) return true
        if (elapsedMs <= 0 || distanceM < MIN_MOVING_DISTANCE_M) return false
        // A jump of a few metres between two nearby fixes means she walked.
        val impliedKmh = (distanceM / elapsedMs) * 3_600_000.0
        return impliedKmh >= MOVING_SPEED_KMH
    }

    const val ZONE_HOME = "home"
    const val ZONE_AWAY = "away"

    /** Above this pace she is definitely moving. */
    const val MOVING_SPEED_KMH = 1.5

    /** A fix this far from the previous one counts as movement on its own. */
    const val MIN_MOVING_DISTANCE_M = 4.0
}
