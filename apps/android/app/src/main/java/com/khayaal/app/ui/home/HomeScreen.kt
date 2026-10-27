package com.khayaal.app.ui.home

import android.Manifest
import android.os.Build
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.animateIntAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Emergency
import androidx.compose.material.icons.filled.PhoneInTalk
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.khayaal.app.R
import com.khayaal.app.care.FamilyCall
import com.khayaal.app.data.api.CommandDto
import com.khayaal.app.sleep.SleepWatchManager
import com.khayaal.app.ui.components.KhayaalButton
import com.khayaal.app.ui.theme.Clay
import com.khayaal.app.ui.theme.ClayDeep
import com.khayaal.app.ui.theme.Ink
import com.khayaal.app.ui.theme.Mist
import com.khayaal.app.ui.theme.Paper
import com.khayaal.app.ui.theme.Sage
import com.khayaal.app.ui.theme.Tier3

/**
 * Her daily view, in five plain sections: Today, Family, Health & Safety,
 * Movement and Night watch.
 *
 * The structure follows one rule — she should never have to hunt for
 * anything. The time is always at the top, the section bar is always at the
 * bottom, and the sections themselves are short. Nothing on this screen
 * watches her, and the app never shows raw signals.
 */
@Composable
fun HomeScreen(
    onAskKhayaal: () -> Unit,
    onReminders: () -> Unit,
    onTalkback: () -> Unit,
    viewModel: HomeViewModel = viewModel(),
) {
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    var showSettings by remember { mutableStateOf(false) }
    var segment by remember { mutableStateOf(HomeSegment.TODAY) }
    val context = LocalContext.current
    val okDescription = stringResource(R.string.a11y_im_ok_button)
    val voiceAvailable = remember { VoiceAvailability.check(context) }

    // RECORD_AUDIO results for the two opt-in listeners (night watch, voice).
    var micCallback by remember { mutableStateOf<((Boolean) -> Unit)?>(null) }
    val micLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted -> micCallback?.invoke(granted) }

    fun requestMicThen(callback: (Boolean) -> Unit) {
        micCallback = callback
        micLauncher.launch(Manifest.permission.RECORD_AUDIO)
    }

    RequestCarePermissions()

    // The location permission is asked for once, gently. The GPS listener is
    // a no-op until it is granted, so it is started again afterwards — and
    // every time this screen opens, in case the answer changed in Settings.
    val locationLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) viewModel.refreshLocation()
    }
    LaunchedEffect(Unit) {
        viewModel.refreshLocation()
        if (!hasLocationPermission(context)) {
            locationLauncher.launch(Manifest.permission.ACCESS_COARSE_LOCATION)
        }
    }
    // Movement without its grant is never a dead card: one tap re-asks, and
    // if the system refuses to ask again the settings page opens instead.
    val openAppSettings = {
        context.startActivity(
            android.content.Intent(
                android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                android.net.Uri.fromParts("package", context.packageName, null),
            ).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
    val requestLocation = {
        if (hasLocationPermission(context)) {
            viewModel.refreshLocation()
        } else {
            locationLauncher.launch(Manifest.permission.ACCESS_COARSE_LOCATION)
        }
    }

    // A user opt-in survives process death: if the toggle is on but the
    // service isn't running (fresh boot killed it), bring it back while the
    // app is in the foreground — mic FGS may not start from the background.
    LaunchedEffect(ui.nightWatchEnabled, ui.nightWatchActive) {
        if (ui.nightWatchEnabled && !ui.nightWatchActive && SleepWatchManager.hasRecordPermission(context)) {
            viewModel.setNightWatch(true)
        }
    }
    LaunchedEffect(ui.voiceEnabled, ui.voiceActive) {
        if (ui.voiceEnabled && !ui.voiceActive && SleepWatchManager.hasRecordPermission(context) && voiceAvailable) {
            viewModel.setVoiceCommands(true)
        }
    }

    Scaffold(
        containerColor = Paper,
        bottomBar = {
            SegmentBar(
                selected = segment,
                onSelect = { segment = it },
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(R.string.app_name).uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color = ClayDeep,
                )
                IconButton(
                    onClick = { showSettings = true },
                    modifier = Modifier
                        .size(48.dp)
                        .background(Mist, RoundedCornerShape(16.dp)),
                ) {
                    Icon(
                        imageVector = Icons.Filled.Settings,
                        contentDescription = stringResource(R.string.home_settings_description),
                        tint = Ink.copy(alpha = 0.55f),
                    )
                }
            }

            Spacer(Modifier.height(6.dp))

            // The clock is always there, whatever section she is in.
            TimeDateWidget(nowMs = ui.simNowTs ?: System.currentTimeMillis())

            Spacer(Modifier.height(14.dp))

            AnimatedContent(
                targetState = segment,
                transitionSpec = {
                    fadeIn(animationSpec = tween(220)) togetherWith fadeOut(animationSpec = tween(150))
                },
                label = "home-segment",
            ) { current ->
                Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    when (current) {
                        HomeSegment.TODAY -> TodaySection(
                            ui = ui,
                            onAskKhayaal = onAskKhayaal,
                            onReminders = onReminders,
                            onCheckIn = viewModel::checkIn,
                            onSnooze = viewModel::snoozeOneHour,
                            onAddChecklist = viewModel::addChecklistItem,
                            onToggleChecklist = viewModel::toggleChecklistItem,
                            onDeleteChecklist = viewModel::deleteChecklistItem,
                        )

                        HomeSegment.FAMILY -> FamilySection(
                            ui = ui,
                            onTalkback = onTalkback,
                            onCallFamily = { FamilyCall.openDialer(context, null) },
                            onCall = { phone -> FamilyCall.openDialer(context, phone) },
                        )

                        HomeSegment.HEALTH -> HealthSection(
                            ui = ui,
                            onCheckIn = viewModel::checkIn,
                            onEmergency = { FamilyCall.openDialer(context, EMERGENCY_NUMBER) },
                            onReminders = onReminders,
                        )

                        HomeSegment.MOVEMENT -> MovementSection(
                            ui = ui,
                            locationAllowed = hasLocationPermission(context),
                            onAllowLocation = requestLocation,
                            onOpenSettings = openAppSettings,
                        )

                        HomeSegment.NIGHT -> NightSection(
                            ui = ui,
                            voiceAvailable = voiceAvailable,
                            onToggleNightWatch = { enable ->
                                if (enable && !SleepWatchManager.hasRecordPermission(context)) {
                                    requestMicThen { granted ->
                                        viewModel.setNightWatch(granted)
                                        if (!granted) {
                                            Toast.makeText(
                                                context,
                                                context.getString(R.string.night_watch_permission_needed),
                                                Toast.LENGTH_SHORT,
                                            ).show()
                                        }
                                    }
                                } else {
                                    viewModel.setNightWatch(enable)
                                }
                            },
                            onToggleVoice = { enable ->
                                if (enable && !SleepWatchManager.hasRecordPermission(context)) {
                                    requestMicThen { granted -> viewModel.setVoiceCommands(granted) }
                                } else {
                                    viewModel.setVoiceCommands(enable)
                                }
                            },
                        )
                    }
                }
            }

            ui.ingestError?.let {
                Spacer(Modifier.height(12.dp))
                Text(
                    text = stringResource(R.string.home_ingest_error),
                    style = MaterialTheme.typography.bodySmall,
                    color = ClayDeep,
                )
            }
        }

        // Tier 3: the alarm owns the screen until she says otherwise.
        AlarmOverlay(
            tier = ui.state?.tier ?: 0,
            callPlan = ui.callPlan,
            careCircle = ui.careCircle,
            callChain = ui.callChain,
            justCheckedIn = ui.justCheckedIn,
            onCheckIn = viewModel::checkIn,
            onCallFamily = { FamilyCall.openDialer(context, null) },
            onCancelCallChain = viewModel::cancelCallChain,
            modifier = Modifier.padding(padding),
        )
    }

    if (showSettings) {
        SettingsDialog(
            baseUrl = ui.baseUrl,
            homeSsid = ui.homeSsid,
            onDismiss = { showSettings = false },
            onSave = { url, ssid ->
                viewModel.saveBaseUrl(url)
                viewModel.saveHomeSsid(ssid)
                showSettings = false
            },
            onUnpair = {
                showSettings = false
                viewModel.unpair()
            },
        )
    }
}

