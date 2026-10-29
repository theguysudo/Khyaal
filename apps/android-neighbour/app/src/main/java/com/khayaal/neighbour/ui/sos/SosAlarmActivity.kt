package com.khayaal.neighbour.ui.sos

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khayaal.neighbour.NeighbourApp
import com.khayaal.neighbour.R
import com.khayaal.neighbour.sos.NeighbourSosManager
import com.khayaal.neighbour.ui.home.NeighbourTime
import com.khayaal.neighbour.ui.home.SosContacts
import com.khayaal.neighbour.ui.theme.Error700
import com.khayaal.neighbour.ui.theme.GlowSoft
import com.khayaal.neighbour.ui.theme.SosRed
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * The neighbour's SOS moment: a red sheet over everything — lock screen
 * included — with the household's name, how long the alarm has run, and the
 * neighbour's two honest actions: "I'm responding" (with an ETA) and
 * "Silence for me", which quiets THIS phone only. The alarm itself is the
 * family's to stand down — the neighbour can never resolve it.
 *
 * The 2-second tick is the neighbour's slice of PATH B: with no Firebase
 * config anywhere, this poll is how the screen learns the SOS was stood down
 * remotely and closes cleanly.
 */
class SosAlarmActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        showOverLockScreen()
        setContent {
            com.khayaal.neighbour.ui.theme.NeighbourTheme {
                NeighbourSosScreen(onFinish = { finish() })
            }
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
private fun NeighbourSosScreen(onFinish: () -> Unit) {
    val context = LocalContext.current
    val container = (context.applicationContext as NeighbourApp).container

    var parentName by remember { mutableStateOf("") }
    var memberName by remember { mutableStateOf("") }
    var originButton by remember { mutableStateOf(true) }
    var sinceTs by remember { mutableStateOf<Long?>(null) }
    var responded by remember { mutableStateOf(false) }
    var respondFailed by remember { mutableStateOf(false) }
    var silenced by remember { mutableStateOf(false) }
    var contacts by remember { mutableStateOf(emptyList<SosContacts.Contact>()) }

    LaunchedEffect(Unit) {
        memberName = container.store.currentMemberName()
    }

    // 2-second tick: refresh the SOS state and the contacts while ringing.
    LaunchedEffect(Unit) {
        while (isActive) {
            container.repository.fetchState()
                .onSuccess { bundle ->
                    parentName = bundle.household?.parentName?.takeIf { it.isNotBlank() } ?: parentName
                    bundle.household?.careCircle?.let { circle ->
                        contacts = SosContacts.callable(circle)
                    }
                    bundle.sos?.let { sos ->
                        originButton = sos.originButton
                        sinceTs = sos.sinceTs ?: sinceTs
                        if (!sos.active) {
                            // Stood down remotely: this phone goes quiet too.
                            NeighbourSosManager.onSosObservation(context, sos, "sos-screen-poll")
                            onFinish()
                        }
                    }
                }
            delay(POLL_MS)
        }
    }

    val scope = rememberCoroutineScope()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(SosRed),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.padding(top = 28.dp))

            Text(
                text = stringResource(R.string.sos_screen_title),
                fontSize = 44.sp,
                lineHeight = 50.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = (-0.88).sp,
                color = Color.White,
                modifier = Modifier.semantics {
                    liveRegion = LiveRegionMode.Assertive
                },
            )
            Text(
                text = if (originButton) {
                    stringResource(R.string.sos_screen_body_button, parentName)
                } else {
                    stringResource(R.string.sos_screen_body_auto, parentName)
                },
                style = MaterialTheme.typography.bodyLarge,
                color = Color.White.copy(alpha = 0.92f),
                textAlign = TextAlign.Center,
            )
            sinceTs?.let {
                Text(
                    text = stringResource(R.string.sos_screen_since, NeighbourTime.clock(it)),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.White.copy(alpha = 0.8f),
                )
            }

            // "I'm responding" — filed under the neighbour's name with an ETA.
            Button(
                onClick = {
                    responded = true
                    scope.launch {
                        container.repository
                            .respondSos(memberName.ifBlank { "Neighbour" }, etaMin = null)
                            .onFailure { respondFailed = true }
                            .onSuccess { respondFailed = false }
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 84.dp),
                shape = RoundedCornerShape(30.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color.White,
                    contentColor = Error700,
                ),
            ) {
                Text(
                    text = if (responded) {
                        stringResource(R.string.sos_action_respond_done)
                    } else {
                        stringResource(R.string.sos_action_respond)
                    },
                    fontSize = 24.sp,
                    style = MaterialTheme.typography.titleLarge,
                )
            }
            if (responded && respondFailed) {
                Text(
                    text = stringResource(R.string.sos_respond_failed),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.White.copy(alpha = 0.85f),
                    textAlign = TextAlign.Center,
                )
            }

            // "Silence for me" — THIS phone only; the household alarm keeps
            // ringing for the family until someone stands it down.
            TextButton(onClick = {
                silenced = true
                NeighbourSosManager.onSilenceForMe(context, sinceTs)
            }) {
                Text(
                    text = stringResource(R.string.sos_action_silence),
                    color = GlowSoft,
                    style = MaterialTheme.typography.titleMedium,
                )
            }
            if (silenced) {
                Text(
                    text = stringResource(R.string.sos_action_silence_note),
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.66f),
                    textAlign = TextAlign.Center,
                )
            }

            // The care circle: call / WhatsApp rows, straight from the bundle.
            Text(
                text = stringResource(R.string.sos_screen_contacts_title),
                style = MaterialTheme.typography.titleMedium,
                color = Color.White,
            )
            if (contacts.isEmpty()) {
                Text(
                    text = stringResource(R.string.sos_screen_contacts_empty),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.White.copy(alpha = 0.8f),
                    textAlign = TextAlign.Center,
                )
            } else {
                contacts.take(4).forEach { contact ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Button(
                            onClick = {
                                context.startActivity(
                                    Intent(Intent.ACTION_DIAL, Uri.parse("tel:${contact.phone}"))
                                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                                )
                            },
                            modifier = Modifier
                                .weight(1f)
                                .heightIn(min = 60.dp),
                            shape = RoundedCornerShape(18.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Error700,
                                contentColor = Color.White,
                            ),
                        ) {
                            Text(contact.name, fontSize = 16.sp, maxLines = 1)
                        }
                        if (SosContacts.canOpenWhatsApp(context, SosContacts.waNumber(contact.phone))) {
                            Button(
                                onClick = {
                                    context.startActivity(
                                        Intent(
                                            Intent.ACTION_VIEW,
                                            Uri.parse("https://wa.me/${SosContacts.waNumber(contact.phone)}"),
                                        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                                    )
                                },
                                modifier = Modifier
                                    .width(132.dp)
                                    .heightIn(min = 60.dp),
                                shape = RoundedCornerShape(18.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = Error700,
                                    contentColor = Color.White,
                                ),
                            ) {
                                Text(stringResource(R.string.sos_screen_whatsapp), fontSize = 14.sp)
                            }
                        }
                    }
                }
            }

            TextButton(onClick = onFinish) {
                Text(
                    text = stringResource(R.string.sos_screen_close),
                    color = Color.White.copy(alpha = 0.9f),
                )
            }
            Spacer(Modifier.padding(bottom = 12.dp))
        }
    }
}

private const val POLL_MS = 2_000L
