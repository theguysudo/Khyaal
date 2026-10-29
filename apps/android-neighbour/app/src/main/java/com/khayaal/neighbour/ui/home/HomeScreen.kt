package com.khayaal.neighbour.ui.home

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
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
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Settings
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
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
import com.khayaal.neighbour.R
import com.khayaal.neighbour.ui.components.DarkGlassCardWide
import com.khayaal.neighbour.ui.components.KhayaalButton
import com.khayaal.neighbour.ui.theme.Brand50
import com.khayaal.neighbour.ui.theme.Brand600
import com.khayaal.neighbour.ui.theme.Brand700
import com.khayaal.neighbour.ui.theme.Error100
import com.khayaal.neighbour.ui.theme.Error600
import com.khayaal.neighbour.ui.theme.Error700
import com.khayaal.neighbour.ui.theme.Ink
import com.khayaal.neighbour.ui.theme.InkSoft
import com.khayaal.neighbour.ui.theme.Success600
import com.khayaal.neighbour.ui.theme.TierMeta

/**
 * The neighbour's one screen (v2 spec 3): one big dark-glass status card —
 * "All well" or "SOS", nothing more — the private on-duty toggle, and, when
 * the alarm is live, "I'm responding" and the family's call buttons. No
 * health data, no map, no feed: the neighbour sees one bit.
 */
@Composable
fun HomeScreen(
    viewModel: HomeViewModel = viewModel(),
) {
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var showSettings by remember { mutableStateOf(false) }

    Scaffold(containerColor = MaterialTheme.colorScheme.background) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            TopBar(onSettings = { showSettings = true })

            StatusCard(ui = ui)

            OnDutyCard(offDuty = ui.offDuty, onChange = viewModel::setOffDuty)

            if (ui.sosActive) {
                RespondCard(
                    ui = ui,
                    onRespond = viewModel::respond,
                    onCall = { phone ->
                        context.startActivity(
                            Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))
                                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                        )
                    },
                )
            }

            Text(
                text = stringResource(R.string.status_note),
                style = MaterialTheme.typography.bodySmall,
                color = InkSoft,
            )
        }
    }

    if (showSettings) {
        SettingsDialog(
            baseUrl = ui.pairing?.baseUrl.orEmpty(),
            onDismiss = { showSettings = false },
            onUnpair = {
                showSettings = false
                viewModel.unpair()
            },
        )
    }
}

/** 30dp terracotta logomark chip + breadcrumb, v2 top-bar pattern. */
@Composable
private fun TopBar(onSettings: () -> Unit) {
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
                text = "Watch",
                style = MaterialTheme.typography.labelMedium,
                color = Ink,
                fontWeight = FontWeight.Black,
            )
        }
        IconButton(onClick = onSettings, modifier = Modifier.size(40.dp)) {
            Icon(
                imageVector = Icons.Filled.Settings,
                contentDescription = stringResource(R.string.home_settings_description),
                tint = InkSoft,
            )
        }
    }
}

/** THE status card — dark glass, the glow, one bit of news. */
@Composable
private fun StatusCard(ui: HomeViewModel.HomeUiState) {
    val sos = ui.sosActive
    val statusLabel = when {
        sos -> "SOS"
        ui.loading -> "…"
        ui.offline -> stringResource(R.string.status_offline)
        else -> TierMeta.forTier(ui.tier).label
    }
    // The card breathes only when an SOS is live — otherwise it is still.
    val breathe = rememberInfiniteTransition(label = "sos-breathe")
    val breatheAlpha by breathe.animateFloat(
        initialValue = 0.88f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(1_600), RepeatMode.Reverse),
        label = "sos-breathe-alpha",
    )

    DarkGlassCardWide(cornerRadius = 28, glowStrength = if (sos) 1.35f else 1f) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp)
                .alpha(if (sos) breatheAlpha else 1f),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                StatusDot(sos = sos)
                Spacer(Modifier.width(8.dp))
                Text(
                    text = statusLabel.uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color = Color.White.copy(alpha = 0.66f),
                )
            }
            Spacer(Modifier.height(10.dp))
            Text(
                text = when {
                    sos -> "SOS"
                    ui.offline || ui.loading -> "—"
                    else -> stringResource(R.string.status_all_well)
                },
                fontSize = 34.sp,
                lineHeight = 40.sp,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = (-0.68).sp,
                color = Color.White,
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics {
                    contentDescription = if (sos) "SOS is active" else "All well"
                },
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = when {
                    sos -> stringResource(
                        R.string.status_alerted_body,
                        ui.parentName.ifBlank { stringResource(R.string.app_name) },
                    )
                    else -> stringResource(R.string.status_all_well_body)
                },
                style = MaterialTheme.typography.bodyMedium,
                color = Color.White.copy(alpha = 0.72f),
                textAlign = TextAlign.Center,
            )
            ui.parentName.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.height(14.dp))
                Text(
                    text = stringResource(R.string.status_household, it),
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.5f),
                )
            }
            ui.sos?.sinceTs?.takeIf { sos }?.let {
                Spacer(Modifier.height(4.dp))
                Text(
                    text = stringResource(R.string.status_since, NeighbourTime.clock(it)),
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.5f),
                )
            }
        }
    }
}

