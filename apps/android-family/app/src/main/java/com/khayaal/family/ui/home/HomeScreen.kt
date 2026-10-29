package com.khayaal.family.ui.home

import android.content.Intent
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Button
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.khayaal.family.R
import com.khayaal.family.data.api.CommandCreateRequest
import com.khayaal.family.data.api.EventDto
import com.khayaal.family.data.api.SourceDto
import com.khayaal.family.ui.components.DarkGlassCardWide
import com.khayaal.family.ui.components.KhayaalButton
import com.khayaal.family.ui.components.OdometerNumber
import com.khayaal.family.ui.theme.Brand50
import com.khayaal.family.ui.theme.Brand600
import com.khayaal.family.ui.theme.Brand700
import com.khayaal.family.ui.theme.Error100
import com.khayaal.family.ui.theme.Error600
import com.khayaal.family.ui.theme.Error700
import com.khayaal.family.ui.theme.GlowMid
import com.khayaal.family.ui.theme.Hairline
import com.khayaal.family.ui.theme.Ink
import com.khayaal.family.ui.theme.InkSoft
import com.khayaal.family.ui.theme.Neutral300
import com.khayaal.family.ui.theme.Success100
import com.khayaal.family.ui.theme.Success600
import com.khayaal.family.ui.theme.Success700
import com.khayaal.family.ui.theme.TierMeta

/**
 * The family's one screen — the v2 dashboard (docs/DESIGN_SYSTEM.md, spec 2):
 *
 *   top bar: logomark chip · breadcrumb · status badge
 *   the wellbeing COUNTER — the dark-glass hero with the rolling score
 *   mini metrics: steps + zone, sleep (the band)
 *   the watchers: who else is looking out for her, live
 *   the alert ladder: how far up it she is
 *   her day: the timeline of today's events
 *   …and the SOS takeover when the alarm is live.
 *
 * A status, not a feed — no map, no trail, nothing she didn't consent to share.
 */
@Composable
fun HomeScreen(
    viewModel: HomeViewModel = viewModel(),
) {
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var showSettings by remember { mutableStateOf(false) }

    Scaffold(containerColor = MaterialTheme.colorScheme.background) { padding ->
        if (ui.sosActive) {
            // THE TAKEOVER — the alarm outranks the dashboard. Full-bleed
            // error surface, breathing SOS, the responder chip, stand-down.
            SosTakeover(
                ui = ui,
                onStandDown = viewModel::standDownSos,
                modifier = Modifier.padding(padding),
            )
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp, vertical = 14.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                TopBar(ui = ui, onSettings = { showSettings = true })

                WellbeingRow(ui = ui)

                WatchersPanel(ui = ui)

                AlertLadder(ui = ui)

                HerDay(ui = ui)

                ReachCard(
                    ui = ui,
                    onText = viewModel::onComposerText,
                    onLang = viewModel::onComposerLang,
                    onSend = viewModel::sendCommand,
                )

                Text(
                    text = stringResource(R.string.home_status_note),
                    style = MaterialTheme.typography.bodySmall,
                    color = InkSoft,
                )
            }
        }
    }

    if (showSettings) {
        SettingsDialog(
            baseUrl = ui.pairing?.baseUrl.orEmpty(),
            onDismiss = { showSettings = false },
            onSave = {
                viewModel.saveBaseUrl(it)
                showSettings = false
            },
            onUnpair = {
                showSettings = false
                viewModel.unpair()
            },
        )
    }
}

// -- Top bar ---------------------------------------------------------------------

/** 30dp terracotta logomark chip · breadcrumb · the status badge pill. */
@Composable
private fun TopBar(ui: HomeViewModel.HomeUiState, onSettings: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(30.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Brand600),
                contentAlignment = Alignment.Center,
            ) {
                Text("✳", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            }
            Spacer(Modifier.width(10.dp))
            Text(
                text = "Khayaal / ",
                style = MaterialTheme.typography.labelMedium,
                color = InkSoft,
            )
            Text(
                text = "Overview",
                style = MaterialTheme.typography.labelMedium,
                color = Ink,
                fontWeight = FontWeight.Black,
            )
        }
        Spacer(Modifier.width(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            StatusBadge(ui = ui)
            IconButton(onClick = onSettings, modifier = Modifier.size(40.dp)) {
                Icon(
                    imageVector = Icons.Filled.Settings,
                    contentDescription = stringResource(R.string.home_settings_description),
                    tint = InkSoft,
                )
            }
        }
    }
}

