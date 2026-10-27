package com.khayaal.app.ui.talkback

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.khayaal.app.R
import com.khayaal.app.ui.components.KhayaalButton
import com.khayaal.app.ui.theme.ClayDeep
import com.khayaal.app.ui.theme.Ink
import com.khayaal.app.ui.theme.Mist
import com.khayaal.app.ui.theme.Paper

/**
 * The consent popup — the most important screen in the talkback feature.
 *
 * It covers the whole phone, cannot be swiped away, and offers exactly two
 * very large buttons. The microphone on either side stays shut until "Allow"
 * is tapped, so nobody ever has to wonder who is listening.
 */
@Composable
fun TalkbackConsentOverlay(
    requesterName: String,
    onAllow: () -> Unit,
    onDecline: () -> Unit,
) {
    Dialog(
        onDismissRequest = { /* The answer must be deliberate — no tap-out. */ },
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            dismissOnClickOutside = false,
            dismissOnBackPress = false,
        ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Paper)
                .padding(28.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = stringResource(R.string.talkback_incoming_title),
                style = MaterialTheme.typography.headlineMedium,
                color = Ink,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(16.dp))
            Text(
                text = if (requesterName.isBlank()) {
                    stringResource(R.string.talkback_incoming_body_generic)
                } else {
                    stringResource(R.string.talkback_incoming_body, requesterName)
                },
                style = MaterialTheme.typography.bodyLarge,
                color = Ink.copy(alpha = 0.7f),
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(12.dp))
            Text(
                text = stringResource(R.string.talkback_incoming_privacy),
                style = MaterialTheme.typography.bodyMedium,
                color = ClayDeep,
                textAlign = TextAlign.Center,
            )

            Spacer(Modifier.height(40.dp))

            KhayaalButton(
                onClick = onAllow,
                modifier = Modifier.fillMaxWidth(),
                minHeight = 96.dp,
                shape = RoundedCornerShape(28.dp),
            ) {
                Text(
                    text = stringResource(R.string.talkback_allow),
                    fontSize = 30.sp,
                    lineHeight = 36.sp,
                    style = MaterialTheme.typography.titleLarge,
                )
            }

            Spacer(Modifier.height(16.dp))

            Button(
                onClick = onDecline,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 88.dp),
                shape = RoundedCornerShape(28.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Mist,
                    contentColor = Ink,
                ),
            ) {
                Text(
                    text = stringResource(R.string.talkback_not_now),
                    fontSize = 26.sp,
                    lineHeight = 32.sp,
                    style = MaterialTheme.typography.titleLarge,
                )
            }
        }
    }
}
