package com.khayaal.app.ui.permissions

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.DirectionsWalk
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.khayaal.app.R
import com.khayaal.app.ui.components.KhayaalButton
import com.khayaal.app.ui.theme.ClayDeep
import com.khayaal.app.ui.theme.Ink
import com.khayaal.app.ui.theme.Mist
import com.khayaal.app.ui.theme.Paper
import com.khayaal.app.ui.theme.Sage

/**
 * The one permissions step, right after pairing.
 *
 * Everything the app will ever ask for is asked here, in plain language, one
 * gentle card at a time — each with a real explanation before the system
 * dialog, and a "skip for now" that never blocks anything. Pairing has
 * already succeeded by the time this screen shows, so skipping costs nothing;
 * every feature re-asks in context if it is used without its grant.
 *
 * The list is exactly what the code uses, no more:
 *  - RECORD_AUDIO — talkback, and the opt-in night watch / voice commands
 *  - POST_NOTIFICATIONS — the family's check-ins (Android 13+)
 *  - ACCESS_COARSE_LOCATION — home-or-away and movement, never a street
 *    (fine location is deliberately never used)
 *  - ACTIVITY_RECOGNITION — the step counter and walking detection (10+)
 *  - CALL_PHONE — optional: dial directly instead of opening the dialer
 */
private data class PermissionStep(
    val titleRes: Int,
    val bodyRes: Int,
    val permission: String,
    val minSdk: Int,
    val icon: ImageVector,
)

@Composable
fun PermissionsScreen(
    onFinish: () -> Unit,
) {
    val context = LocalContext.current

    val steps = remember {
        listOf(
            PermissionStep(
                titleRes = R.string.perm_mic_title,
                bodyRes = R.string.perm_mic_body,
                permission = Manifest.permission.RECORD_AUDIO,
                minSdk = Build.VERSION_CODES.BASE,
                icon = Icons.Filled.Mic,
            ),
            PermissionStep(
                titleRes = R.string.perm_notifications_title,
                bodyRes = R.string.perm_notifications_body,
                permission = Manifest.permission.POST_NOTIFICATIONS,
                minSdk = Build.VERSION_CODES.TIRAMISU,
                icon = Icons.Filled.NotificationsActive,
            ),
            PermissionStep(
                titleRes = R.string.perm_location_title,
                bodyRes = R.string.perm_location_body,
                permission = Manifest.permission.ACCESS_COARSE_LOCATION,
                minSdk = Build.VERSION_CODES.BASE,
                icon = Icons.Filled.Explore,
            ),
            PermissionStep(
                titleRes = R.string.perm_activity_title,
                bodyRes = R.string.perm_activity_body,
                permission = Manifest.permission.ACTIVITY_RECOGNITION,
                minSdk = Build.VERSION_CODES.Q,
                icon = Icons.Filled.DirectionsWalk,
            ),
            PermissionStep(
                titleRes = R.string.perm_call_title,
                bodyRes = R.string.perm_call_body,
                permission = Manifest.permission.CALL_PHONE,
                minSdk = Build.VERSION_CODES.BASE,
                icon = Icons.Filled.Call,
            ),
        ).filter { Build.VERSION.SDK_INT >= it.minSdk }
    }

    // -1 walks the list; steps.size is the "all set" finale.
    var index by remember { mutableIntStateOf(0) }
    val done = index >= steps.size

    fun advance() {
        var next = index + 1
        // A step the user already granted elsewhere is silent history.
        while (next < steps.size && ContextCompat.checkSelfPermission(context, steps[next].permission) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            next++
        }
        index = next
    }

    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { _ -> advance() }

    fun request(step: PermissionStep) {
        if (ContextCompat.checkSelfPermission(context, step.permission) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            advance()
        } else {
            launcher.launch(step.permission)
        }
    }

    Scaffold(containerColor = Paper) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 28.dp),
        ) {
            Text(
                text = stringResource(R.string.app_name).uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = ClayDeep,
            )
            Spacer(Modifier.height(18.dp))

            if (!done) {
                // Progress dots — one per remaining moment.
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    repeat(steps.size + 1) { dot ->
                        val active = dot == index || (done && dot == steps.size)
                        Box(
                            modifier = Modifier
                                .size(if (active) 10.dp else 7.dp)
                                .background(
                                    color = if (active) ClayDeep else Ink.copy(alpha = 0.18f),
                                    shape = CircleShape,
                                ),
                        )
                    }
                }
                Spacer(Modifier.height(26.dp))

                AnimatedContent(
                    targetState = index,
                    transitionSpec = {
                        (slideInHorizontally(tween(300)) { it / 6 } + fadeIn(tween(300))) togetherWith
                            (slideOutHorizontally(tween(220)) { -it / 8 } + fadeOut(tween(180)))
                    },
                    label = "perm-step",
                ) { current ->
                    val step = steps[current]
                    StepCard(
                        icon = step.icon,
                        title = stringResource(step.titleRes),
                        body = stringResource(step.bodyRes),
                        optional = current == steps.lastIndex,
                        onAllow = { request(step) },
                        onSkip = { advance() },
                    )
                }

                Spacer(Modifier.height(18.dp))
                TextButton(
                    onClick = onFinish,
                    modifier = Modifier.align(Alignment.CenterHorizontally),
                ) {
                    Text(
                        text = stringResource(R.string.perm_not_now),
                        style = MaterialTheme.typography.bodyMedium,
                        color = Ink.copy(alpha = 0.5f),
                    )
                }
            } else {
                DoneCard(onFinish = onFinish)
            }
        }
    }
}

