package com.khayaal.app.ui.reminders

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Alarm
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.khayaal.app.R
import com.khayaal.app.data.api.CommandDto
import com.khayaal.app.ui.home.HomeTime
import com.khayaal.app.ui.theme.Clay
import com.khayaal.app.ui.theme.ClayDeep
import com.khayaal.app.ui.theme.Ink
import com.khayaal.app.ui.theme.Mist
import com.khayaal.app.ui.theme.Paper
import com.khayaal.app.ui.theme.Sage

/**
 * Everything the family has sent to this phone — messages, reminders, voice
 * notes — newest first. Read-only and calm; the notifications have already
 * made their visit.
 */
@Composable
fun RemindersScreen(
    commands: List<CommandDto>,
    onBack: () -> Unit,
) {
    Scaffold(containerColor = Paper) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 24.dp, vertical = 16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack, modifier = Modifier.size(48.dp)) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = stringResource(R.string.assistant_back_desc),
                        tint = Ink.copy(alpha = 0.6f),
                    )
                }
                Text(
                    text = stringResource(R.string.reminders_title),
                    style = MaterialTheme.typography.headlineSmall,
                    color = Ink,
                )
            }

            Spacer(Modifier.padding(top = 12.dp))

            if (commands.isEmpty()) {
                Text(
                    text = stringResource(R.string.reminders_empty),
                    style = MaterialTheme.typography.bodyLarge,
                    color = Ink.copy(alpha = 0.6f),
                )
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(commands, key = { it.id.ifBlank { it.ts.toString() } }) { command ->
                        CommandRow(command)
                    }
                }
            }
        }
    }
}

@Composable
private fun CommandRow(command: CommandDto) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(20.dp))
            .padding(16.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .background(Mist, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = iconFor(command.type),
                contentDescription = null,
                tint = ClayDeep,
                modifier = Modifier.size(20.dp),
            )
        }
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                text = titleFor(command.type),
                style = MaterialTheme.typography.labelMedium,
                color = Sage,
            )
            Text(
                text = command.text,
                style = MaterialTheme.typography.bodyLarge,
                color = Ink,
            )
            if (command.ts > 0) {
                Text(
                    text = HomeTime.formatClock(command.ts),
                    style = MaterialTheme.typography.bodySmall,
                    color = Ink.copy(alpha = 0.45f),
                )
            }
        }
    }
}

@Composable
private fun titleFor(type: String): String = when (type) {
    CommandDto.Types.REMINDER -> stringResource(R.string.command_reminder_title)
    CommandDto.Types.TTS -> stringResource(R.string.command_tts_title)
    CommandDto.Types.REQUEST_CHECKIN -> stringResource(R.string.command_request_checkin_title)
    else -> stringResource(R.string.command_message_title)
}

private fun iconFor(type: String) = when (type) {
    CommandDto.Types.REMINDER -> Icons.Filled.Alarm
    CommandDto.Types.TTS -> Icons.Filled.VolumeUp
    CommandDto.Types.REQUEST_CHECKIN -> Icons.Filled.Call
    else -> Icons.Filled.Chat
}
