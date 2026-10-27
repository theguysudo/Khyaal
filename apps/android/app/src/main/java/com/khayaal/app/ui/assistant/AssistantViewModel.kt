package com.khayaal.app.ui.assistant

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.khayaal.app.KhayaalApp
import com.khayaal.app.R
import com.khayaal.app.care.FamilyCall
import com.khayaal.app.commands.LocalReminder
import com.khayaal.app.commands.LocalReminderScheduler
import com.khayaal.app.data.api.AssistantMessageDto
import com.khayaal.app.data.api.CommandDto
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * "Ask Khayaal" — the warm helper chat, and the thing that actually *does*
 * things.
 *
 * Two kinds of sentence arrive here:
 *
 *  - **Tasks** the phone can do by itself — check in, call someone, read the
 *    status, read the step count, name the next medicine, set a reminder.
 *    These are decided on the phone by [AssistantTasks], so they work even
 *    when the network is down, and they actually happen.
 *  - **Everything else** goes to POST /household/{id}/assistant, where the
 *    backend proxies to the LLM and returns `{reply, provider, model}`.
 *
 * Whatever the server sends is shown as a normal answer, including its own
 * friendly fallback sentence. A failed request never turns into an error
 * box: Khayaal answers with what this phone knows and stays warm.
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

    private val container = (application as KhayaalApp).container
    private val appContext = application

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

        // A task she can do right now, on this phone.
        val task = AssistantTasks.parse(trimmed)
        if (task !is AssistantTasks.Task.None) {
            viewModelScope.launch {
                val reply = runTask(task)
                _ui.update {
                    it.copy(
                        messages = it.messages + ChatMessage(ROLE_ASSISTANT, reply),
                        sending = false,
                    )
                }
            }
            return
        }

        viewModelScope.launch {
            // Keep the payload to the last few turns; enough context, small body.
            val wire = (history.takeLast(MAX_HISTORY - 1) + ChatMessage(ROLE_USER, trimmed))
                .map { AssistantMessageDto(role = it.role, content = it.content) }

            repository().askAssistant(wire)
                .onSuccess { reply ->
                    _ui.update {
                        it.copy(
                            messages = it.messages + ChatMessage(ROLE_ASSISTANT, reply.text),
                            sending = false,
                        )
                    }
                }
                .onFailure {
                    // No error box: Khayaal answers from what this phone knows.
                    val reply = offlineAnswer()
                    _ui.update {
                        it.copy(
                            messages = it.messages + ChatMessage(ROLE_ASSISTANT, reply),
                            sending = false,
                        )
                    }
                }
        }
    }

    // -- The tasks ------------------------------------------------------------------

    /**
     * Carries out one task and answers in two or three warm sentences. Every
     * branch returns plain language — no medical advice, no jargon.
     */
    private suspend fun runTask(task: AssistantTasks.Task): String {
        val context = appContext
        return when (task) {
            is AssistantTasks.Task.CheckIn -> {
                val done = repository().checkIn().isSuccess
                if (done) {
                    getApplication<Application>().getString(R.string.assistant_reply_checkin)
                } else {
                    getApplication<Application>().getString(R.string.assistant_reply_checkin_offline)
                }
            }

            is AssistantTasks.Task.Call -> {
                // A named contact comes from the family's call order; an empty
                // name opens the plain dialer.
                val contacts = container.pairingStore.currentCallOrder()
                val number = if (task.name.isBlank()) {
                    ""
                } else {
                    contacts.firstOrNull { contact ->
                        contact.name.split(Regex("\\s+"))
                            .any { word -> word.length >= 2 && task.name.contains(word, ignoreCase = true) }
                    }?.phone.orEmpty()
                }
                FamilyCall.openDialer(context, number.ifBlank { null })
                getApplication<Application>().getString(R.string.assistant_reply_call)
            }

            is AssistantTasks.Task.ReadStatus -> {
                val status = container.pairingStore.lastStatusFlow.first()
                if (status.isBlank()) {
                    getApplication<Application>().getString(R.string.assistant_reply_status_unknown)
                } else {
                    getApplication<Application>().getString(R.string.assistant_reply_status, status)
                }
            }

            is AssistantTasks.Task.ReadSteps -> {
                val steps = container.pairingStore.stepsTodayFlow.first()
                if (steps <= 0L) {
                    getApplication<Application>().getString(R.string.assistant_reply_steps_none)
                } else {
                    getApplication<Application>().getString(R.string.assistant_reply_steps, steps.toString())
                }
            }

            is AssistantTasks.Task.NextMedicine -> {
                val commands = container.pairingStore.commandHistoryFlow.first()
                val next = commands
                    .filter { it.type == CommandDto.Types.REMINDER || it.type == CommandDto.Types.TTS }
                    .minByOrNull { it.ts }
                if (next == null) {
                    getApplication<Application>().getString(R.string.assistant_reply_medicine_none)
                } else {
                    getApplication<Application>()
                        .getString(R.string.assistant_reply_medicine_next, next.text)
                }
            }

            // The server handles everything else; the caller never sends None.
            is AssistantTasks.Task.None -> ""

            is AssistantTasks.Task.ReminderWithoutTime -> {
                // She asked for a reminder but not a time — ask her for one.
                getApplication<Application>()
                    .getString(R.string.assistant_reply_reminder_no_time, task.text)
            }

            is AssistantTasks.Task.SetReminder -> {
                val atMs = task.at.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
                val reminder = LocalReminder(
                    id = "rem_${System.currentTimeMillis()}",
                    text = task.text,
                    atMs = atMs,
                )
                container.pairingStore.upsertLocalReminder(reminder)
                LocalReminderScheduler.schedule(context, reminder)
                getApplication<Application>().getString(
                    R.string.assistant_reply_reminder_set,
                    task.text,
                    formatTime(atMs),
                )
            }
        }
    }

    /**
     * The answer when the server cannot be reached: something useful from
     * this phone, said warmly. Never an error box.
     */
    private suspend fun offlineAnswer(): String {
        val context = getApplication<Application>()
        val steps = container.pairingStore.stepsTodayFlow.first()
        val status = container.pairingStore.lastStatusFlow.first()
        val detail = when {
            status.isNotBlank() -> status
            steps > 0L -> context.getString(R.string.assistant_reply_steps, steps.toString())
            else -> ""
        }
        val fallback = context.getString(R.string.assistant_reply_offline)
        return if (detail.isBlank()) fallback else "$detail $fallback"
    }

    private fun formatTime(epochMs: Long): String {
        val time = Instant.ofEpochMilli(epochMs).atZone(ZoneId.systemDefault()).toLocalTime()
        return time.format(DateTimeFormatter.ofPattern("h:mm a", Locale.getDefault()))
    }

    private fun repository() = container.repository

    companion object {
        const val ROLE_USER = "user"
        const val ROLE_ASSISTANT = "assistant"
        const val MAX_HISTORY = 10
        const val WELCOME = "Hello! I'm Khayaal. Ask me anything — I can also check in, call your family, read your status, or set a reminder for you."
    }
}