// -- The five sections ---------------------------------------------------------

/** Today: the date, the next reminder, how the day is going, and her list. */
@Composable
private fun TodaySection(
    ui: HomeViewModel.HomeUiState,
    onAskKhayaal: () -> Unit,
    onReminders: () -> Unit,
    onCheckIn: () -> Unit,
    onSnooze: () -> Unit,
    onAddChecklist: (String) -> Unit,
    onToggleChecklist: (com.khayaal.app.data.datastore.ChecklistItem) -> Unit,
    onDeleteChecklist: (com.khayaal.app.data.datastore.ChecklistItem) -> Unit,
) {
    val nowMs = ui.simNowTs ?: System.currentTimeMillis()

    StaggeredIn(index = 0) {
        Column {
            Text(
                text = stringResource(HomeTime.greetingResourceId(HomeTime.greetingHour(nowMs))),
                style = MaterialTheme.typography.bodyLarge,
                color = Ink.copy(alpha = 0.6f),
            )
            Text(
                text = ui.parentName.ifBlank { stringResource(R.string.app_name) },
                style = MaterialTheme.typography.displaySmall,
                color = Ink,
            )
        }
    }

    StaggeredIn(index = 1) {
        StatusCard(state = ui.state, offline = ui.offline && !ui.loading)
    }

    StaggeredIn(index = 2) {
        SegmentCard {
            SegmentHeading(stringResource(R.string.today_next_reminder))
            val next = ui.nextReminder()
            if (next == null) {
                SegmentHint(stringResource(R.string.today_no_reminder))
            } else {
                SegmentValue(next.text)
                SegmentHint(HomeTime.formatClock(next.ts))
            }
            TextButton(
                onClick = onReminders,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp),
            ) {
                Text(
                    text = stringResource(R.string.qa_reminders),
                    style = MaterialTheme.typography.bodyMedium,
                    color = ClayDeep,
                )
            }
        }
    }

    StaggeredIn(index = 3) {
        val okDescription = stringResource(R.string.a11y_im_ok_button)
        KhayaalButton(
            onClick = onCheckIn,
            modifier = Modifier
                .fillMaxWidth()
                .semantics { contentDescription = okDescription },
            minHeight = 84.dp,
            shape = RoundedCornerShape(28.dp),
        ) {
            Text(
                text = stringResource(R.string.home_im_ok),
                fontSize = 26.sp,
                lineHeight = 32.sp,
                style = MaterialTheme.typography.titleLarge,
            )
        }
    }

    if (ui.justCheckedIn) {
        StaggeredIn(index = 4) {
            Text(
                text = stringResource(R.string.home_im_ok_done),
                style = MaterialTheme.typography.bodyLarge,
                color = Sage,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }

    StaggeredIn(index = 4) {
        ChecklistWidget(
            items = ui.checklist,
            onAdd = onAddChecklist,
            onToggle = onToggleChecklist,
            onDelete = onDeleteChecklist,
        )
    }

    StaggeredIn(index = 5) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            TextButton(
                onClick = onAskKhayaal,
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 56.dp),
            ) {
                Text(
                    text = stringResource(R.string.qa_ask_khayaal),
                    style = MaterialTheme.typography.titleMedium,
                    color = ClayDeep,
                )
            }
            TextButton(
                onClick = onSnooze,
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 56.dp),
            ) {
                Text(
                    text = stringResource(R.string.home_snooze),
                    style = MaterialTheme.typography.titleMedium,
                    color = ClayDeep,
                )
            }
        }
    }
}

