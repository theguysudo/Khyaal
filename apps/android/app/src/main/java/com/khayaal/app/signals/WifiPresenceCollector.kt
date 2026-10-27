package com.khayaal.app.signals

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiManager
import com.khayaal.app.data.datastore.PairingStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Presence, the dignified way: is the phone on the home Wi-Fi? The home
 * network name is stored once (in Settings) and compared against the
 * connected SSID. There is no GPS, no scan list, no location permission,
 * no trail — only "home" or "away".
 */
class WifiPresenceCollector(
    private val context: Context,
    private val store: PairingStore,
    private val onEvent: (SignalEvent) -> Unit,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val connectivity = context.getSystemService(ConnectivityManager::class.java)
    private val wifiManager = context.getSystemService(WifiManager::class.java)

    private val request = NetworkRequest.Builder()
        .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
        .build()

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            evaluateConnectedState()
        }

        override fun onLost(network: Network) {
            evaluateLostState()
        }
    }

    fun start() {
        runCatching { connectivity?.registerNetworkCallback(request, networkCallback) }
        // A freshly started phone should restate presence without waiting for
        // a Wi-Fi transition that may never come.
        if (isOnWifi()) evaluateConnectedState()
    }

    fun stop() {
        runCatching { connectivity?.unregisterNetworkCallback(networkCallback) }
    }

    private fun evaluateConnectedState() {
        scope.launch {
            val homeSsid = store.currentHomeSsid() ?: return@launch // no home network configured
            val ssid = readConnectedSsid() ?: return@launch // SSID unreadable — never guess
            emitPresence(home = ssid.equals(homeSsid, ignoreCase = true))
        }
    }

    private fun evaluateLostState() {
        scope.launch {
            // Only report "away" when we had positively confirmed "home".
            // Losing an unknown Wi-Fi (a cafe, transit) is not evidence she left.
            if (store.currentWifiPresentHome() == true) {
                emitPresence(home = false)
            }
        }
    }

    private fun emitPresence(home: Boolean) {
        scope.launch {
            store.setWifiPresentHome(home)
            onEvent(SignalEvent.presence(home))
        }
    }

    private fun isOnWifi(): Boolean {
        val manager = connectivity ?: return false
        val network = manager.activeNetwork ?: return false
        val capabilities = manager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
    }

    private fun readConnectedSsid(): String? = runCatching {
        val info = wifiManager?.connectionInfo ?: return null
        val ssid = info.ssid?.removeSurrounding("\"")?.trim()
        if (ssid.isNullOrEmpty() || ssid == UNKNOWN_SSID) null else ssid
    }.getOrNull()

    private companion object {
        /** What the framework returns when the SSID is not readable. */
        const val UNKNOWN_SSID = "<unknown ssid>"
    }
}