/** The pill: green-100/green-700 "All well" — red the moment SOS is live. */
@Composable
private fun StatusBadge(ui: HomeViewModel.HomeUiState) {
    val sos = ui.sosActive
    val meta = TierMeta.forTier(ui.tierVirtual())
    val (bg, fg, label) = when {
        sos -> Triple(Error100, Error700, "SOS")
        ui.offline -> Triple(Hairline, InkSoft, "offline")
        else -> Triple(Success100, Success700, meta.label)
    }
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(bg)
            .padding(horizontal = 10.dp, vertical = 5.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(6.dp)
                    .background(if (sos) Error600 else Success600, CircleShape),
            )
            Spacer(Modifier.width(6.dp))
            Text(text = label, style = MaterialTheme.typography.labelSmall, color = fg)
        }
    }
}

// -- The wellbeing counter -------------------------------------------------------

/** The hero counter card beside the stacked mini metrics. */
@Composable
private fun WellbeingRow(ui: HomeViewModel.HomeUiState) {
    Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        // THE hero — the dark-glass counter with the rolling score.
        DarkGlassCardWide(
            modifier = Modifier.weight(1.25f),
            cornerRadius = 28,
            glowStrength = 1f,
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                Text(
                    text = stringResource(R.string.dash_counter_label),
                    style = MaterialTheme.typography.labelSmall,
                    color = Color.White.copy(alpha = 0.6f),
                )
                Spacer(Modifier.height(10.dp))
                // The signature: giant digits that ROLL odometer-style.
                OdometerNumber(
                    value = ui.score,
                    fontSize = 88.dp,
                    color = Color.White,
                )
                Spacer(Modifier.height(10.dp))
                val statusLabel = when {
                    ui.offline -> stringResource(R.string.home_offline)
                    ui.state?.learning == true -> stringResource(R.string.home_learning)
                    else -> TierMeta.forTier(ui.tierVirtual()).label
                }
                Text(
                    text = stringResource(R.string.dash_counter_caption, statusLabel),
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.66f),
                )
            }
        }

        // The stacked minis: steps + delta(zone), sleep.
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            MiniMetricCard(
                label = stringResource(R.string.dash_steps_label),
                value = ui.stepsToday?.toString() ?: "—",
                meta = when (ui.zone) {
                    "home" -> stringResource(R.string.dash_zone_home)
                    "away" -> stringResource(R.string.dash_zone_away)
                    else -> stringResource(R.string.dash_zone_unknown)
                },
                metaColor = if (ui.zone == "home") Success700 else Brand700,
            )
            MiniMetricCard(
                label = stringResource(R.string.dash_sleep_label),
                value = ui.sleepMinutes?.let { m ->
                    stringResource(R.string.dash_sleep_value, m / 60, m % 60)
                } ?: "—",
                meta = ui.heartRateBpm?.let { stringResource(R.string.dash_pulse_value, it) }
                    ?: stringResource(R.string.dash_no_band),
                metaColor = InkSoft,
            )
        }
    }
}

/** A white dense card, 12dp radius, 1px border — the Untitled UI mini metric. */
@Composable
private fun MiniMetricCard(label: String, value: String, meta: String, metaColor: Color) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, Hairline, RoundedCornerShape(12.dp))
            .padding(14.dp),
    ) {
        Text(text = label, style = MaterialTheme.typography.labelSmall, color = InkSoft)
        Spacer(Modifier.height(4.dp))
        Text(
            text = value,
            fontSize = 26.sp,
            lineHeight = 30.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = (-0.52).sp,
            color = Ink,
        )
        Spacer(Modifier.height(2.dp))
        Text(text = meta, style = MaterialTheme.typography.bodySmall, color = metaColor)
    }
}

