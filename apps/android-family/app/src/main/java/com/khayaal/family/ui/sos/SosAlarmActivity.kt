package com.khayaal.family.ui.sos

import android.app.Activity
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khayaal.family.FamilyApp
import com.khayaal.family.R
import com.khayaal.family.data.datastore.PairingInfo
import com.khayaal.family.ui.home.FamilyTime
import com.khayaal.family.ui.home.SosContacts
import com.khayaal.family.ui.theme.Ink
import com.khayaal.family.ui.theme.SosRed
import com.khayaal.family.ui.theme.SosRedDeep
import com.khayaal.shared.alarm.SirenPlayer
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * The family SOS moment: a red sheet over everything — lock screen included —
 * with the household's name, how long the alarm has run, one "Stand down"
 * button that files the resolve under the family member's name, and the
 * care-circle call / WhatsApp rows.
 *
 * The 2-second tick below is the family app's slice of PATH B: with no
 * Firebase config anywhere, this poll is how the screen learns the SOS was
 * stood down remotely and stops cleanly.
 */
class SosAlarmActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        showOverLockScreen()
        setContent {
            com.khayaal.family.ui.theme.FamilyTheme {
                FamilySosScreen(onFinish = { finish() })
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
private fun FamilySosScreen(onFinish: () -> Unit) {
    val context = LocalContext.current
    val container = (context.applicationContext as FamilyApp).container

    var stoodDown by remember { mutableStateOf(false) }
    var resolveFailed by remember { mutableStateOf(false) }
    var parentName by remember { mutableStateOf("") }
    var memberName by remember { mutableStateOf("") }
    var originButton by remember { mutableStateOf(true) }
    var sinceTs by remember { mutableStateOf<Long?>(null) }
    var ackBy by remember { mutableStateOf<String?>(null) }
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
                        ackBy = sos.ack?.by
                        if (!sos.active) {
                            // Stood down remotely (or resolved): stop cleanly here too.
                            com.khayaal.family.sos.FamilySosManager.onSosObservation(
                                context, sos, "sos-screen-poll",
                            )
                            onFinish()
                        }
                    }
                }
            delay(POLL_MS)
        }
    }

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
                style = MaterialTheme.typography.displaySmall,
                color = Color.White,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive },
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
                    text = stringResource(R.string.sos_screen_since, FamilyTime.clock(it)),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.White.copy(alpha = 0.8f),
                )
            }
            ackBy?.let {
                Text(
                    text = stringResource(
                        R.string.sos_screen_ack_by,
                        stringResource(R.string.sos_screen_ack_title),
                        it,
                    ),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.White.copy(alpha = 0.8f),
                )
            }

            // Stand down — signed with the family member's own name.
            val scope = rememberCoroutineScope()
            Button(
                onClick = {
                    stoodDown = true
                    // This phone goes quiet immediately; the resolve rides the
                    // network in parallel and the tick retries until it lands.
                    com.khayaal.family.sos.FamilySosManager.onUserStoodDown(context)
                    scope.launch {
                        container.repository.resolveSos(memberName.ifBlank { "Family" })
                            .onFailure { resolveFailed = true }
                            .onSuccess { resolveFailed = false }
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 88.dp),
                shape = RoundedCornerShape(30.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color.White,
                    contentColor = SosRedDeep,
                ),
            ) {
                Text(
                    text = if (stoodDown) {
                        stringResource(R.string.sos_screen_standing_down)
                    } else if (memberName.isNotBlank()) {
                        stringResource(R.string.sos_stand_down_as, memberName)
                    } else {
                        stringResource(R.string.sos_stand_down)
                    },
                    fontSize = 24.sp,
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
                                containerColor = SosRedDeep,
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
                                    containerColor = SosRedDeep,
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
                Text(text = stringResource(R.string.sos_screen_close), color = Ink.copy(alpha = 0.9f))
            }
            Spacer(Modifier.padding(bottom = 12.dp))
        }
    }
}

private const val POLL_MS = 2_000L
