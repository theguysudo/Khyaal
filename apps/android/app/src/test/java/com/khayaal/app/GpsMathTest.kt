package com.khayaal.app

import com.khayaal.app.data.datastore.HomeGeofence
import com.khayaal.app.signals.GpsMath
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The movement maths on the phone. These are the numbers that decide
 * "home / away" and "moving / still" — they must be right, because they are
 * the only thing the family ever hears about where she is.
 */
class GpsMathTest {

    @Test
    fun `distance between two points is metres`() {
        // Roughly 111 m per 0.001 degree of latitude.
        val distance = GpsMath.distanceMeters(28.6139, 77.2090, 28.6149, 77.2090)
        assertTrue("expected about 111 m, got $distance", distance in 100.0..125.0)
    }

    @Test
    fun `distance between the same point is zero`() {
        assertEquals(0.0, GpsMath.distanceMeters(28.6139, 77.2090, 28.6139, 77.2090), 0.001)
    }

    @Test
    fun `a fix inside the circle is home`() {
        val geofence = HomeGeofence(centerLat = 28.6139, centerLon = 77.2090, radiusM = 150.0)
        assertEquals(
            GpsMath.ZONE_HOME,
            GpsMath.zoneFor(28.6140, 77.2091, geofence, accuracyM = 10.0),
        )
    }

    @Test
    fun `a fix far outside the circle is away`() {
        val geofence = HomeGeofence(centerLat = 28.6139, centerLon = 77.2090, radiusM = 150.0)
        assertEquals(
            GpsMath.ZONE_AWAY,
            GpsMath.zoneFor(28.6339, 77.2090, geofence, accuracyM = 10.0),
        )
    }

    @Test
    fun `without a learned circle nothing is home`() {
        assertEquals(
            GpsMath.ZONE_AWAY,
            GpsMath.zoneFor(28.6139, 77.2090, geofence = null, accuracyM = 5.0),
        )
    }

    @Test
    fun `a blurry fix never claims home`() {
        val geofence = HomeGeofence(centerLat = 28.6139, centerLon = 77.2090, radiusM = 150.0)
        assertEquals(
            GpsMath.ZONE_AWAY,
            GpsMath.zoneFor(28.6139, 77.2090, geofence, accuracyM = 500.0),
        )
    }

    @Test
    fun `a walking pace means moving`() {
        assertTrue(GpsMath.isMoving(speedKmh = 4.2, distanceM = 20.0, elapsedMs = 20_000L))
    }

    @Test
    fun `standing still is not moving`() {
        assertTrue(!GpsMath.isMoving(speedKmh = 0.0, distanceM = 0.4, elapsedMs = 60_000L))
    }

    @Test
    fun `a short walk between two fixes counts as moving`() {
        // No speed reported, but she covered 12 m in half a minute.
        assertTrue(GpsMath.isMoving(speedKmh = 0.0, distanceM = 12.0, elapsedMs = 30_000L))
    }
}
