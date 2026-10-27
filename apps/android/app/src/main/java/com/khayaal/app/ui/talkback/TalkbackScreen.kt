package com.khayaal.app.ui.talkback

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.PhoneInTalk
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.khayaal.app.R
import com.khayaal.app.talkback.TalkbackManager
import com.khayaal.app.ui.components.KhayaalButton
import com.khayaal.app.ui.components.ScreenHeader
import com.khayaal.app.ui.theme.Clay
import com.khayaal.app.ui.theme.ClayDeep
import com.khayaal.app.ui.theme.Ink
import com.khayaal.app.ui.theme.Mist
import com.khayaal.app.ui.theme.Paper
import com.khayaal.app.ui.theme.Sage
import com.khayaal.app.ui.theme.Tier3
import kotlinx.coroutines.launch

/**
 * The walkie-talkie screen, in its four honest states: idle, waiting for the
 * other side to say yes, live, and ended — the big circle tells you which one
 * you are in, and it is never a dead end. The microphone is only opened after
 * consent AND after the phone's own permission has been granted; without the
 * grant the button asks once, then guides to settings instead of failing
 * silently. Nothing about the audio protocol lives here.
 */
@Composable
fun TalkbackScreen(
    manager: TalkbackManager,
    onBack: () -> Unit,
) {
    val ui by manager.ui.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    // The phone's own mic permission, checked fresh on every interaction.
    var micGranted by remember { mutableStateOf(hasMicPermission(context)) }
    var micDeniedOnce by remember { mutableStateOf(false) }
    val micLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        micGranted = granted
        if (!granted) micDeniedOnce = true
    }

    // Press feedback on the hold-to-talk pad.
    val holdInteraction = remember { MutableInteractionSource() }
    val holding by holdInteraction.collectIsPressedAsState()
    val holdScale by animateFloatAsState(
        targetValue = if (holding) 0.97f else 1f,
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMediumLow),
        label = "hold-scale",
    )

    fun onHoldStart() {
        if (ui.canTalk && micGranted) {
            manager.startCapture()
        } else if (!micGranted) {
            micLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    Scaffold(containerColor = Paper) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            ScreenHeader(
                title = stringResource(R.string.talkback_title),
                subtitle = stringResource(R.string.talkback_privacy_note),
                onBack = onBack,
            )

            Spacer(Modifier.height(22.dp))

            // The state chip: idle → waiting → live, in one glance.
            val (chipLabel, chipColor) = when {
                ui.recording -> stringResource(R.string.talkback_talking) to Clay
                ui.remoteTalking -> stringResource(R.string.talkback_listening) to Sage
                ui.isActive -> stringResource(R.string.talkback_quiet) to Sage
                ui.session != null -> stringResource(R.string.talkback_waiting) to ClayDeep
                else -> stringResource(R.string.talkback_idle_state) to Ink.copy(alpha = 0.5f)
            }
            AnimatedContent(
                targetState = chipLabel,
                transitionSpec = { (fadeIn(tween(220)) togetherWith fadeOut(tween(160))) },
                label = "talkback-chip",
            ) { label ->
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelLarge,
                    color = Color(0xFF071030),
                    modifier = Modifier
                        .background(chipColor, RoundedCornerShape(20.dp))
                        .padding(horizontal = 18.dp, vertical = 8.dp),
                )
            }

            if (ui.status.isNotBlank()) {
                Spacer(Modifier.height(10.dp))
                Text(
                    text = ui.status,
                    style = MaterialTheme.typography.bodyMedium,
                    color = Ink.copy(alpha = 0.6f),
                    textAlign = TextAlign.Center,
                )
            }

            Spacer(Modifier.height(26.dp))

            // A calm, slow pulse — no flashing, no strobing.
            val pulse by animateFloatAsState(
                targetValue = if (ui.remoteTalking) 1.08f else 1f,
                animationSpec = spring(dampingRatio = 0.6f, stiffness = 120f),
                label = "talkback-pulse",
            )
            val circleColor by animateColorAsState(
                targetValue = when {
                    ui.recording -> Clay
                    ui.remoteTalking -> Sage.copy(alpha = 0.85f)
                    else -> Mist
                },
                animationSpec = tween(300),
                label = "talkback-circle",
            )
            val onCircle = if (ui.recording || ui.remoteTalking) {
                Color(0xFF071030)
            } else {
                Ink.copy(alpha = 0.72f)
            }

            Box(
                modifier = Modifier
                    .size(210.dp)
                    .scale(pulse)
                    .background(color = circleColor, shape = CircleShape)
                    .border(1.dp, Ink.copy(alpha = 0.10f), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    AnimatedContent(
                        targetState = ui.recording,
                        transitionSpec = { (fadeIn(tween(220)) togetherWith fadeOut(tween(160))) },
                        label = "talkback-circle-icon",
                    ) { recording ->
                        Icon(
                            imageVector = if (recording) Icons.Filled.Mic else Icons.Filled.PhoneInTalk,
                            contentDescription = null,
                            tint = onCircle,
                            modifier = Modifier.size(64.dp),
                        )
                    }
                    Spacer(Modifier.height(10.dp))
                    Text(
                        text = if (ui.remoteTalking) {
                            stringResource(R.string.talkback_listening)
                        } else {
                            stringResource(R.string.talkback_quiet)
                        },
                        style = MaterialTheme.typography.titleMedium,
                        color = onCircle,
                    )
                }
            }

            Spacer(Modifier.height(26.dp))

            // Hold to talk. The press starts the microphone, the release stops
            // it. Without the mic grant the first press asks; a permanent no
            // shows the way to settings below.
            val talkLabel = stringResource(R.string.talkback_hold_to_talk)
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 126.dp)
                    .scale(holdScale)
                    .background(
                        color = if (ui.canTalk && micGranted) Clay else Mist,
                        shape = RoundedCornerShape(32.dp),
                    )
                    .pointerInput(ui.canTalk, micGranted) {
                        if (!ui.canTalk) return@pointerInput
                        detectTapGestures(
                            onPress = {
                                onHoldStart()
                                tryAwaitRelease()
                                manager.stopCapture()
                            },
                        )
                    }
                    .padding(24.dp),
                contentAlignment = Alignment.Center,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Filled.Mic,
                        contentDescription = null,
                        tint = if (ui.canTalk && micGranted) {
                            MaterialTheme.colorScheme.onPrimary
                        } else {
                            Ink.copy(alpha = 0.45f)
                        },
                        modifier = Modifier.size(30.dp),
                    )
                    Spacer(Modifier.size(12.dp))
                    Text(
                        text = talkLabel,
                        fontSize = 24.sp,
                        lineHeight = 30.sp,
                        style = MaterialTheme.typography.titleLarge,
                        color = if (ui.canTalk && micGranted) {
                            MaterialTheme.colorScheme.onPrimary
                        } else {
                            Ink.copy(alpha = 0.45f)
                        },
                    )
                }
            }

            // The mic was asked for and the phone said no — explain, then open
            // the way to settings. Never a dead button.
            AnimatedVisibility(
                visible = !micGranted,
                enter = fadeIn(tween(240)) + slideInVertically(tween(240)) { it / 3 },
                exit = fadeOut(tween(180)) + slideOutVertically(tween(180)) { it / 3 },
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 14.dp)
                        .background(Mist, RoundedCornerShape(20.dp))
                        .padding(18.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Filled.MicOff,
                            contentDescription = null,
                            tint = Tier3,
                            modifier = Modifier.size(22.dp),
                        )
                        Spacer(Modifier.size(10.dp))
                        Text(
                            text = if (micDeniedOnce) {
                                stringResource(R.string.talkback_mic_denied)
                            } else {
                                stringResource(R.string.talkback_mic_needed)
                            },
                            style = MaterialTheme.typography.bodyMedium,
                            color = Ink.copy(alpha = 0.78f),
                            modifier = Modifier.weight(1f),
                        )
                    }
                    TextButton(
                        onClick = {
                            context.startActivity(
                                Intent(
                                    android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                                    Uri.fromParts("package", context.packageName, null),
                                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                            )
                        },
                    ) {
                        Text(
                            text = stringResource(R.string.perm_open_settings),
                            style = MaterialTheme.typography.labelLarge,
                            color = ClayDeep,
                        )
                    }
                }
            }

            Spacer(Modifier.height(18.dp))

            AnimatedVisibility(visible = ui.isActive) {
                TextButton(
                    onClick = { manager.endTalkback() },
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 56.dp),
                ) {
                    Text(
                        text = stringResource(R.string.talkback_hang_up),
                        style = MaterialTheme.typography.titleMedium,
                        color = ClayDeep,
                    )
                }
            }

            ui.error?.let {
                Spacer(Modifier.height(8.dp))
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodyMedium,
                    color = Tier3,
                    textAlign = TextAlign.Center,
                )
            }

            Spacer(Modifier.height(22.dp))

            KhayaalButton(
                onClick = { scope.launch { manager.requestTalkback() } },
                modifier = Modifier.fillMaxWidth(),
                minHeight = 84.dp,
                shape = RoundedCornerShape(28.dp),
            ) {
                Icon(
                    imageVector = Icons.Filled.Call,
                    contentDescription = null,
                    modifier = Modifier.size(30.dp),
                )
                Spacer(Modifier.size(12.dp))
                Text(
                    text = stringResource(R.string.talkback_call_family),
                    fontSize = 22.sp,
                    lineHeight = 28.sp,
                    style = MaterialTheme.typography.titleLarge,
                )
            }

            Spacer(Modifier.height(16.dp))

            Text(
                text = stringResource(R.string.talkback_privacy_note),
                style = MaterialTheme.typography.bodySmall,
                color = Ink.copy(alpha = 0.5f),
                textAlign = TextAlign.Center,
            )
        }
    }
}

private fun hasMicPermission(context: Context): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
        PackageManager.PERMISSION_GRANTED
