package com.khayaal.app.ui.pairing

import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import android.app.Application
import com.khayaal.app.KhayaalApp
import com.khayaal.app.signals.WorkScheduler
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import retrofit2.HttpException
import java.io.IOException

/**
 * Drives the 6-digit pairing flow: join the household, register this phone
 * as a source, store the key, schedule the periodic jobs, done.
 */
class PairingViewModel(application: Application) : AndroidViewModel(application) {

    data class UiState(
        val code: String = "",
        val pairing: Boolean = false,
        val error: String? = null,
        val success: Boolean = false,
    )

    private val container = (application as KhayaalApp).container

    private val _ui = MutableStateFlow(UiState())
    val ui: StateFlow<UiState> = _ui.asStateFlow()

    val currentBaseUrl = container.pairingStore.baseUrlFlow

    fun onCodeChange(code: String) {
        _ui.update { it.copy(code = code, error = null) }
    }

    fun pair() {
        val state = _ui.value
        if (state.pairing || state.success || state.code.length != 6) return
        _ui.update { it.copy(pairing = true, error = null) }

        viewModelScope.launch {
            container.repository.pairWithCode(state.code)
                .onSuccess {
                    // Start the 15-minute heartbeat + 10-minute poll right away.
                    WorkScheduler.ensurePeriodicWork(getApplication())
                    _ui.update { it.copy(pairing = false, success = true) }
                }
                .onFailure { failure ->
                    _ui.update {
                        it.copy(pairing = false, error = friendlyError(failure))
                    }
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
                404 -> getApplication<KhayaalApp>().getString(com.khayaal.app.R.string.pairing_error_code)
                else -> getApplication<KhayaalApp>().getString(com.khayaal.app.R.string.pairing_error_generic)
            }
            is IOException, is IllegalArgumentException ->
                getApplication<KhayaalApp>().getString(com.khayaal.app.R.string.pairing_error_network)
            else -> getApplication<KhayaalApp>().getString(com.khayaal.app.R.string.pairing_error_generic)
        }
}
