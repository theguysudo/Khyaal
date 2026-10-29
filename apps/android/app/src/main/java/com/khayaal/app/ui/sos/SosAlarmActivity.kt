package com.khayaal.app.ui.sos

import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.khayaal.app.KhayaalApp
import com.khayaal.app.R
import com.khayaal.app.care.FamilyCall
import com.khayaal.app.data.datastore.CallChainState
import com.khayaal.app.sos.SosManager
import com.khayaal.app.ui.theme.Ink
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * The full-screen SOS moment on her phone: a red sheet, one enormous
 * "I'm safe" button, one call-family escape hatch, nothing else.
 *
 * It is declared `showWhenLocked` + `turnScreenOn`, and the notification that
 * carries it uses a full-screen intent — so an SOS takes over the lock screen
 * even while the phone sleeps. The siren keeps ringing until she taps
 * "I'm safe": that tap stops the siren on this phone immediately (the sound
 * must obey her, not the network) and files the resolve with the backend,
 * retrying every tick until it lands.
 */
class SosAlarmActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        showOverLockScreen()
        setContent {
            SosAlarmScreen(
                onFinish = { finish() },
            )
        }
    }

    private fun showOverLockScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
            )
        }
    }
}

@Composable
private fun SosAlarmScreen(onFinish: () -> Unit) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val container = (context.applicationContext as KhayaalApp).container
    val stoodDownLabel = stringResource(R.string.sos_stand_down)

    var stoodDown by remember { mutableStateOf(false) }
    var resolveFailed by remember { mutableStateOf(false) }
    var active by remember { mutableStateOf(true) }
    var parentName by remember { mutableStateOf("") }
    var originButton by remember { mutableStateOf(true) }
    var callOrder by remember { mutableStateOf(emptyList<CallChainState.Entry>()) }

    // The elder's name for the resolve ("by") — her own device speaks for her.
    suspend fun resolveName(): String {
        val stored = container.pairingStore.current()?.parentName.orEmpty()
        return stored.ifBlank { context.getString(R.string.sos_by_elder) }
    }

    // The 2-second tick while this screen is alive. This is PATH B again —
    // with no Firebase config at all, this poll is what lets the phone stop
    // cleanly when the family stands the SOS down from the dashboard.
    LaunchedEffect(Unit) {
        while (isActive) {
            container.repository.fetchState()
                .onSuccess { bundle ->
                    val sos = bundle.sos
                    parentName = bundle.household?.parentName?.takeIf { it.isNotBlank() } ?: parentName
                    sos?.originButton?.let { originButton = it }
                    active = sos?.active ?: active
                    if (!active && !stoodDown) {
                        // Someone stood it down remotely — stop cleanly here too.
                        SosManager.onSosObservation(context, sos, "sos-screen-poll")
                        onFinish()
                    }
                    if (stoodDown && sos?.active == true) {
                        // Our resolve hasn't landed on the server yet — keep
                        // trying on every tick while this screen lives.
                        val name = resolveName()
                        container.repository.resolveSos(name)
                            .onFailure { resolveFailed = true }
                            .onSuccess { resolveFailed = false }
                    }
                }
            callOrder = container.pairingStore.currentCallOrder()
            delay(POLL_MS)
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(SosRed),
    ) {
        val pulse = rememberInfiniteTransition(label = "sos-pulse")
        val glow by pulse.animateFloat(
            initialValue = 0.55f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(tween(700), RepeatMode.Reverse),
            label = "sos-glow",
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(28.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.padding(top = 40.dp))

            Text(
                text = stringResource(R.string.sos_screen_title),
                style = MaterialTheme.typography.displaySmall,
                color = Color.White,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .alpha(glow)
                    .semantics { liveRegion = LiveRegionMode.Assertive },
            )

            Text(
                text = if (originButton) {
                    stringResource(R.string.sos_screen_body_button, parentName.ifBlank { "" })
                } else {
                    stringResource(R.string.sos_screen_body_auto, parentName.ifBlank { "" })
                },
                style = MaterialTheme.typography.bodyLarge,
                color = Color.White.copy(alpha = 0.9f),
                textAlign = TextAlign.Center,
            )

            Spacer(Modifier.weight(1f))

            // THE way out: stops the siren on this phone at once and files
            // the resolve. It must be the biggest thing on the screen.
            val scope = rememberCoroutineScope()
            Button(
                onClick = {
                    stoodDown = true
                    // Her phone goes quiet the instant she says so.
                    SosManager.onUserStoodDown(context)
                    // The resolve rides the network in parallel; the 2-second
                    // tick above retries until the backend confirms it.
                    scope.launch {
                        val name = resolveName()
                        container.repository.resolveSos(name)
                            .onFailure { resolveFailed = true }
                            .onSuccess { resolveFailed = false }
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 96.dp)
                    .semantics { contentDescription = stoodDownLabel },
                shape = RoundedCornerShape(32.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color.White,
                    contentColor = SosRedDeep,
                ),
            ) {
                Text(
                    text = if (stoodDown) {
                        stringResource(R.string.sos_screen_standing_down)
                    } else {
                        stringResource(R.string.sos_stand_down)
                    },
                    fontSize = 28.sp,
                    style = MaterialTheme.typography.titleLarge,
                )
            }

            if (stoodDown && resolveFailed) {
                Text(
                    text = stringResource(R.string.sos_screen_resolve_retrying),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.White.copy(alpha = 0.85f),
                    textAlign = TextAlign.Center,
                )
            }

            // Call family: the first number on the family's call order, else
            // the plain dialer. The dialer opens — she (or whoever is beside
            // her) presses call.
            val callTarget = callOrder.firstOrNull { it.phone.isNotBlank() }
            Button(
                onClick = { FamilyCall.openDialer(context, callTarget?.phone) },
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 72.dp),
                shape = RoundedCornerShape(28.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = SosRedDeep,
                    contentColor = Color.White,
                ),
            ) {
                Text(
                    text = if (callTarget != null) {
                        stringResource(R.string.sos_screen_call, callTarget.name.ifBlank { "" })
                    } else {
                        stringResource(R.string.sos_screen_call_anyone)
                    },
                    fontSize = 22.sp,
                    style = MaterialTheme.typography.titleMedium,
                )
            }

            if (stoodDown && !resolveFailed) {
                TextButton(onClick = onFinish) {
                    Text(
                        text = stringResource(R.string.sos_screen_close),
                        color = Ink.copy(alpha = 0.9f),
                    )
                }
            }

            Text(
                text = stringResource(R.string.sos_screen_footer),
                style = MaterialTheme.typography.bodySmall,
                color = Color.White.copy(alpha = 0.7f),
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.padding(bottom = 16.dp))
        }
    }
}

/** The one red this app uses for emergencies. */
private val SosRed = Color(0xFFB23A2F)
private val SosRedDeep = Color(0xFF77231C)

private const val POLL_MS = 2_000L
