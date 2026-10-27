package com.khayaal.app.ui.home

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.khayaal.app.KhayaalApp
import com.khayaal.app.data.api.StateDto
import com.khayaal.app.signals.WorkScheduler
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * The parent's daily view: one card, one button. Polls the backend once a
 * minute while alive (the WorkManager poll covers the background), mirrors
 * the API's status strings verbatim, and never touches anything sensor-ish.
 */
class HomeViewModel(application: Application) : AndroidViewModel(application) {

    data class HomeUiState(
        val parentName: String = "",
        val childName: String = "",
        val state: StateDto? = null,
        val simNowTs: Long? = null,
        val loading: Boolean = true,
        val offline: Boolean = false,
        val justCheckedIn: Boolean = false,
        val homeSsid: String? = null,
        val baseUrl: String = "",
        val ingestError: String? = null,
    )

    private val container = (application as KhayaalApp).container
    private val appContext = application

    private val _ui = MutableStateFlow(HomeUiState())
    val ui: StateFlow<HomeUiState> = _ui.asStateFlow()

    init {
        viewModelScope.launch {
            val pairing = container.pairingStore.current()
            _ui.update {
                it.copy(
                    parentName = pairing?.parentName.orEmpty(),
                    homeSsid = pairing?.homeSsid,
                )
            }
        }
        viewModelScope.launch {
            container.repository.lastIngestError.collect { message ->
                _ui.update { it.copy(ingestError = message) }
            }
        }
        viewModelScope.launch {
            container.pairingStore.baseUrlFlow.collect { url ->
                _ui.update { it.copy(baseUrl = url) }
            }
        }
        viewModelScope.launch {
            while (isActive) {
                refresh()
                delay(POLL_INTERVAL_MS)
            }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            container.repository.fetchState()
                .onSuccess { bundle ->
                    _ui.update { current ->
                        current.copy(
                            state = bundle.state ?: current.state,
                            parentName = bundle.household?.parentName?.takeIf { it.isNotBlank() }
                                ?: current.parentName,
                            childName = bundle.household?.childName.orEmpty(),
                            simNowTs = bundle.simNowTs,
                            offline = false,
                            loading = false,
                        )
                    }
                }
                .onFailure {
                    _ui.update { it.copy(offline = true, loading = false) }
                }
        }
    }

    /** The one-tap "I'm OK": posts the check-in and lets the family know at once. */
    fun checkIn() {
        viewModelScope.launch {
            container.repository.checkIn()
                .onSuccess { bundle ->
                    _ui.update {
                        it.copy(
                            state = bundle.state ?: it.state,
                            justCheckedIn = true,
                            offline = false,
                        )
                    }
                    WorkScheduler.flushNow(appContext, expedited = false)
                    delay(CHECKIN_CONFIRMATION_MS)
                    _ui.update { it.copy(justCheckedIn = false) }
                }
                .onFailure {
                    _ui.update { it.copy(offline = true) }
                }
        }
    }

    fun snoozeOneHour() {
        viewModelScope.launch {
            container.repository.snooze(DEFAULT_SNOOZE_MINUTES)
                .onSuccess { bundle ->
                    _ui.update { it.copy(state = bundle.state ?: it.state) }
                }
                .onFailure {
                    _ui.update { it.copy(offline = true) }
                }
        }
    }

    fun saveBaseUrl(rawUrl: String) {
        viewModelScope.launch {
            runCatching { container.repository.setBaseUrl(rawUrl) }
        }
    }

    fun saveHomeSsid(rawSsid: String) {
        viewModelScope.launch {
            container.repository.setHomeSsid(rawSsid.trim().ifBlank { null })
            val pairing = container.pairingStore.current()
            _ui.update { it.copy(homeSsid = pairing?.homeSsid) }
        }
    }

    /** Unpairing clears every stored identity; navigation back to pairing is reactive. */
    fun unpair() {
        viewModelScope.launch {
            container.repository.unpair()
        }
    }

    companion object {
        private const val POLL_INTERVAL_MS = 60_000L
        private const val CHECKIN_CONFIRMATION_MS = 4_000L
        private const val DEFAULT_SNOOZE_MINUTES = 60L
    }
}
