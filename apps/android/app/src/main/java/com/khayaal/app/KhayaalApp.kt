package com.khayaal.app

import android.app.Application
import com.khayaal.app.care.CheckInManager
import com.khayaal.app.data.api.ApiClient
import com.khayaal.app.data.datastore.PairingStore
import com.khayaal.app.data.queue.SignalQueue
import com.khayaal.app.data.repo.KhayaalRepository
import com.khayaal.app.signals.SignalCollector
import com.khayaal.app.signals.SignalRecorder
import com.khayaal.app.signals.WorkScheduler

/**
 * Application entry: wires the tiny hand-rolled container (no DI framework —
 * the graph is six objects), creates the notification channels, schedules the
 * periodic jobs and turns on the passive listeners.
 */
class KhayaalApp : Application() {

    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        CheckInManager.ensureChannels(this)
        WorkScheduler.ensurePeriodicWork(this)
        container.signalCollector.start()
    }
}

/** Six-object service locator; everything the app needs, nothing it doesn't. */
class AppContainer(context: android.content.Context) {
    private val appContext = context.applicationContext

    val pairingStore = PairingStore(appContext)
    val signalQueue = SignalQueue(pairingStore)
    val apiClient = ApiClient()
    val repository = KhayaalRepository(pairingStore, apiClient, signalQueue)
    val signalRecorder = SignalRecorder(appContext, pairingStore, signalQueue)
    val signalCollector = SignalCollector(appContext, pairingStore, signalRecorder)
}
