package com.khayaal.app.smartwatch

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.khayaal.app.signals.SignalEvent
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * The band, read through Health Connect.
 *
 * Fastrack publishes no API of its own. What it *does* publish — the Fastrack
 * Smart World / Titan Smart World app says so on its own store page — is a
 * Health Connect integration, so a Fastrack band's steps, pulse, sleep and
 * active minutes arrive in the Android health store on this phone.
 *
 * This collector reads that store and turns it into Khayaal signals. It is
 * deliberately lossy: the backend wants one step total per day, one pulse an
 * hour, active minutes per hour and one sleep record per night. Nothing else
 * is read, and nothing is stored on the phone beyond the queue.
 *
 * Everything here is best-effort: a band that does not publish a data type
 * simply produces fewer signals, and a phone without Health Connect produces
 * none at all.
 */
class HealthConnectCollector(private val context: Context) {

    /** True when this phone has Health Connect (Android 14+, or the app). */
    fun isAvailable(): Boolean =
        HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE

    /** The permissions Khayaal asks for — the smallest useful set. */
    fun permissions(): Set<String> = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(DistanceRecord::class),
        HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND,
    )

    /** What the user has actually granted so far. */
    suspend fun grantedPermissions(): Set<String> = runCatching {
        if (!isAvailable()) emptySet()
        else HealthConnectClient.getOrCreate(context).permissionController.getGrantedPermissions()
    }.getOrDefault(emptySet())

    /**
     * Read everything since [sinceMs] and turn it into signals.
     * Returns an empty list when Health Connect is missing, nothing is
     * permitted, or the read fails — never an exception to the caller.
     */
    suspend fun collect(sinceMs: Long, sourceId: String): List<SignalEvent> {
        if (!isAvailable()) return emptyList()
        val client = runCatching { HealthConnectClient.getOrCreate(context) }.getOrNull() ?: return emptyList()
        val granted = runCatching { client.permissionController.getGrantedPermissions() }.getOrDefault(emptySet())
        if (granted.isEmpty()) return emptyList()

        val from = Instant.ofEpochMilli(sinceMs)
        val to = Instant.now()
        val range = TimeRangeFilter.between(from, to)
        val events = mutableListOf<SignalEvent>()

        events += readSteps(client, range, granted, sourceId)
        events += readHeartRate(client, range, granted, sourceId)
        events += readSleep(client, range, granted, sourceId)
        events += readActivity(client, range, granted, sourceId)
        return events.sortedBy { it.ts }
    }

    private fun permitted(granted: Set<String>, record: kotlin.reflect.KClass<out androidx.health.connect.client.records.Record>): Boolean =
        runCatching { HealthPermission.getReadPermission(record) }.getOrNull() in granted

    private suspend fun readSteps(
        client: HealthConnectClient,
        range: TimeRangeFilter,
        granted: Set<String>,
        sourceId: String,
    ): List<SignalEvent> {
        if (!permitted(granted, StepsRecord::class)) return emptyList()
        val records = runCatching {
            client.readRecords(ReadRecordsRequest(StepsRecord::class, range)).records
        }.getOrDefault(emptyList())
        if (records.isEmpty()) return emptyList()

        // One absolute total per day — the same meaning the phone's own step
        // counter has.
        val perDay = linkedMapOf<LocalDate, Pair<Long, Long>>()
        for (r in records) {
            val day = r.startTime.atZone(ZoneId.systemDefault()).toLocalDate()
            val prior = perDay[day]
            val total = (prior?.first ?: 0L) + r.count
            val last = maxOf(prior?.second ?: 0L, r.endTime.toEpochMilli())
            perDay[day] = total to last
        }
        val now = System.currentTimeMillis()
        return perDay.map { (day, value) ->
            val endOfDay = day.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli() - 1
            SignalEvent.steps(value.second, sourceId, minOf(endOfDay, now))
        }
    }

    private suspend fun readHeartRate(
        client: HealthConnectClient,
        range: TimeRangeFilter,
        granted: Set<String>,
        sourceId: String,
    ): List<SignalEvent> {
        if (!permitted(granted, HeartRateRecord::class)) return emptyList()
        val records = runCatching {
            client.readRecords(ReadRecordsRequest(HeartRateRecord::class, range)).records
        }.getOrDefault(emptyList())
        if (records.isEmpty()) return emptyList()

        // A band measures every minute. Khayaal needs to know that a pulse
        // exists and roughly what it was — one reading an hour is plenty.
        val perHour = linkedMapOf<Long, SignalEvent>()
        for (r in records) {
            for (sample in r.samples) {
                val ts = sample.time.toEpochMilli()
                val hour = ts - (ts % 3_600_000)
                perHour[hour] = SignalEvent.heartRate(sample.beatsPerMinute, sourceId, ts)
            }
        }
        return perHour.values.toList()
    }

    private suspend fun readSleep(
        client: HealthConnectClient,
        range: TimeRangeFilter,
        granted: Set<String>,
        sourceId: String,
    ): List<SignalEvent> {
        if (!permitted(granted, SleepSessionRecord::class)) return emptyList()
        val records = runCatching {
            client.readRecords(ReadRecordsRequest(SleepSessionRecord::class, range)).records
        }.getOrDefault(emptyList())
        return records.mapNotNull { r ->
            val minutes = ((r.endTime.toEpochMilli() - r.startTime.toEpochMilli()) / 60000L).toInt()
            if (minutes <= 0) return@mapNotNull null
            SignalEvent.sleepDuration(
                minutes = minutes,
                sourceId = sourceId,
                nowMs = r.endTime.toEpochMilli(),
                startTs = r.startTime.toEpochMilli(),
            )
        }
    }

    private suspend fun readActivity(
        client: HealthConnectClient,
        range: TimeRangeFilter,
        granted: Set<String>,
        sourceId: String,
    ): List<SignalEvent> {
        if (!permitted(granted, ActiveCaloriesBurnedRecord::class)) return emptyList()
        val calories = runCatching {
            client.readRecords(ReadRecordsRequest(ActiveCaloriesBurnedRecord::class, range)).records
        }.getOrDefault(emptyList())
        if (calories.isEmpty()) return emptyList()

        val distanceByHour = mutableMapOf<Long, Double>()
        if (permitted(granted, DistanceRecord::class)) {
            val distances = runCatching {
                client.readRecords(ReadRecordsRequest(DistanceRecord::class, range)).records
            }.getOrDefault(emptyList())
            for (d in distances) {
                val hour = d.endTime.toEpochMilli() - (d.endTime.toEpochMilli() % 3_600_000)
                distanceByHour[hour] = (distanceByHour[hour] ?: 0.0) + d.distance.inMeters
            }
        }

        // Health Connect writes one small interval per minute; Khayaal wants
        // the active minutes of an hour, summed.
        val perHour = linkedMapOf<Long, Triple<Int, Double, Long>>()
        for (r in calories) {
            val end = r.endTime.toEpochMilli()
            val hour = end - (end % 3_600_000)
            val minutes = ((r.endTime.toEpochMilli() - r.startTime.toEpochMilli()) / 60000L).toInt()
            val prior = perHour[hour]
            perHour[hour] = Triple(
                (prior?.first ?: 0) + minutes,
                (prior?.second ?: 0.0) + r.energy.inKilocalories,
                maxOf(prior?.third ?: 0L, end),
            )
        }
        return perHour.map { (hour, value) ->
            val meta = mutableMapOf<String, kotlinx.serialization.json.JsonPrimitive>()
            if (value.second > 0) meta["calories"] = kotlinx.serialization.json.JsonPrimitive(value.second.toInt())
            distanceByHour[hour]?.let { meta["distanceM"] = kotlinx.serialization.json.JsonPrimitive(it.toInt()) }
            SignalEvent.activity(value.first, sourceId, value.third, meta)
        }
    }
}
