package com.khayaal.app.ui.home

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.khayaal.app.KhayaalApp
import com.khayaal.app.data.api.CareCircleMemberDto
import com.khayaal.app.data.api.CallPlanDto
import com.khayaal.app.data.api.CommandDto
import com.khayaal.app.data.api.StateDto
import com.khayaal.app.data.datastore.CallChainState
import com.khayaal.app.data.datastore.SleepMilestone
import com.khayaal.app.signals.WorkScheduler
import com.khayaal.app.sleep.SleepWatchManager
import com.khayaal.app.voice.VoiceCommandManager
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * The parent's daily view: one card, one button, a few gentle helpers. Polls
 * the backend once a minute while alive (the WorkManager poll covers the
 * background), mirrors the API's status strings verbatim, and keeps the UI's
 * toggles honest by reading their live state out of DataStore.
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
        // Care circle & call plan (tier-3 alarm).
        val careCircle: List<CareCircleMemberDto> = emptyList(),
        val callPlan: CallPlanDto? = null,
        // Night watch (mic, opt-in).
        val nightWatchEnabled: Boolean = false,
        val nightWatchActive: Boolean = false,
        // "Hey Khayaal" voice commands (opt-in).
        val voiceEnabled: Boolean = false,
        val voiceActive: Boolean = false,
        // Small daily texture.
        val stepsToday: Long = 0,
        val lastSleep: SleepMilestone? = null,
        // Family→app commands (Reminders screen).
        val commands: List<CommandDto> = emptyList(),
        // The armed tier-3 call chain (cancellable from the alarm).
        val callChain: CallChainState? = null,
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
            container.pairingStore.nightWatchEnabledFlow.collect { enabled ->
                _ui.update { it.copy(nightWatchEnabled = enabled) }
            }
        }
        viewModelScope.launch {
            container.pairingStore.nightWatchActiveFlow.collect { active ->
                _ui.update { it.copy(nightWatchActive = active) }
            }
        }
        viewModelScope.launch {
            container.pairingStore.voiceCommandsEnabledFlow.collect { enabled ->
                _ui.update { it.copy(voiceEnabled = enabled) }
            }
        }
        viewModelScope.launch {
            container.pairingStore.voiceActiveFlow.collect { active ->
                _ui.update { it.copy(voiceActive = active) }
            }
        }
        viewModelScope.launch {
            container.pairingStore.stepsTodayFlow.collect { steps ->
                _ui.update { it.copy(stepsToday = steps) }
            }
        }
        viewModelScope.launch {
            container.pairingStore.lastSleepEventFlow.collect { milestone ->
                _ui.update { it.copy(lastSleep = milestone) }
            }
        }
        viewModelScope.launch {
            container.pairingStore.commandHistoryFlow.collect { commands ->
                _ui.update { it.copy(commands = commands) }
            }
        }
        viewModelScope.launch {
            container.pairingStore.callChainFlow.collect { chain ->
                _ui.update { it.copy(callChain = chain) }
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
                            careCircle = bundle.household?.careCircle ?: current.careCircle,
                            callPlan = bundle.household?.callPlan ?: current.callPlan,
                            simNowTs = bundle.simNowTs,
                            offline = false,
                            loading = false,
                        )
                    }
                    // Family→app commands (dedupe + ack live in the coordinator).
                    runCatching { container.commandCoordinator.onBundle(bundle) }
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

    // -- Night watch ------------------------------------------------------------

    /** Called after the UI has confirmed RECORD_AUDIO is granted. */
    fun setNightWatch(enabled: Boolean) {
        viewModelScope.launch {
            runCatching {
                if (enabled) {
                    SleepWatchManager.start(appContext, container.pairingStore)
                } else {
                    SleepWatchManager.stop(appContext, container.pairingStore)
                }
            }
        }
    }

    // -- "Hey Khayaal" voice commands ---------------------------------------------

    fun setVoiceCommands(enabled: Boolean) {
        viewModelScope.launch {
            runCatching {
                if (enabled) {
                    VoiceCommandManager.start(appContext, container.pairingStore)
                } else {
                    VoiceCommandManager.stop(appContext, container.pairingStore)
                }
            }
        }
    }

    // -- Tier-3 call chain ---------------------------------------------------------

    fun cancelCallChain() {
        viewModelScope.launch {
            runCatching {
                com.khayaal.app.care.CallChainManager.cancel(appContext, container.pairingStore)
                com.khayaal.app.care.CallChainNotifier.cancel(appContext)
            }
        }
    }

    // -- Settings --------------------------------------------------------------------

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
            runCatching {
                SleepWatchManager.stop(appContext, container.pairingStore)
                VoiceCommandManager.stop(appContext, container.pairingStore)
            }
            container.repository.unpair()
        }
    }

    companion object {
        private const val POLL_INTERVAL_MS = 60_000L
        private const val CHECKIN_CONFIRMATION_MS = 4_000L
        private const val DEFAULT_SNOOZE_MINUTES = 60L
    }
}