@Composable
private fun StepCard(
    icon: ImageVector,
    title: String,
    body: String,
    optional: Boolean,
    onAllow: () -> Unit,
    onSkip: () -> Unit,
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            modifier = Modifier
                .size(72.dp)
                .background(Mist, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = ClayDeep,
                modifier = Modifier.size(34.dp),
            )
        }
        Spacer(Modifier.height(22.dp))
        Text(
            text = title,
            style = MaterialTheme.typography.headlineSmall,
            color = Ink,
            textAlign = TextAlign.Center,
        )
        if (optional) {
            Spacer(Modifier.height(6.dp))
            Text(
                text = stringResource(R.string.perm_optional),
                style = MaterialTheme.typography.labelMedium,
                color = Ink.copy(alpha = 0.5f),
            )
        }
        Spacer(Modifier.height(12.dp))
        Text(
            text = body,
            style = MaterialTheme.typography.bodyLarge,
            color = Ink.copy(alpha = 0.72f),
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(30.dp))
        KhayaalButton(
            onClick = onAllow,
            modifier = Modifier.fillMaxWidth(),
            minHeight = 60.dp,
        ) {
            Text(
                text = stringResource(R.string.perm_allow),
                style = MaterialTheme.typography.titleMedium,
            )
        }
        Spacer(Modifier.height(6.dp))
        TextButton(onClick = onSkip, modifier = Modifier.align(Alignment.CenterHorizontally)) {
            Text(
                text = stringResource(R.string.perm_skip),
                style = MaterialTheme.typography.bodyMedium,
                color = Ink.copy(alpha = 0.55f),
            )
        }
    }
}

@Composable
private fun DoneCard(onFinish: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(26.dp))
        Box(
            modifier = Modifier
                .size(72.dp)
                .background(Sage.copy(alpha = 0.18f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.Check,
                contentDescription = null,
                tint = Sage,
                modifier = Modifier.size(36.dp),
            )
        }
        Spacer(Modifier.height(22.dp))
        Text(
            text = stringResource(R.string.perm_done_title),
            style = MaterialTheme.typography.headlineSmall,
            color = Ink,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(12.dp))
        Text(
            text = stringResource(R.string.perm_done_body),
            style = MaterialTheme.typography.bodyLarge,
            color = Ink.copy(alpha = 0.72f),
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(30.dp))
        KhayaalButton(
            onClick = onFinish,
            modifier = Modifier.fillMaxWidth(),
            minHeight = 60.dp,
        ) {
            Text(
                text = stringResource(R.string.perm_done_button),
                style = MaterialTheme.typography.titleMedium,
            )
        }
    }
}