// -- The watchers ------------------------------------------------------------------

/** "The watchers" — every paired device, with a live pulse on the fresh ones. */
@Composable
private fun WatchersPanel(ui: HomeViewModel.HomeUiState) {
    val sources = ui.sources
    PanelCard(title = stringResource(R.string.dash_watchers_title)) {
        if (sources.isEmpty()) {
            Text(
                text = stringResource(R.string.dash_watchers_empty),
                style = MaterialTheme.typography.bodyMedium,
                color = InkSoft,
            )
        } else {
            sources.forEachIndexed { index, source ->
                WatcherRow(source = source, nowTs = ui.nowTs)
                if (index != sources.lastIndex) Spacer(Modifier.height(10.dp))
            }
        }
    }
}

@Composable
private fun WatcherRow(source: SourceDto, nowTs: Long) {
    val live = source.isLive(nowTs)
    // The live pulse: a green dot whose halo breathes on a 2 s loop.
    val pulse = rememberInfiniteTransition(label = "watcher-pulse")
    val halo by pulse.animateFloat(
        initialValue = 0.25f,
        targetValue = 0.7f,
        animationSpec = infiniteRepeatable(tween(2_000), RepeatMode.Reverse),
        label = "watcher-pulse-alpha",
    )
    Row(verticalAlignment = Alignment.CenterVertically) {
        // 28dp brand-50 tile, brand-700 mark, 8dp radius.
        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(Brand50),
            contentAlignment = Alignment.Center,
        ) {
            Text("✳", color = Brand700, fontSize = 13.sp)
        }
        Spacer(Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = source.label.ifBlank { source.type },
                style = MaterialTheme.typography.titleSmall,
                color = Ink,
                maxLines = 1,
            )
            val seen = source.lastSeenTs?.let { FamilyTime.ago(it, nowTs) }
                ?: stringResource(R.string.dash_watcher_never)
            Text(
                text = "${source.type} · $seen",
                style = MaterialTheme.typography.bodySmall,
                color = InkSoft,
                maxLines = 1,
            )
        }
        // The live dot.
        Box {
            if (live) {
                Box(
                    modifier = Modifier
                        .size(12.dp)
                        .alpha(halo)
                        .background(Success600, CircleShape),
                )
            }
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .align(Alignment.Center)
                    .background(if (live) Success600 else Neutral300, CircleShape),
            )
        }
    }
}

// -- The alert ladder ---------------------------------------------------------------

