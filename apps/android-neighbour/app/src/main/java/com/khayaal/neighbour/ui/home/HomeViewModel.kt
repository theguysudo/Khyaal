package com.khayaal.neighbour.ui.home

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.khayaal.neighbour.NeighbourApp
import com.khayaal.neighbour.data.api.NeighbourBundleDto
import com.khayaal.neighbour.data.datastore.PairingInfo
import com.khayaal.neighbour.sos.NeighbourSosManager
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * The neighbour's whole world: one bit — are they needed right now? — the
 * on-duty toggle (private, local only), and "I'm responding" when an SOS is
 * live. Polls /state every ~2 s, the same cadence as the family dashboard,
 * and feeds [NeighbourSosManager] — PATH B of the alarm, no Firebase needed.
 */
class HomeViewModel(application: Application) : AndroidViewModel(application) {

    data class HomeUiState(
        val pairing: PairingInfo? = null,
        val memberName: String = "",
        val bundle: NeighbourBundleDto? = null,
        val loading: Boolean = true,
        val offline: Boolean = false,
        /** The neighbour's private availability — local only, never sent. */
        val offDuty: Boolean = false,
        /** True for a beat after "I'm responding" lands. */
        val respondedNotice: Boolean = false,
        val respondError: Boolean = false,
    ) {
        val state get() = bundle?.state
        val sos get() = bundle?.sos
        val sosActive: Boolean get() = sos?.active == true
        val tier: Int get() = state?.tier ?: 0
        val parentName: String get() = bundle?.household?.parentName.orEmpty()
    }

    private val container = (application as NeighbourApp).container
    private val appContext = application

    private val _ui = MutableStateFlow(HomeUiState())
    val ui: StateFlow<HomeUiState> = _ui.asStateFlow()

    init {
        viewModelScope.launch {
            _ui.update {
                it.copy(
                    pairing = container.store.current(),
                    memberName = container.store.currentMemberName(),
                    offDuty = container.store.currentOffDuty(),
                )
            }
        }
        // The ~2 s poll — the web dashboard's cadence, and PATH B of the alarm.
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
                    // PATH B (state poll → siren): honours off-duty and the
                    // per-SOS silence; works with no Firebase at all.
                    NeighbourSosManager.onSosObservation(appContext, bundle.sos, "foreground-poll")
                    _ui.update { it.copy(bundle = bundle, offline = false, loading = false) }
                }
                .onFailure {
                    _ui.update { it.copy(offline = true, loading = false) }
                }
        }
    }

    // -- On duty ------------------------------------------------------------------

    /**
     * The on-duty toggle. Local only — the server is never told. Going off
     * duty mid-SOS does not stop an alarm already ringing (the policy stops
     * only on the SOS's own inactive edge); it prevents the NEXT start.
     */
    fun setOffDuty(offDuty: Boolean) {
        _ui.update { it.copy(offDuty = offDuty) }
        viewModelScope.launch {
            container.store.setOffDuty(offDuty)
        }
    }

    // -- Responding ---------------------------------------------------------------

    /** "I'm responding", signed with the neighbour's name, ETA optional. */
    fun respond(etaMin: Long?) {
        viewModelScope.launch {
            _ui.update { it.copy(respondError = false) }
            container.repository
                .respondSos(_ui.value.memberName.ifBlank { "Neighbour" }, etaMin)
                .onSuccess {
                    _ui.update { it.copy(respondedNotice = true, respondError = false) }
                    delay(RESPONDED_NOTICE_MS)
                    _ui.update { it.copy(respondedNotice = false) }
                }
                .onFailure {
                    _ui.update { it.copy(respondError = true) }
                }
        }
    }

    // -- Settings ---------------------------------------------------------------------

    fun unpair() {
        viewModelScope.launch {
            container.repository.unpair()
        }
    }

    companion object {
        /** The web dashboard polls every 1.5 s; the app rounds to 2 s. */
        const val POLL_INTERVAL_MS = 2_000L
        private const val RESPONDED_NOTICE_MS = 3_000L
    }
}
