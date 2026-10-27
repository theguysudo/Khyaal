package com.khayaal.app.ui.assistant

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.khayaal.app.KhayaalApp
import com.khayaal.app.data.api.AssistantMessageDto
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * "Ask Khayaal" — the warm helper chat. The app never holds an API key: the
 * conversation (last few turns) goes to POST /household/{id}/assistant, the
 * backend proxies to its LLM and returns {reply}. A failed turn leaves the
 * chat intact with a gentle note.
 */
class AssistantViewModel(application: Application) : AndroidViewModel(application) {

    data class ChatMessage(
        val role: String,
        val content: String,
        val ts: Long = System.currentTimeMillis(),
    ) {
        val isFromUser: Boolean get() = role == ROLE_USER
    }

    data class UiState(
        val messages: List<ChatMessage> = listOf(ChatMessage(ROLE_ASSISTANT, WELCOME)),
        val sending: Boolean = false,
    )

    private val repository = (application as KhayaalApp).container.repository

    private val _ui = MutableStateFlow(UiState())
    val ui: StateFlow<UiState> = _ui.asStateFlow()

    /** One quick-action chip: sends the phrase as if she had typed it. */
    fun quickAction(phrase: String) {
        if (!phrase.isBlank()) send(phrase)
    }

    fun send(text: String) {
        val trimmed = text.trim()
        if (trimmed.isEmpty() || _ui.value.sending) return

        val history = _ui.value.messages
        _ui.update {
            it.copy(
                messages = it.messages + ChatMessage(ROLE_USER, trimmed),
                sending = true,
            )
        }

        viewModelScope.launch {
            // Keep the payload to the last few turns; enough context, small body.
            val wire = (history.takeLast(MAX_HISTORY - 1) + ChatMessage(ROLE_USER, trimmed))
                .map { AssistantMessageDto(role = it.role, content = it.content) }

            repository.askAssistant(wire)
                .onSuccess { reply ->
                    _ui.update {
                        it.copy(
                            messages = it.messages + ChatMessage(ROLE_ASSISTANT, reply),
                            sending = false,
                        )
                    }
                }
                .onFailure {
                    _ui.update { state ->
                        state.copy(
                            messages = state.messages +
                                ChatMessage(ROLE_ASSISTANT, getApplication<Application>().getString(com.khayaal.app.R.string.assistant_error)),
                            sending = false,
                        )
                    }
                }
        }
    }

    companion object {
        const val ROLE_USER = "user"
        const val ROLE_ASSISTANT = "assistant"
        const val MAX_HISTORY = 10
        const val WELCOME = "Hello! I'm Khayaal. Ask me anything — or tap a suggestion below."
    }
}
