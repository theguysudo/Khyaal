package com.khayaal.app.ui.home

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.khayaal.app.KhayaalApp
import com.khayaal.app.data.api.CareCircleMemberDto
import com.khayaal.app.data.api.CallPlanDto
import com.khayaal.app.data.api.CommandDto
import com.khayaal.app.data.api.SosStateDto
import com.khayaal.app.data.api.SosTriggerRequest
import com.khayaal.app.data.api.StateDto
import com.khayaal.app.data.datastore.CallChainState
import com.khayaal.app.data.datastore.ChecklistItem
import com.khayaal.app.data.datastore.GpsState
import com.khayaal.app.data.datastore.SleepMilestone
import com.khayaal.app.sos.SosManager
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
        // The movement summary from the phone's own GPS — a zone word and a
        // few numbers, never a place.
        val gpsState: GpsState = GpsState(),
        // Her own to-do list, edited on this phone.
        val checklist: List<ChecklistItem> = emptyList(),
        // Who she can call, cached from the family's call order.
        val callOrder: List<CallChainState.Entry> = emptyList(),
        // Family→app commands (Reminders screen).
        val commands: List<CommandDto> = emptyList(),
        // The armed tier-3 call chain (cancellable from the alarm).
        val callChain: CallChainState? = null,
        // The household's SOS flag (null on backends that predate SOS).
        val sos: SosStateDto? = null,
        // Reassurance: the battery line, and the reminder waiting for its Done.
        val batteryLevelPct: Int? = null,
        val batteryCharging: Boolean = false,
        val dismissedReminderIds: Set<String> = emptySet(),
        val localReminders: List<com.khayaal.app.commands.LocalReminder> = emptyList(),
    ) {
        /** The due reminder that needs her big "Done" (null = quiet). */
        val dueReminder: ReminderDue.Due?
            get() = ReminderDue.next(
                commands = commands,
                localReminders = localReminders,
                nowMs = simNowTs ?: System.currentTimeMillis(),
                dismissedIds = dismissedReminderIds,
            )
    }

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
            container.pairingStore.dismissedReminderIdsFlow.collect { dismissed ->
                _ui.update { it.copy(dismissedReminderIds = dismissed) }
            }
        }
        viewModelScope.launch {
            container.pairingStore.localRemindersFlow.collect { reminders ->
                _ui.update { it.copy(localReminders = reminders) }
            }
        }
        // The battery line — read from the sticky system intent on every poll
        // tick; a number the home screen wears as reassurance, not an alarm.
        viewModelScope.launch {
            while (isActive) {
                val (level, charging) = readBattery()
                _ui.update { it.copy(batteryLevelPct = level, batteryCharging = charging) }
                delay(BATTERY_POLL_MS)
            }
        }
        viewModelScope.launch {
            container.pairingStore.callChainFlow.collect { chain ->
                _ui.update { it.copy(callChain = chain) }
            }
        }
        viewModelScope.launch {
            container.pairingStore.gpsStateFlow.collect { gps ->
                _ui.update { it.copy(gpsState = gps) }
            }
        }
        viewModelScope.launch {
            container.pairingStore.checklistFlow.collect { items ->
                _ui.update { it.copy(checklist = items) }
            }
        }
        viewModelScope.launch {
            container.pairingStore.callOrderCacheFlow.collect { order ->
                _ui.update { it.copy(callOrder = order) }
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
                    // PATH B (state poll → siren): the SOS flag rides every
                    // tick; SosManager latches the start/stop edges. This is
                    // the delivery path that works with no Firebase config.
                    SosManager.onSosObservation(appContext, bundle.sos, "foreground-poll")
                    _ui.update { it.copy(sos = bundle.sos) }
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

    // -- SOS -----------------------------------------------------------------------

    /**
     * She pressed the SOS button (long-press + confirm). The network POST and
     * the local siren start together on purpose: the family must hear about
     * it as fast as the network allows, but her own phone ringing is a
     * requirement and never waits on the network.
     */
    fun triggerSos() {
        viewModelScope.launch {
            SosManager.onLocalTrigger(appContext) // siren + full-screen alarm now
            container.repository.triggerSos(SosTriggerRequest.ORIGIN_BUTTON)
                .onFailure {
                    // The alarm still rings locally; the banner reflects the
                    // offline state and the next poll reconciles with the server.
                    _ui.update { it.copy(offline = true) }
                }
        }
    }

    /** Stands the SOS down from the banner: local stop first, resolve best-effort. */
    fun standDownSos() {
        viewModelScope.launch {
            SosManager.onUserStoodDown(appContext)
            container.repository.resolveSos(resolveBy())
                .onFailure { _ui.update { it.copy(offline = true) } }
        }
    }

    private suspend fun resolveBy(): String =
        container.pairingStore.current()?.parentName?.takeIf { it.isNotBlank() }
            ?: getApplication<Application>().getString(com.khayaal.app.R.string.sos_by_elder)

    // -- Reassurance: battery, due reminder, the day read aloud -----------------

    /** The battery level and charging state, from the sticky system intent. */
    private fun readBattery(): Pair<Int?, Boolean> {
        val intent = appContext.registerReceiver(null, android.content.IntentFilter(android.content.Intent.ACTION_BATTERY_CHANGED))
            ?: return null to false
        val level = intent.getIntExtra(android.os.BatteryManager.EXTRA_LEVEL, -1)
        val scale = intent.getIntExtra(android.os.BatteryManager.EXTRA_SCALE, -1)
        val status = intent.getIntExtra(android.os.BatteryManager.EXTRA_STATUS, -1)
        val pct = if (level >= 0 && scale > 0) (level * 100) / scale else null
        val charging = status == android.os.BatteryManager.BATTERY_STATUS_CHARGING ||
            status == android.os.BatteryManager.BATTERY_STATUS_FULL
        return pct to charging
    }

    /** The big "Done": the reminder never surfaces again; the ack is best-effort. */
    fun dismissReminder(due: ReminderDue.Due) {
        viewModelScope.launch {
            container.pairingStore.dismissReminder(due.id)
            if (due.fromFamily) {
                runCatching { container.repository.ackCommand(due.id) }
            }
        }
    }

    /** "Later" — the same reminder comes back in ten minutes, as a local alarm. */
    fun snoozeReminder(due: ReminderDue.Due) {
        viewModelScope.launch {
            val reminder = com.khayaal.app.commands.LocalReminder(
                id = "snooze_${due.id}",
                text = due.text,
                atMs = System.currentTimeMillis() + ReminderDue.SNOOZE_MS,
            )
            container.pairingStore.upsertLocalReminder(reminder)
            container.pairingStore.dismissReminder(due.id)
            com.khayaal.app.commands.LocalReminderScheduler.schedule(appContext, reminder)
        }
    }

    /** "Speak my day" — one tap, the whole day in one calm paragraph. */
    fun speakDay() {
        val uiState = _ui.value
        val nowMs = uiState.simNowTs ?: System.currentTimeMillis()
        val next = ReminderDue.next(
            commands = uiState.commands,
            localReminders = uiState.localReminders,
            nowMs = nowMs,
            dismissedIds = uiState.dismissedReminderIds,
        ) ?: nextFutureReminder(uiState)
        val summary = DaySummary.compose(
            herName = uiState.parentName,
            greeting = getApplication<Application>().getString(
                HomeTime.greetingResourceId(HomeTime.greetingHour(nowMs)),
            ),
            status = uiState.state?.status?.takeIf { it.isNotBlank() },
            nextReminderText = next?.text,
            nextReminderClock = next?.let { HomeTime.formatClock(it.dueTs) },
            stepsToday = uiState.stepsToday.takeIf { it > 0 }?.toInt(),
            charging = uiState.batteryLevelPct?.let { uiState.batteryCharging },
        )
        container.ttsSpeaker.speak(summary)
    }

    /** The next reminder still to come — the day preview, not the due one. */
    private fun nextFutureReminder(uiState: HomeUiState): ReminderDue.Due? =
        uiState.commands
            .asSequence()
            .filter { it.type == CommandDto.Types.REMINDER || it.type == CommandDto.Types.TTS }
            .filter { it.ts > (uiState.simNowTs ?: System.currentTimeMillis()) }
            .minByOrNull { it.ts }
            ?.let { ReminderDue.Due(it.id, it.text, it.ts, it.lang, fromFamily = true) }

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

    // -- Her to-do list ------------------------------------------------------------------

    /** Adds a line to her list. The list never leaves the phone. */
    fun addChecklistItem(text: String) {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return
        viewModelScope.launch {
            val current = container.pairingStore.currentChecklist()
            val item = ChecklistItem(
                id = "chk_${System.currentTimeMillis()}_${current.size}",
                text = trimmed,
                done = false,
                createdTs = System.currentTimeMillis(),
            )
            container.pairingStore.saveChecklist(current + item)
        }
    }

    /** Ticks a line off (or unticks it). */
    fun toggleChecklistItem(item: ChecklistItem) {
        viewModelScope.launch {
            val current = container.pairingStore.currentChecklist()
            container.pairingStore.saveChecklist(
                current.map { if (it.id == item.id) it.copy(done = !it.done) else it },
            )
        }
    }

    /** Throws a line away. */
    fun deleteChecklistItem(item: ChecklistItem) {
        viewModelScope.launch {
            val current = container.pairingStore.currentChecklist()
            container.pairingStore.saveChecklist(current.filterNot { it.id == item.id })
        }
    }

    // -- Location ------------------------------------------------------------------

    /**
     * The GPS listener only works once the location permission exists. This
     * is called when the permission is granted and whenever the daily view
     * opens, so the movement segment fills in without any other ceremony.
     */
    fun refreshLocation() {
        container.signalCollector.startGps()
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

        /** The battery line refreshes at the same gentle cadence as the day. */
        private const val BATTERY_POLL_MS = 60_000L
    }
}
