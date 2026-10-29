package com.khayaal.family.ui.home

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.khayaal.family.FamilyApp
import com.khayaal.family.data.api.CommandCreateRequest
import com.khayaal.family.data.api.EventDto
import com.khayaal.family.data.api.FamilyBundleDto
import com.khayaal.family.data.api.SosStateDto
import com.khayaal.family.data.datastore.PairingInfo
import com.khayaal.family.sos.FamilySosManager
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import retrofit2.HttpException

/**
 * The family's view of the household: one status, the reasons behind it, the
 * day's events, and the SOS. Polls /state every ~2 seconds — the same cadence
 * as the web dashboard, and PATH B of SOS delivery when Firebase is absent.
 */
class HomeViewModel(application: Application) : AndroidViewModel(application) {

    data class HomeUiState(
        val pairing: PairingInfo? = null,
        val memberName: String = "",
        val bundle: FamilyBundleDto? = null,
        val loading: Boolean = true,
        val offline: Boolean = false,
        // The composer ("Reach her phone").
        val composerText: String = "",
        val composerLang: String = CommandCreateRequest.LANG_EN,
        val sending: Boolean = false,
        val sentNotice: Boolean = false,
        val composerError: String? = null,
    ) {
        val state get() = bundle?.state
        val household get() = bundle?.household
        val sos: SosStateDto? get() = bundle?.sos
        val sosActive: Boolean get() = sos?.active == true
        val events: List<EventDto> get() = bundle?.events.orEmpty()

        // -- The v2 dashboard's data -------------------------------------

        /** The wellbeing score 0–100, or null while the engine learns. */
        val score: Int? get() = state?.scoreValue

        /** Who else is watching — the paired devices, freshest first. */
        val sources get() = bundle?.sources.orEmpty()

        /** The phone's step total today (movement summary). */
        val stepsToday: Long? get() = bundle?.movement?.stepsToday

        /** Where she is, in one word: home / away / null (no GPS yet). */
        val zone: String? get() = bundle?.movement?.zone

        /** The band's sleep minutes last night, when a band is paired. */
        val sleepMinutes: Int? get() = bundle?.smartwatch?.sleepMinutesLastNight

        /** The band's last pulse, when a band is paired. */
        val heartRateBpm: Long? get() = bundle?.smartwatch?.heartRateBpm

        /** The server's clock for "today" filters and last-seen windows. */
        val nowTs: Long get() = bundle?.simNowTs ?: System.currentTimeMillis()
    }

    private val container = (application as FamilyApp).container
    private val appContext = application

    private val _ui = MutableStateFlow(HomeUiState())
    val ui: StateFlow<HomeUiState> = _ui.asStateFlow()

    init {
        viewModelScope.launch {
            _ui.update { it.copy(pairing = container.store.current(), memberName = container.store.currentMemberName()) }
        }
        // The ~2 s poll — the web dashboard's cadence. Also PATH B of SOS
        // delivery: FamilySosManager latches the SOS edges from every tick.
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
                    // PATH B (state poll → siren): works with no Firebase at all.
                    FamilySosManager.onSosObservation(appContext, bundle.sos, "foreground-poll")
                    _ui.update { it.copy(bundle = bundle, offline = false, loading = false) }
                }
                .onFailure {
                    _ui.update { it.copy(offline = true, loading = false) }
                }
        }
    }

    // -- Reach her phone ------------------------------------------------------------

    fun onComposerText(text: String) {
        _ui.update { it.copy(composerText = text, composerError = null) }
    }

    fun onComposerLang(lang: String) {
        _ui.update { it.copy(composerLang = lang) }
    }

    /**
     * Sends a message / reminder / voice note to her phone. The three types
     * are the web dashboard's POST /commands vocabulary. The backend currently
     * reserves this route for a family *session* — a paired phone may get
     * 404, and the UI says so honestly rather than pretending it sent.
     */
    fun sendCommand(type: String) {
        val text = _ui.value.composerText.trim()
        if (text.isEmpty() || _ui.value.sending) return
        viewModelScope.launch {
            _ui.update { it.copy(sending = true, composerError = null) }
            container.repository.sendCommand(type, text, _ui.value.composerLang)
                .onSuccess {
                    _ui.update { current ->
                        current.copy(sending = false, sentNotice = true, composerText = "")
                    }
                    delay(SENT_NOTICE_MS)
                    _ui.update { it.copy(sentNotice = false) }
                }
                .onFailure { failure ->
                    _ui.update { current ->
                        current.copy(
                            sending = false,
                            composerError = if (container.repository.isAuthOrMissing(failure)) {
                                appContext.getString(
                                    com.khayaal.family.R.string.reach_error,
                                    (failure as? HttpException)?.code() ?: 0,
                                )
                            } else {
                                appContext.getString(com.khayaal.family.R.string.reach_error_generic)
                            },
                        )
                    }
                }
        }
    }

    // -- SOS -------------------------------------------------------------------------

    /** Stands the SOS down under this family member's name. */
    fun standDownSos() {
        viewModelScope.launch {
            FamilySosManager.onUserStoodDown(appContext)
            val name = _ui.value.memberName.ifBlank { "Family" }
            container.repository.resolveSos(name)
            refresh()
        }
    }

    // -- Settings ---------------------------------------------------------------------

    fun saveBaseUrl(rawUrl: String) {
        viewModelScope.launch {
            runCatching { container.repository.setBaseUrl(rawUrl) }
            _ui.update { it.copy(pairing = container.store.current()) }
        }
    }

    fun unpair() {
        viewModelScope.launch {
            container.repository.unpair()
        }
    }

    companion object {
        /** The web dashboard polls every 1.5 s; the app rounds to 2 s. */
        const val POLL_INTERVAL_MS = 2_000L
        private const val SENT_NOTICE_MS = 3_000L
    }
}