/** Green at peace; the alarm strobes red — the ONLY fast loop in the app. */
@Composable
private fun StatusDot(sos: Boolean) {
    if (!sos) {
        Box(
            modifier = Modifier
                .size(10.dp)
                .background(Success600, CircleShape),
        )
        return
    }
    val strobe = rememberInfiniteTransition(label = "sos-strobe")
    val strobeAlpha by strobe.animateFloat(
        initialValue = 0.35f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(420), RepeatMode.Reverse),
        label = "sos-strobe-alpha",
    )
    Box(
        modifier = Modifier
            .size(10.dp)
            .alpha(strobeAlpha)
            .background(Error600, CircleShape),
    )
}

/** The private on-duty toggle — local only, the server is never told. */
@Composable
private fun OnDutyCard(offDuty: Boolean, onChange: (Boolean) -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(12.dp))
            .padding(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.status_onduty_title),
                    style = MaterialTheme.typography.titleMedium,
                    color = Ink,
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    text = stringResource(R.string.status_onduty_body),
                    style = MaterialTheme.typography.bodySmall,
                    color = InkSoft,
                )
            }
            Spacer(Modifier.width(12.dp))
            Switch(
                checked = !offDuty,
                onCheckedChange = { on -> onChange(!on) },
                colors = SwitchDefaults.colors(
                    checkedTrackColor = Brand600,
                    checkedThumbColor = Color.White,
                ),
            )
        }
    }
}

/** The response card: "I'm responding", ETA chips, and the family's numbers. */
@Composable
private fun RespondCard(
    ui: HomeViewModel.HomeUiState,
    onRespond: (Long?) -> Unit,
    onCall: (String) -> Unit,
) {
    var pickedEta by remember { mutableStateOf<Long?>(null) }
    val contacts = ui.bundle?.household?.careCircle
        .orEmpty()
        .filter { !it.phone.isNullOrBlank() }
        .map { SosContacts.Contact(it.name.ifBlank { it.phone.orEmpty() }, it.phone.orEmpty()) }
        .distinctBy { it.phone }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Error100, RoundedCornerShape(12.dp))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            text = stringResource(R.string.sos_action_respond),
            style = MaterialTheme.typography.titleMedium,
            color = Error700,
        )
        Text(
            text = stringResource(R.string.sos_eta_label),
            style = MaterialTheme.typography.bodySmall,
            color = Error700.copy(alpha = 0.85f),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            EtaChip(label = stringResource(R.string.sos_eta_asap), selected = pickedEta == null) {
                pickedEta = null
            }
            listOf(10L, 20L, 30L).forEach { eta ->
                EtaChip(
                    label = stringResource(R.string.sos_eta_min, eta.toInt()),
                    selected = pickedEta == eta,
                ) {
                    pickedEta = eta
                }
            }
        }
        KhayaalButton(
            onClick = { onRespond(pickedEta) },
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 56.dp)
                .semantics { contentDescription = "I'm responding" },
            containerColor = if (ui.respondedNotice) Success600 else Error600,
        ) {
            Text(
                text = if (ui.respondedNotice) {
                    stringResource(R.string.sos_action_respond_done)
                } else {
                    stringResource(R.string.sos_action_respond)
                },
                style = MaterialTheme.typography.titleMedium,
            )
        }
        if (ui.respondError) {
            Text(
                text = stringResource(R.string.sos_respond_failed),
                style = MaterialTheme.typography.bodySmall,
                color = Error700,
            )
        }

        if (contacts.isNotEmpty()) {
            Text(
                text = stringResource(R.string.sos_screen_contacts_title),
                style = MaterialTheme.typography.titleSmall,
                color = Error700,
            )
            contacts.take(3).forEach { contact ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color.White)
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        modifier = Modifier
                            .size(28.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(Brand50),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Call,
                            contentDescription = null,
                            tint = Brand700,
                            modifier = Modifier.size(15.dp),
                        )
                    }
                    Spacer(Modifier.width(10.dp))
                    Text(
                        text = contact.name,
                        style = MaterialTheme.typography.titleSmall,
                        color = Ink,
                        modifier = Modifier.weight(1f),
                        maxLines = 1,
                    )
                    TextButton(onClick = { onCall(contact.phone) }) {
                        Text(stringResource(R.string.sos_action_call), color = Brand600)
                    }
                }
            }
        }
    }
}

@Composable
private fun EtaChip(label: String, selected: Boolean, onClick: () -> Unit) {
    val bg by animateColorAsState(
        targetValue = if (selected) Brand600 else Color.White,
        label = "eta-chip-bg",
    )
    val fg by animateColorAsState(
        targetValue = if (selected) Color.White else Ink,
        label = "eta-chip-fg",
    )
    TextButton(
        onClick = onClick,
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(bg),
    ) {
        Text(label, color = fg, style = MaterialTheme.typography.labelMedium)
    }
}

/** Base URL + unpair — the neighbour's whole settings surface. */
@Composable
private fun SettingsDialog(
    baseUrl: String,
    onDismiss: () -> Unit,
    onUnpair: () -> Unit,
) {
    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.settings_title)) },
        text = {
            Column {
                Text(
                    text = stringResource(R.string.pairing_server_hint),
                    style = MaterialTheme.typography.bodySmall,
                    color = InkSoft,
                )
                Spacer(Modifier.height(4.dp))
                Text(text = baseUrl, style = MaterialTheme.typography.bodyMedium, color = Ink)
            }
        },
        confirmButton = {
            TextButton(onClick = onUnpair) {
                Text(stringResource(R.string.settings_unpair), color = Error600)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.settings_close)) }
        },
    )
}