/** The tier as a gradient bar — green through orange to red, filled by tier. */
@Composable
private fun AlertLadder(ui: HomeViewModel.HomeUiState) {
    val tier = ui.tierVirtual()
    val meta = TierMeta.forTier(tier)
    PanelCard(title = stringResource(R.string.dash_ladder_title)) {
        val fill = (tier + 1) / 4f
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(10.dp)
                .clip(RoundedCornerShape(999.dp))
                .background(
                    Brush.horizontalGradient(
                        listOf(Success600, Brand600, GlowMid, Error600),
                    ),
                )
                .alpha(0.25f),
        )
        Spacer(Modifier.height(6.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(10.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(fill)
                    .height(10.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(
                        Brush.horizontalGradient(
                            listOf(Success600, Brand600, GlowMid, Error600),
                        ),
                    ),
            )
        }
        Spacer(Modifier.height(8.dp))
        Text(
            text = meta.label,
            style = MaterialTheme.typography.titleSmall,
            color = parseHex(meta.textHex, Ink),
        )
    }
}

// -- Her day ------------------------------------------------------------------------

/** "Her day" — the timeline of today's events, newest first. */
@Composable
private fun HerDay(ui: HomeViewModel.HomeUiState) {
    val nowTs = ui.nowTs
    val startOfDay = nowTs - (nowTs % 86_400_000L) - timeZoneShift(nowTs)
    val todays = ui.events
        .filter { it.ts >= startOfDay }
        .sortedByDescending { it.ts }
        .take(8)
        .ifEmpty { ui.events.sortedByDescending { it.ts }.take(4) }
    PanelCard(title = stringResource(R.string.dash_herday_title)) {
        if (todays.isEmpty()) {
            Text(
                text = stringResource(R.string.home_events_empty),
                style = MaterialTheme.typography.bodyMedium,
                color = InkSoft,
            )
        } else {
            todays.forEachIndexed { index, event ->
                TimelineRow(event = event, isLast = index == todays.lastIndex)
                if (!isLastRow(index, todays.lastIndex)) Spacer(Modifier.height(10.dp))
            }
        }
    }
}

private fun isLastRow(index: Int, lastIndex: Int) = index == lastIndex

@Composable
private fun TimelineRow(event: EventDto, isLast: Boolean) {
    Row {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .background(Brand600, CircleShape),
            )
            if (!isLast) {
                Box(
                    modifier = Modifier
                        .width(2.dp)
                        .height(22.dp)
                        .background(Hairline),
                )
            }
        }
        Spacer(Modifier.width(10.dp))
        Text(
            text = FamilyTime.clock(event.ts),
            style = MaterialTheme.typography.bodySmall,
            color = InkSoft,
            modifier = Modifier.width(52.dp),
        )
        Text(
            text = event.meta?.takeIf { it.isNotBlank() } ?: event.type,
            style = MaterialTheme.typography.bodyMedium,
            color = Ink,
            modifier = Modifier.weight(1f),
        )
    }
}

/** Milliseconds to subtract so "start of day" lands on the device's local day. */
private fun timeZoneShift(nowTs: Long): Long {
    val zone = java.time.ZoneId.systemDefault()
    val offsetSeconds = zone.rules.getOffset(java.time.Instant.ofEpochMilli(nowTs)).totalSeconds
    return offsetSeconds * 1_000L
}

// -- The SOS takeover -----------------------------------------------------------------

/** Full-bleed error surface: breathing 56sp SOS, the responder, stand-down. */
@Composable
private fun SosTakeover(
    ui: HomeViewModel.HomeUiState,
    onStandDown: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val breathe = rememberInfiniteTransition(label = "sos-takeover")
    val breatheScale by breathe.animateFloat(
        initialValue = 0.97f,
        targetValue = 1.03f,
        animationSpec = infiniteRepeatable(tween(1_400), RepeatMode.Reverse),
        label = "sos-breathe-scale",
    )
    val strobe = rememberInfiniteTransition(label = "sos-strobe")
    val strobeAlpha by strobe.animateFloat(
        initialValue = 0.4f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(420), RepeatMode.Reverse),
        label = "sos-strobe-alpha",
    )

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Error600),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                text = "SOS",
                fontSize = 56.sp,
                lineHeight = 64.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = (-1.12).sp,
                color = Color.White,
                modifier = Modifier
                    .scale(breatheScale * (0.94f + 0.06f * strobeAlpha))
                    .semantics {
                        contentDescription = "SOS is active"
                    },
            )
            Spacer(Modifier.height(10.dp))
            Text(
                text = stringResource(
                    R.string.dash_sos_body,
                    ui.household?.parentName?.takeIf { it.isNotBlank() }
                        ?: stringResource(R.string.sos_her_default),
                ),
                style = MaterialTheme.typography.bodyLarge,
                color = Color.White.copy(alpha = 0.9f),
                textAlign = TextAlign.Center,
            )
            ui.sos?.sinceTs?.let {
                Spacer(Modifier.height(6.dp))
                Text(
                    text = stringResource(R.string.dash_sos_since, FamilyTime.clock(it)),
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.7f),
                )
            }
            // The responder chip — who has said "I'm responding".
            val responder = ui.events
                .firstOrNull { it.type.contains("respond", ignoreCase = true) }
                ?.meta ?: ui.sos?.ack?.by
            if (!responder.isNullOrBlank()) {
                Spacer(Modifier.height(14.dp))
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(Color.White.copy(alpha = 0.16f))
                        .padding(horizontal = 14.dp, vertical = 6.dp),
                ) {
                    Text(
                        text = stringResource(R.string.dash_sos_responder, responder),
                        style = MaterialTheme.typography.labelMedium,
                        color = Color.White,
                    )
                }
            }
            Spacer(Modifier.height(30.dp))
            KhayaalButton(
                onClick = onStandDown,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 64.dp),
                containerColor = Color.White,
                contentColor = Error700,
            ) {
                Text(
                    text = stringResource(R.string.sos_stand_down_as, ui.memberName.ifBlank { "Family" }),
                    style = MaterialTheme.typography.titleMedium,
                )
            }
            Spacer(Modifier.height(14.dp))
            Text(
                text = stringResource(R.string.dash_sos_note),
                style = MaterialTheme.typography.bodySmall,
                color = Color.White.copy(alpha = 0.66f),
                textAlign = TextAlign.Center,
            )
        }
    }
}

