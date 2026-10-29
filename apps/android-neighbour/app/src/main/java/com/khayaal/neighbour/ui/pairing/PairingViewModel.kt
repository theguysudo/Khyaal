package com.khayaal.neighbour.ui.pairing

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.khayaal.neighbour.NeighbourApp
import com.khayaal.neighbour.R
import com.khayaal.neighbour.care.WorkScheduler
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import retrofit2.HttpException
import java.io.IOException

/**
 * Drives the 6-digit pairing flow — the same join + source-create sequence as
 * the elder app and the web pairing screen — plus the member's name, which
 * labels the source and signs every stand-down.
 */
class PairingViewModel(application: Application) : AndroidViewModel(application) {

    data class UiState(
        val code: String = "",
        val memberName: String = "",
        /** Optional — when present the family can list the neighbour in the care circle. */
        val email: String = "",
        val pairing: Boolean = false,
        val error: String? = null,
        val success: Boolean = false,
        /** True when the best-effort care-circle join landed. */
        val circleJoined: Boolean = false,
    )

    private val container = (application as NeighbourApp).container

    private val _ui = MutableStateFlow(UiState())
    val ui: StateFlow<UiState> = _ui.asStateFlow()

    val currentBaseUrl = container.store.baseUrlFlow

    fun onCodeChange(code: String) {
        _ui.update { it.copy(code = code, error = null) }
    }

    fun onNameChange(name: String) {
        _ui.update { it.copy(memberName = name, error = null) }
    }

    fun onEmailChange(email: String) {
        _ui.update { it.copy(email = email, error = null) }
    }

    fun pair() {
        val state = _ui.value
        if (state.pairing || state.success || state.code.length != 6) return
        _ui.update { it.copy(pairing = true, error = null) }

        viewModelScope.launch {
            container.repository
                .pairWithCode(state.code, state.memberName.trim(), state.email.trim().ifBlank { null })
                .onSuccess { outcome ->
                    // Start the background SOS heartbeat right away.
                    WorkScheduler.ensurePeriodicStatePoll(getApplication())
                    _ui.update { it.copy(pairing = false, success = true, circleJoined = outcome.circleJoined) }
                }
                .onFailure { failure ->
                    _ui.update { it.copy(pairing = false, error = friendlyError(failure)) }
                }
        }
    }

    fun saveBaseUrl(rawUrl: String) {
        viewModelScope.launch {
            runCatching { container.repository.setBaseUrl(rawUrl) }
                .onFailure { failure ->
                    _ui.update { it.copy(error = friendlyError(failure)) }
                }
        }
    }

    private fun friendlyError(failure: Throwable): String =
        when (failure) {
            is HttpException -> when (failure.code()) {
                404 -> getApplication<NeighbourApp>().getString(R.string.pairing_error_code)
                else -> getApplication<NeighbourApp>().getString(R.string.pairing_error_generic)
            }
            is IOException, is IllegalArgumentException ->
                getApplication<NeighbourApp>().getString(R.string.pairing_error_network)
            else -> getApplication<NeighbourApp>().getString(R.string.pairing_error_generic)
        }
}
