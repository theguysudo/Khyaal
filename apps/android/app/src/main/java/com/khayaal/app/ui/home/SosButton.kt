package com.khayaal.app.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khayaal.app.R
import com.khayaal.app.ui.theme.Tier3
import kotlinx.coroutines.delay

/**
 * The SOS button: large, red, and deliberately two-step.
 *
 * ARMING CHOICE — long-press, not double-tap. A double-tap is exactly what a
 * phone bouncing in a pocket, a hand resting on the screen, or a tremor
 * produces; a held press (450 ms, with haptic feedback at the arm point)
 * cannot happen by accident, and the confirm dialog after it is a second gate.
 * Two false-positive gates exist precisely because the siren is impossible to
 * ignore — a false alarm costs the whole care circle its afternoon.
 */
@Composable
fun SosButton(
    onTrigger: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptics = LocalHapticFeedback.current
    var armed by remember { mutableStateOf(false) }
    var holding by remember { mutableStateOf(false) }
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()

    // The hold that arms it. Released early = nothing happens.
    LaunchedEffect(pressed) {
        if (pressed) {
            holding = true
            delay(HOLD_MS)
            holding = false
            haptics.performHapticFeedback(HapticFeedbackType.LongPress)
            armed = true
        } else {
            holding = false
        }
    }

    Column(modifier = modifier.fillMaxWidth()) {
        Button(
            onClick = { /* armed via long-press; tap alone does nothing */ },
            interactionSource = interaction,
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 84.dp)
                .semantics {
                    contentDescription = "SOS: press and hold to call for help"
                },
            shape = RoundedCornerShape(28.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = if (holding) Tier3.copy(alpha = 0.85f) else Tier3,
                contentColor = Color.White,
            ),
        ) {
            Column(horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally) {
                Text(
                    text = stringResource(R.string.sos_button_title),
                    fontSize = 26.sp,
                    lineHeight = 30.sp,
                    style = MaterialTheme.typography.titleLarge,
                )
                Text(
                    text = if (holding) {
                        stringResource(R.string.sos_button_hold_hint)
                    } else {
                        stringResource(R.string.sos_button_subtitle)
                    },
                    fontSize = 14.sp,
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.White.copy(alpha = 0.85f),
                )
            }
        }
    }

    if (armed) {
        AlertDialog(
            onDismissRequest = { armed = false },
            title = { Text(stringResource(R.string.sos_confirm_title)) },
            text = { Text(stringResource(R.string.sos_confirm_body)) },
            confirmButton = {
                Button(
                    onClick = {
                        armed = false
                        onTrigger()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Tier3, contentColor = Color.White),
                ) {
                    Text(stringResource(R.string.sos_confirm_yes))
                }
            },
            dismissButton = {
                TextButton(onClick = { armed = false }) {
                    Text(stringResource(R.string.sos_confirm_no))
                }
            },
        )
    }
}

/**
 * The persistent red banner while a household SOS is active: the way back in
 * after the full-screen alarm was dismissed, with the stand-down on it.
 */
@Composable
fun SosBanner(
    onStandDown: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(Tier3, RoundedCornerShape(20.dp))
            .padding(horizontal = 18.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
    ) {
        Text(
            text = stringResource(R.string.sos_banner_active),
            style = MaterialTheme.typography.titleMedium,
            color = Color.White,
            modifier = Modifier.weight(1f),
        )
        TextButton(onClick = onStandDown) {
            Text(
                text = stringResource(R.string.sos_stand_down),
                color = Color.White,
                style = MaterialTheme.typography.titleSmall,
            )
        }
    }
}

private const val HOLD_MS = 450L
