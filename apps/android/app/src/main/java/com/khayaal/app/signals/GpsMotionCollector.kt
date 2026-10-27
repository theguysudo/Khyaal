package com.khayaal.app.signals

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Looper
import androidx.core.content.ContextCompat
import com.khayaal.app.data.datastore.GpsFix
import com.khayaal.app.data.datastore.GpsState
import com.khayaal.app.data.datastore.HomeGeofence
import com.khayaal.app.data.datastore.HomeLearningState
import com.khayaal.app.data.datastore.PairingStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * "Is she home, and has she been moving?" — computed entirely on the phone.
 *
 * LocationManager with the GPS and NETWORK providers, deliberately not the
 * fused provider: fused location needs Google Play services, and her phone
 * must not depend on that. Both providers are coarse-friendly, so
 * ACCESS_COARSE_LOCATION is enough and the fine permission is never asked for.
 *
 * The privacy rule, in one sentence: the latitude and longitude stay in this
 * phone. What leaves is a zone word ("home" / "away") and four movement
 * numbers — distance since the previous fix, speed, whether she is moving,
 * and how accurate the fix is.
 *
 * The home circle is learned here too: the phone watches where it sits for a
 * while, works out the centre and a generous radius, and then answers
 * "home / away" from that circle alone.
 */
class GpsMotionCollector(
    private val context: Context,
    private val store: PairingStore,
    private val onEvent: (SignalEvent) -> Unit,
) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val locationManager = context.getSystemService(LocationManager::class.java)
    private var listening = false

    /** The last zone we reported — the plain location_zone signal is a change event. */
    private var lastReportedZone: String? = null

    private val listener = object : LocationListener {
        override fun onLocationChanged(location: Location) {
            scope.launch { handleFix(location) }
        }

        // The old (pre-API 30) callbacks are required on some OEM builds even
        // though the modern ones are called as well.
        override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
        override fun onProviderEnabled(provider: String) = Unit
        override fun onProviderDisabled(provider: String) = Unit
    }

    fun start() {
        if (listening) return
        if (!hasLocationPermission()) return
        val manager = locationManager ?: return
        var registered = false
        for (provider in PROVIDERS) {
            if (!runCatching { manager.isProviderEnabled(provider) }.getOrDefault(false)) continue
            val ok = runCatching {
                manager.requestLocationUpdates(
                    provider,
                    MIN_INTERVAL_MS,
                    MIN_DISTANCE_M,
                    listener,
                    Looper.getMainLooper(),
                )
            }.isSuccess
            registered = registered || ok
        }
        listening = registered
    }

    fun stop() {
        if (!listening) return
        runCatching { locationManager?.removeUpdates(listener) }
        listening = false
    }

    /**
     * One fix in, one summary out. The order matters: learn the home circle
     * first (a fix may be the one that completes it), then classify, then
     * measure the distance from the previous fix.
     */
    private suspend fun handleFix(location: Location) {
        val lat = location.latitude
        val lon = location.longitude
        val nowMs = System.currentTimeMillis()
        val accuracy = location.accuracy.toDouble().coerceAtLeast(0.0)

        val geofence = learnHomeCircle(lat, lon) ?: store.currentHomeGeofence()
        val zone = GpsMath.zoneFor(lat, lon, geofence, accuracy)

        val previous = store.lastGpsFix()
        val distance = if (previous == null) {
            0.0
        } else {
            GpsMath.distanceMeters(previous.lat, previous.lon, lat, lon)
        }
        val elapsedMs = if (previous == null) 0L else (nowMs - previous.ts).coerceAtLeast(0L)

        // Prefer the fix's own speed; fall back to the distance we just walked.
        val speedKmh = if (location.hasSpeed()) {
            location.speed * 3.6
        } else if (elapsedMs > 0) {
            (distance / elapsedMs) * 3_600_000.0
        } else {
            0.0
        }
        val moving = GpsMath.isMoving(speedKmh, distance, elapsedMs)

        store.setLastGpsFix(GpsFix(lat = lat, lon = lon, ts = nowMs))
        val previousState = store.gpsStateFlowFirst()
        store.setGpsState(
            GpsState(
                zone = zone,
                moving = moving,
                speedKmh = speedKmh,
                distanceM = distance,
                accuracyM = accuracy,
                totalDistanceM = previousState.totalDistanceM + distance,
                lastFixTs = nowMs,
            ),
        )

        // The one GPS signal: a zone word and four movement numbers.
        onEvent(
            SignalEvent.gpsMotion(
                zone = zone,
                distanceM = distance,
                speedKmh = speedKmh,
                moving = moving,
                accuracyM = accuracy,
                nowMs = nowMs,
            ),
        )

        // The plain zone signal is a *change* event — the engine reads it as
        // "she is away now", so it must not be re-posted every fix.
        if (zone != lastReportedZone) {
            lastReportedZone = zone
            onEvent(SignalEvent.presence(home = zone == GpsMath.ZONE_HOME, nowMs = nowMs))
        }
    }

    /**
     * Learns the home circle from the fixes it has seen. Returns the finished
     * circle the moment enough samples have collected, null while learning.
     */
    private suspend fun learnHomeCircle(lat: Double, lon: Double): HomeGeofence? {
        val existing = store.currentHomeGeofence()
        if (existing != null) return existing

        val learning = store.homeLearningState()
        val samples = learning.samples + 1
        val latSum = learning.latSum + lat
        val lonSum = learning.lonSum + lon
        val centerLat = latSum / samples
        val centerLon = lonSum / samples
        val spread = maxOf(
            learning.spreadM,
            GpsMath.distanceMeters(centerLat, centerLon, lat, lon),
        )
        store.setHomeLearningState(
            HomeLearningState(samples = samples, latSum = latSum, lonSum = lonSum, spreadM = spread),
        )
        if (samples < LEARN_SAMPLES) return null

        // A generous circle: the widest place she was seen, plus a margin for
        // the garden and the neighbour's driveway.
        val radius = maxOf(MIN_RADIUS_M, spread * 1.5)
        val geofence = HomeGeofence(centerLat = centerLat, centerLon = centerLon, radiusM = radius)
        store.setHomeGeofence(geofence)
        return geofence
    }

    private fun hasLocationPermission(): Boolean =
        ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_COARSE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_FINE_LOCATION,
            ) == PackageManager.PERMISSION_GRANTED

    companion object {
        /** GPS and NETWORK — no fused provider, no Play Services dependency. */
        private val PROVIDERS = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)

        /** A fix at most every 30 seconds — enough to see movement, kind to the battery. */
        private const val MIN_INTERVAL_MS = 30_000L

        /** Distance filter off: stillness is just as interesting as movement. */
        private const val MIN_DISTANCE_M = 0f

        /** How many fixes are needed before the home circle is trusted. */
        const val LEARN_SAMPLES = 5

        /** The smallest home circle we will ever use. */
        const val MIN_RADIUS_M = 150.0
    }
}

/** Reads the first value of a DataStore flow — a small convenience. */
private suspend fun com.khayaal.app.data.datastore.PairingStore.gpsStateFlowFirst(): GpsState =
    gpsStateFlow.first()
