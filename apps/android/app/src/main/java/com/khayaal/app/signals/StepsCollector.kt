package com.khayaal.app.signals

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.khayaal.app.data.datastore.PairingStore
import com.khayaal.app.data.queue.SignalQueue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.util.concurrent.atomic.AtomicBoolean

/**
 * "She walked a little today" — the gentlest activity number there is.
 * [Sensor.TYPE_STEP_COUNTER] is a cumulative counter (needs ACTIVITY_RECOGNITION
 * on API 29+); [StepsAccumulator] turns it into a daily delta that resets at
 * midnight, and [drainInto] adds one absolute snapshot per 30 minutes so the
 * backend sees the day's total even when she rests between steps.
 *
 * Never a route, never a position — a single number.
 */
class StepsCollector(
    private val context: Context,
    private val store: PairingStore,
    private val onEvent: (SignalEvent) -> Unit,
) : SensorEventListener {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val registering = AtomicBoolean(false)
    private val sensorManager = context.getSystemService(SensorManager::class.java)

    fun start() {
        if (!hasActivityRecognitionPermission()) return
        val sensor = sensorManager?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) ?: return
        if (registering.compareAndSet(false, true)) {
            runCatching { sensorManager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_UI) }
                .onFailure { registering.set(false) }
        }
    }

    fun stop() {
        if (registering.compareAndSet(true, false)) {
            runCatching { sensorManager.unregisterListener(this) }
        }
    }

    override fun onSensorChanged(event: SensorEvent) {
        val cumulative = event.values.firstOrNull()?.toDouble() ?: return
        // event.timestamp is uptime-nanoseconds, not epoch — use wall clock.
        val nowMs = System.currentTimeMillis()
        scope.launch {
            val today = LocalDate.now().toString()
            val state = store.stepsState()
            val accumulator = StepsAccumulator(state.day, state.dayTotal, state.lastCumulative)
            val outcome = accumulator.onSample(cumulative, today)
            store.setStepsState(accumulator.day ?: today, accumulator.dayTotal, accumulator.lastCumulative)
            if (outcome.changed && outcome.dayTotal > 0) {
                onEvent(SignalEvent.steps(outcome.dayTotal, nowMs))
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    private fun hasActivityRecognitionPermission(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACTIVITY_RECOGNITION,
        ) == PackageManager.PERMISSION_GRANTED
    }

    companion object {
        /** One absolute "steps today" snapshot per 30 minutes, at flush time. */
        private const val PERIODIC_MS = 30 * 60 * 1000L

        /**
         * Called from the flush worker: rolls the day over if midnight passed
         * without a step, then posts one absolute daily total. The listener
         * instance is not needed — the accumulator state lives in DataStore.
         */
        suspend fun drainInto(store: PairingStore, queue: SignalQueue) {
            val today = LocalDate.now().toString()
            val state = store.stepsState()
            if (state.day != null && state.day != today) {
                // Midnight passed with no sample: start the new day at zero.
                store.setStepsState(today, 0, state.lastCumulative)
            }
            val now = System.currentTimeMillis()
            val current = store.stepsState()
            if (current.dayTotal > 0 && now - store.currentStepsPeriodicTs() >= PERIODIC_MS) {
                queue.enqueue(SignalEvent.steps(current.dayTotal))
                store.setStepsPeriodicTs(now)
            }
        }
    }
}