/** Family: one big button per person, plus the walkie-talkie. */
@Composable
private fun FamilySection(
    ui: HomeViewModel.HomeUiState,
    onTalkback: () -> Unit,
    onCallFamily: () -> Unit,
    onCall: (String) -> Unit,
) {
    StaggeredIn(index = 0) {
        SegmentCard {
            SegmentHeading(stringResource(R.string.family_title))
            if (ui.callOrder.isEmpty()) {
                SegmentHint(stringResource(R.string.family_no_contacts))
            } else {
                ui.callOrder.forEach { contact ->
                    CallButton(
                        name = contact.name.ifBlank { stringResource(R.string.app_name) },
                        onClick = { onCall(contact.phone) },
                    )
                    Spacer(Modifier.height(10.dp))
                }
            }
            Spacer(Modifier.height(4.dp))
            Button(
                onClick = onCallFamily,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 64.dp),
                shape = RoundedCornerShape(22.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Sage,
                    contentColor = Color(0xFF062512),
                ),
            ) {
                Icon(
                    imageVector = Icons.Filled.Call,
                    contentDescription = null,
                    modifier = Modifier.size(28.dp),
                )
                Spacer(Modifier.width(10.dp))
                Text(
                    text = stringResource(R.string.family_open_dialer),
                    fontSize = 20.sp,
                    style = MaterialTheme.typography.titleMedium,
                )
            }
        }
    }

    StaggeredIn(index = 1) {
        SegmentCard {
            SegmentHeading(stringResource(R.string.talkback_title))
            SegmentHint(stringResource(R.string.talkback_privacy_note))
            Spacer(Modifier.height(8.dp))
            Button(
                onClick = onTalkback,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 72.dp),
                shape = RoundedCornerShape(22.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Clay,
                    contentColor = MaterialTheme.colorScheme.onPrimary,
                ),
            ) {
                Icon(
                    imageVector = Icons.Filled.PhoneInTalk,
                    contentDescription = null,
                    modifier = Modifier.size(30.dp),
                )
                Spacer(Modifier.width(10.dp))
                Text(
                    text = stringResource(R.string.talkback_call_family),
                    fontSize = 20.sp,
                    style = MaterialTheme.typography.titleMedium,
                )
            }
        }
    }
}

