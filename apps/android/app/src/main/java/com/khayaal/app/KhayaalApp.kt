package com.khayaal.app

import android.app.Application
import com.khayaal.app.care.CheckInManager
import com.khayaal.app.commands.CommandCoordinator
import com.khayaal.app.commands.TtsSpeaker
import com.khayaal.app.data.api.ApiClient
import com.khayaal.app.data.datastore.PairingStore
import com.khayaal.app.data.queue.SignalQueue
import com.khayaal.app.data.repo.KhayaalRepository
import com.khayaal.app.signals.SignalCollector
import com.khayaal.app.signals.SignalRecorder
import com.khayaal.app.signals.WorkScheduler
import kotlinx.coroutines.runBlocking

/**
 * Application entry: wires the tiny hand-rolled container (no DI framework —
 * the graph is a handful of objects), lifts a legacy plaintext pairing into
 * the encrypted record, creates the notification channels, schedules the
 * periodic jobs and turns on the passive listeners.
 */
class KhayaalApp : Application() {

    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        // One-time migration of a v0.2 plaintext pairing record into the
        // KeyStore-encrypted blob. Outside the flow — editing the DataStore
        // from inside its own collector would deadlock. A few ms at most.
        runBlocking { runCatching { container.pairingStore.migrateLegacyIfNeeded() } }
        // Arm the source-key auth header for this process from the stored
        // pairing (pairWithCode arms it live; this covers app restarts).
        runBlocking {
            runCatching {
                container.pairingStore.current()?.let { pairing ->
                    container.apiClient.deviceCredentials = pairing.sourceId to pairing.apiKey
                }
            }
        }
        CheckInManager.ensureChannels(this)
        CommandCoordinator.ensureChannelStatic(this)
        WorkScheduler.ensurePeriodicWork(this)
        container.signalCollector.start()
    }
}

/** The whole dependency graph; everything the app needs, nothing it doesn't. */
class AppContainer(context: android.content.Context) {
    private val appContext = context.applicationContext

    val pairingStore = PairingStore(appContext)
    val signalQueue = SignalQueue(pairingStore)
    val apiClient = ApiClient()
    val repository = KhayaalRepository(pairingStore, apiClient, signalQueue)
    val signalRecorder = SignalRecorder(appContext, pairingStore, signalQueue)
    val signalCollector = SignalCollector(appContext, pairingStore, signalRecorder)
    val ttsSpeaker = TtsSpeaker(appContext)
    val commandCoordinator = CommandCoordinator(appContext, pairingStore, repository, ttsSpeaker)
}
