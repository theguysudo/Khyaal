package com.khayaal.app.ui.talkback

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
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
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.PhoneInTalk
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.khayaal.app.R
import com.khayaal.app.talkback.TalkbackManager
import com.khayaal.app.ui.theme.Clay
import com.khayaal.app.ui.theme.ClayDeep
import com.khayaal.app.ui.theme.Ink
import com.khayaal.app.ui.theme.Mist
import com.khayaal.app.ui.theme.Paper
import com.khayaal.app.ui.theme.Sage
import kotlinx.coroutines.launch

/**
 * The walkie-talkie screen. One enormous button: hold it to talk, let go to
 * stop. Nothing about the microphone happens until the other side has said
 * yes — the button simply stays greyed out until then.
 */
@Composable
fun TalkbackScreen(
    manager: TalkbackManager,
    onBack: () -> Unit,
) {
    val ui by manager.ui.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()

    Scaffold(containerColor = Paper) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                IconButton(onClick = onBack, modifier = Modifier.size(48.dp)) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = stringResource(R.string.assistant_back_desc),
                        tint = Ink.copy(alpha = 0.6f),
                    )
                }
                Text(
                    text = stringResource(R.string.talkback_title),
                    style = MaterialTheme.typography.headlineSmall,
                    color = Ink,
                )
                Spacer(Modifier.size(48.dp))
            }

            Spacer(Modifier.height(12.dp))

            Text(
                text = ui.status.ifBlank { stringResource(R.string.talkback_idle) },
                style = MaterialTheme.typography.bodyLarge,
                color = Ink.copy(alpha = 0.65f),
            )

            Spacer(Modifier.height(8.dp))

            // A calm, slow pulse — no flashing, no strobing.
            val pulse by animateFloatAsState(
                targetValue = if (ui.remoteTalking) 1.08f else 1f,
                animationSpec = spring(dampingRatio = 0.6f, stiffness = 120f),
                label = "talkback-pulse",
            )

            Box(
                modifier = Modifier
                    .size(220.dp)
                    .scale(pulse)
                    .background(
                        color = if (ui.remoteTalking) Sage else Mist,
                        shape = CircleShape,
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        imageVector = Icons.Filled.PhoneInTalk,
                        contentDescription = null,
                        tint = Ink.copy(alpha = 0.55f),
                        modifier = Modifier.size(72.dp),
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = when {
                            ui.recording -> stringResource(R.string.talkback_talking)
                            ui.remoteTalking -> stringResource(R.string.talkback_listening)
                            else -> stringResource(R.string.talkback_quiet)
                        },
                        style = MaterialTheme.typography.titleMedium,
                        color = Ink.copy(alpha = 0.7f),
                    )
                }
            }

            Spacer(Modifier.height(24.dp))

            // Hold to talk. The press starts the microphone, the release stops it.
            val talkLabel = stringResource(R.string.talkback_hold_to_talk)
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 130.dp)
                    .background(
                        color = if (ui.canTalk) Clay else Mist,
                        shape = RoundedCornerShape(32.dp),
                    )
                    .pointerInput(ui.canTalk) {
                        if (!ui.canTalk) return@pointerInput
                        detectTapGestures(
                            onPress = {
                                manager.startCapture()
                                tryAwaitRelease()
                                manager.stopCapture()
                            },
                        )
                    }
                    .padding(24.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = talkLabel,
                    fontSize = 26.sp,
                    lineHeight = 32.sp,
                    style = MaterialTheme.typography.titleLarge,
                    color = if (ui.canTalk) Color.White else Ink.copy(alpha = 0.45f),
                )
            }

            Spacer(Modifier.height(20.dp))

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
                    color = ClayDeep,
                )
            }

            Spacer(Modifier.height(24.dp))

            Button(
                onClick = { scope.launch { manager.requestTalkback() } },
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 88.dp),
                shape = RoundedCornerShape(28.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Clay),
            ) {
                Icon(
                    imageVector = Icons.Filled.Call,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(32.dp),
                )
                Spacer(Modifier.size(12.dp))
                Text(
                    text = stringResource(R.string.talkback_call_family),
                    fontSize = 24.sp,
                    lineHeight = 30.sp,
                    style = MaterialTheme.typography.titleLarge,
                )
            }

            Spacer(Modifier.height(16.dp))

            Text(
                text = stringResource(R.string.talkback_privacy_note),
                style = MaterialTheme.typography.bodySmall,
                color = Ink.copy(alpha = 0.5f),
            )
        }
    }
}