/** Health and safety: the three things that matter when something is wrong. */
@Composable
private fun HealthSection(
    ui: HomeViewModel.HomeUiState,
    onCheckIn: () -> Unit,
    onEmergency: () -> Unit,
    onReminders: () -> Unit,
) {
    StaggeredIn(index = 0) {
        SegmentCard {
            SegmentHeading(stringResource(R.string.health_title))

            Button(
                onClick = onEmergency,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 80.dp),
                shape = RoundedCornerShape(24.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Tier3,
                    contentColor = Color.White,
                ),
            ) {
                Icon(
                    imageVector = Icons.Filled.Emergency,
                    contentDescription = null,
                    modifier = Modifier.size(32.dp),
                )
                Spacer(Modifier.width(10.dp))
                Text(
                    text = stringResource(R.string.health_emergency),
                    fontSize = 22.sp,
                    style = MaterialTheme.typography.titleLarge,
                )
            }

            Spacer(Modifier.height(10.dp))

            Button(
                onClick = onCheckIn,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 80.dp),
                shape = RoundedCornerShape(24.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Sage,
                    contentColor = Color(0xFF062512),
                ),
            ) {
                Text(
                    text = stringResource(R.string.health_checkin),
                    fontSize = 24.sp,
                    style = MaterialTheme.typography.titleLarge,
                )
            }

            if (ui.justCheckedIn) {
                Spacer(Modifier.height(6.dp))
                Text(
                    text = stringResource(R.string.health_checkin_done),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Sage,
                )
            }
        }
    }

    StaggeredIn(index = 1) {
        SegmentCard {
            SegmentHeading(stringResource(R.string.health_medicine_title))
            val reminders = ui.commands.filter {
                it.type == CommandDto.Types.REMINDER || it.type == CommandDto.Types.TTS
            }
            if (reminders.isEmpty()) {
                SegmentHint(stringResource(R.string.health_medicine_empty))
            } else {
                reminders.take(3).forEach { reminder ->
                    SegmentValue(reminder.text)
                    SegmentHint(HomeTime.formatClock(reminder.ts))
                    Spacer(Modifier.height(6.dp))
                }
            }
            TextButton(
                onClick = onReminders,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp),
            ) {
                Text(
                    text = stringResource(R.string.qa_reminders),
                    style = MaterialTheme.typography.bodyMedium,
                    color = ClayDeep,
                )
            }
        }
    }
}

/** Movement: steps, moving or still, at home or out — the web wording, in plain words. */
@Composable
private fun MovementSection(
    ui: HomeViewModel.HomeUiState,
    locationAllowed: Boolean,
    onAllowLocation: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    val animatedSteps by animateIntAsState(
        targetValue = ui.stepsToday.toInt(),
        animationSpec = tween(durationMillis = 900),
        label = "steps-today",
    )

    StaggeredIn(index = 0) {
        SegmentCard {
            SegmentHeading(stringResource(R.string.movement_title))

            val zone = ui.gpsState.zone
            val zoneText = when {
                !locationAllowed -> stringResource(R.string.movement_not_reporting)
                zone == "home" -> stringResource(R.string.movement_at_home)
                zone == "away" -> stringResource(R.string.movement_away)
                else -> stringResource(R.string.movement_unknown)
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                SegmentValue(text = zoneText)
                if (locationAllowed) {
                    Spacer(Modifier.width(12.dp))
                    MovingDot(moving = ui.gpsState.moving)
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = if (ui.gpsState.moving) {
                            stringResource(R.string.movement_moving)
                        } else {
                            stringResource(R.string.movement_still)
                        },
                        style = MaterialTheme.typography.titleMedium,
                        color = Ink.copy(alpha = 0.7f),
                    )
                }
            }

            Spacer(Modifier.height(10.dp))

            SegmentValue(
                text = if (ui.stepsToday > 0) {
                    stringResource(R.string.movement_steps, animatedSteps.toString())
                } else {
                    stringResource(R.string.movement_steps_unknown)
                },
            )

            Spacer(Modifier.height(8.dp))

            if (locationAllowed) {
                SegmentHint(stringResource(R.string.movement_privacy))
            } else {
                SegmentHint(stringResource(R.string.movement_needs_permission))
                Spacer(Modifier.height(4.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    TextButton(onClick = onAllowLocation) {
                        Text(
                            text = stringResource(R.string.movement_allow_location),
                            style = MaterialTheme.typography.bodyMedium,
                            color = ClayDeep,
                        )
                    }
                    TextButton(onClick = onOpenSettings) {
                        Text(
                            text = stringResource(R.string.movement_open_settings),
                            style = MaterialTheme.typography.bodyMedium,
                            color = Ink.copy(alpha = 0.6f),
                        )
                    }
                }
            }
        }
    }
}

