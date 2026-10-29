package com.khayaal.family

import android.app.Application
import com.khayaal.family.care.WorkScheduler
import com.khayaal.family.data.api.ApiClient
import com.khayaal.family.data.api.DeviceCredentials
import com.khayaal.family.data.datastore.FamilyStore
import com.khayaal.family.data.repo.FamilyRepository
import com.khayaal.family.sos.FamilySosManager
import kotlinx.coroutines.runBlocking

/**
 * Application entry: the tiny hand-rolled container (no DI framework — the
 * same style as the elder app), the notification channels, and the
 * background poll that keeps the SOS path alive when the app is closed.
 */
class FamilyApp : Application() {

    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        // Arm the source-key auth header for this process from the stored
        // pairing (pairWithCode arms it live; this covers app restarts).
        runBlocking {
            runCatching {
                container.store.current()?.let { pairing ->
                    container.apiClient.deviceCredentials = DeviceCredentials(
                        householdId = pairing.householdId,
                        sourceId = pairing.sourceId,
                        apiKey = pairing.apiKey,
                    )
                }
            }
        }
        FamilySosManager.ensureChannel(this)
        WorkScheduler.ensurePeriodicStatePoll(this)
    }
}

/** The whole dependency graph; everything the app needs, nothing it doesn't. */
class AppContainer(context: android.content.Context) {
    private val appContext = context.applicationContext

    val store = FamilyStore(appContext)
    val apiClient = ApiClient()
    val repository = FamilyRepository(store, apiClient)
}