// -- Shared bits ---------------------------------------------------------------------

/** A white panel card with the section title. */
@Composable
private fun PanelCard(title: String, content: @Composable () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, Hairline, RoundedCornerShape(12.dp))
            .padding(16.dp),
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            color = Ink,
        )
        Spacer(Modifier.height(12.dp))
        content()
    }
}

/** Tier with a sane offline default — the badge and ladder both read this. */
private fun HomeViewModel.HomeUiState.tierVirtual(): Int =
    if (offline) 0 else (state?.tier ?: 0)

/** "Reach her phone": message / reminder / voice note, English or Hindi. */
@Composable
private fun ReachCard(
    ui: HomeViewModel.HomeUiState,
    onText: (String) -> Unit,
    onLang: (String) -> Unit,
    onSend: (String) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, Hairline, RoundedCornerShape(12.dp))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            text = stringResource(R.string.reach_title),
            style = MaterialTheme.typography.titleMedium,
            color = Ink,
        )
        OutlinedTextField(
            value = ui.composerText,
            onValueChange = onText,
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text(stringResource(R.string.reach_hint)) },
            textStyle = MaterialTheme.typography.bodyLarge,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            // The Hindi toggle — the same `lang: "hi"` the web dashboard sends;
            // her phone speaks the note in hi-IN (see the elder app's TtsSpeaker).
            FilterChip(
                selected = ui.composerLang == CommandCreateRequest.LANG_EN,
                onClick = { onLang(CommandCreateRequest.LANG_EN) },
                label = { Text(stringResource(R.string.reach_lang_en)) },
            )
            FilterChip(
                selected = ui.composerLang == CommandCreateRequest.LANG_HI,
                onClick = { onLang(CommandCreateRequest.LANG_HI) },
                label = { Text(stringResource(R.string.reach_lang_hi)) },
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Button(
                onClick = { onSend(CommandCreateRequest.TYPE_MESSAGE) },
                enabled = !ui.sending,
                modifier = Modifier.weight(1f),
            ) {
                Text(stringResource(R.string.reach_message))
            }
            Button(
                onClick = { onSend(CommandCreateRequest.TYPE_REMINDER) },
                enabled = !ui.sending,
                modifier = Modifier.weight(1f),
            ) {
                Text(stringResource(R.string.reach_reminder))
            }
            Button(
                onClick = { onSend(CommandCreateRequest.TYPE_TTS) },
                enabled = !ui.sending,
                modifier = Modifier.weight(1f),
            ) {
                Text(stringResource(R.string.reach_tts))
            }
        }
        if (ui.sentNotice) {
            Text(
                text = stringResource(R.string.reach_sent),
                style = MaterialTheme.typography.bodyMedium,
                color = Success600,
            )
        }
        ui.composerError?.let {
            Text(text = it, style = MaterialTheme.typography.bodySmall, color = Error600)
        }
    }
}

/** Parse "#rrggbb" without pulling in a graphics parser on the hot path. */
internal fun parseHex(hex: String, fallback: Color): Color = runCatching {
    Color(android.graphics.Color.parseColor(hex))
}.getOrDefault(fallback)