/** Night watch: the sleep events and the two switches that belong to the night. */
@Composable
private fun NightSection(
    ui: HomeViewModel.HomeUiState,
    voiceAvailable: Boolean,
    onToggleNightWatch: (Boolean) -> Unit,
    onToggleVoice: (Boolean) -> Unit,
) {
    StaggeredIn(index = 0) {
        SegmentCard {
            SegmentHeading(stringResource(R.string.night_title))
            val sleep = ui.lastSleep
            if (sleep == null) {
                SegmentHint(stringResource(R.string.night_sleep_none))
            } else {
                val label = when (sleep.value) {
                    com.khayaal.app.signals.SignalEvent.SleepValues.ASLEEP ->
                        stringResource(R.string.night_sleep_asleep)
                    com.khayaal.app.signals.SignalEvent.SleepValues.AWAKE ->
                        stringResource(R.string.night_sleep_awake)
                    com.khayaal.app.signals.SignalEvent.SleepValues.RESTLESS ->
                        stringResource(R.string.night_sleep_restless)
                    else -> stringResource(R.string.night_sleep_woke)
                }
                SegmentValue(label)
                SegmentHint(stringResource(R.string.night_last_event, HomeTime.formatClock(sleep.ts)))
            }
        }
    }

    StaggeredIn(index = 1) {
        SleepCard(
            nightWatchOn = ui.nightWatchEnabled,
            voiceOn = ui.voiceEnabled,
            voiceAvailable = voiceAvailable,
            lastSleep = ui.lastSleep,
            onToggleNightWatch = onToggleNightWatch,
            onToggleVoice = onToggleVoice,
        )
    }
}

/** The next family reminder, if there is one. */
private fun HomeViewModel.HomeUiState.nextReminder(): CommandDto? =
    commands
        .filter { it.type == CommandDto.Types.REMINDER || it.type == CommandDto.Types.TTS }
        .minByOrNull { it.ts }

/** One family member's call button — big, plain, one tap. */
@Composable
private fun CallButton(
    name: String,
    onClick: () -> Unit,
) {
    val description = stringResource(R.string.family_call, name)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 72.dp)
            .background(Mist, RoundedCornerShape(22.dp))
            .clickable(onClick = onClick)
            .semantics { contentDescription = description }
            .padding(horizontal = 20.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.Call,
            contentDescription = null,
            tint = Clay,
            modifier = Modifier.size(32.dp),
        )
        Text(
            text = name,
            fontSize = 20.sp,
            style = MaterialTheme.typography.titleMedium,
            color = Ink,
        )
    }
}

// -- Permissions ----------------------------------------------------------------

/** Asks once, gently, for the permissions the passive signals need. */
@Composable
private fun RequestCarePermissions() {
    val notificationLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { }
    val activityLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { }

    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            notificationLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            activityLauncher.launch(Manifest.permission.ACTIVITY_RECOGNITION)
        }
    }
}

/**
 * CALL_PHONE is asked in the one-time permissions step after pairing; the
 * call chain works without it by opening the dialer, so nothing is re-prompted here.
 */

/** Whether "Hey Khayaal" on-device recognition exists on this phone. */
private object VoiceAvailability {
    fun check(context: android.content.Context): Boolean =
        runCatching { com.khayaal.app.voice.VoiceCommandManager.isAvailable(context) }
            .getOrDefault(false)
}

/** The single emergency number the app knows. */
private const val EMERGENCY_NUMBER = "112"

/** Whether the phone is allowed to sense movement at all. */
private fun hasLocationPermission(context: android.content.Context): Boolean =
    androidx.core.content.ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.ACCESS_COARSE_LOCATION,
    ) == android.content.pm.PackageManager.PERMISSION_GRANTED ||
        androidx.core.content.ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION,
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
