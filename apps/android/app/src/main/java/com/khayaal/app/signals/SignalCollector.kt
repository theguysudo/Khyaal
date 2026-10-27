package com.khayaal.app.signals

import android.content.Context
import com.khayaal.app.data.datastore.PairingStore
import com.khayaal.app.data.queue.SignalQueue

/**
 * Registers and unregisters every passive listener in one call. The collectors
 * are deliberately tiny: each turns one harmless system signal into a
 * [SignalEvent] and hands it to the [SignalRecorder].
 */
class SignalCollector(
    context: Context,
    store: PairingStore,
    recorder: SignalRecorder,
) {
    private val screen = ScreenEventCollector(context, recorder::record)
    private val charging = ChargingCollector(context, store, recorder::record)
    private val motion = MotionCollector(context, recorder::record)
    private val wifi = WifiPresenceCollector(context, store, recorder::record)

    /** Safe to call once per process; no-ops gracefully when already running. */
    fun start() {
        screen.start()
        charging.start()
        motion.start()
        wifi.start()
    }

    fun stop() {
        screen.stop()
        charging.stop()
        motion.stop()
        wifi.stop()
    }
}
