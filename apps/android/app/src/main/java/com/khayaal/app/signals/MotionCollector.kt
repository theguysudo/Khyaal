package com.khayaal.app.signals

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorManager
import android.hardware.TriggerEvent
import android.hardware.TriggerEventListener
import android.os.Build
import androidx.core.content.ContextCompat
import com.google.android.gms.location.ActivityRecognition
import java.util.concurrent.TimeUnit

/**
 * "She moved today" without ever tracking where. Two complementary sources:
 * the Activity Recognition API (walking / on foot) when the ACTIVITY_RECOGNITION
 * permission is granted, and the hardware significant-motion sensor as a
 * fallback that needs no permission and no Play services. Either way the
 * signal is a bare `motion = 1` — never a position.
 */
class MotionCollector(
    private val context: Context,
    private val onEvent: (SignalEvent) -> Unit,
) {
    private var activityPendingIntent: PendingIntent? = null
    private var triggerArmed = false

    private val sensorManager = context.getSystemService(SensorManager::class.java)

    private val significantMotionListener = object : TriggerEventListener() {
        override fun onTrigger(event: TriggerEvent?) {
            onEvent(SignalEvent.motion())
            // Significant motion triggers are one-shot by design; re-arm.
            armSignificantMotion()
        }
    }

    fun start() {
        requestActivityUpdates()
        armSignificantMotion()
    }

    fun stop() {
        removeActivityUpdates()
        disarmSignificantMotion()
    }

    private fun requestActivityUpdates() {
        if (!hasActivityRecognitionPermission()) return
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            REQUEST_CODE_ACTIVITY_UPDATES,
            Intent(context, MotionTransitionReceiver::class.java),
            // Mutable: the system writes the detected-activity extras into it.
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
        )
        val started = runCatching {
            ActivityRecognition.getClient(context)
                .requestActivityUpdates(ACTIVITY_DETECTION_INTERVAL_MS, pendingIntent)
        }.isSuccess
        if (started) activityPendingIntent = pendingIntent
    }

    private fun removeActivityUpdates() {
        val pendingIntent = activityPendingIntent ?: return
        activityPendingIntent = null
        runCatching {
            ActivityRecognition.getClient(context).removeActivityUpdates(pendingIntent)
        }
    }

    private fun armSignificantMotion() {
        if (triggerArmed) return
        val sensor = sensorManager?.getDefaultSensor(Sensor.TYPE_SIGNIFICANT_MOTION) ?: return
        triggerArmed = sensorManager.requestTriggerSensor(significantMotionListener, sensor)
    }

    private fun disarmSignificantMotion() {
        val sensor = sensorManager?.getDefaultSensor(Sensor.TYPE_SIGNIFICANT_MOTION) ?: return
        runCatching { sensorManager.cancelTriggerSensor(significantMotionListener, sensor) }
        triggerArmed = false
    }

    private fun hasActivityRecognitionPermission(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACTIVITY_RECOGNITION,
        ) == PackageManager.PERMISSION_GRANTED
    }

    companion object {
        private const val REQUEST_CODE_ACTIVITY_UPDATES = 4101

        /** Activity updates every five minutes — coarse by intent. */
        private val ACTIVITY_DETECTION_INTERVAL_MS = TimeUnit.MINUTES.toMillis(5)
    }
}
