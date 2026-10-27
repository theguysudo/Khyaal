package com.khayaal.app.ui.home

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.NightsStay
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.khayaal.app.R
import com.khayaal.app.data.datastore.SleepMilestone
import com.khayaal.app.ui.theme.Clay
import com.khayaal.app.ui.theme.Ink
import com.khayaal.app.ui.theme.Mist
import com.khayaal.app.ui.theme.Sage

/**
 * The night watch card: one honest toggle, the plain-words disclosure, and
 * last night's only trace — the few classified moments Khayaal noticed.
 * Below it, the optional "Hey Khayaal" voice-command toggle.
 */
@Composable
fun SleepCard(
    nightWatchOn: Boolean,
    voiceOn: Boolean,
    voiceAvailable: Boolean,
    lastSleep: SleepMilestone?,
    onToggleNightWatch: (Boolean) -> Unit,
    onToggleVoice: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    val nightWatchDescription = stringResource(
        if (nightWatchOn) R.string.night_watch_on else R.string.night_watch_off,
    )
    val voiceDescription = stringResource(
        if (voiceOn) R.string.voice_on else R.string.voice_off,
    )

    Column(
        modifier = modifier
            .fillMaxWidth()
            .animateContentSize()
            .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(28.dp))
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = Icons.Filled.NightsStay,
                contentDescription = null,
                tint = Clay,
            )
            Spacer(Modifier.padding(start = 8.dp))
            Text(
                text = stringResource(R.string.night_watch_title),
                style = MaterialTheme.typography.headlineSmall,
                color = Ink,
            )
            Spacer(
                Modifier
                    .weight(1f)
                    .padding(start = 8.dp),
            )
            Switch(
                checked = nightWatchOn,
                onCheckedChange = onToggleNightWatch,
                colors = SwitchDefaults.colors(
                    checkedTrackColor = Sage,
                    uncheckedTrackColor = Mist,
                ),
                modifier = Modifier.semantics { contentDescription = nightWatchDescription },
            )
        }

        // The disclosure, word for word.
        Text(
            text = stringResource(R.string.night_watch_disclosure),
            style = MaterialTheme.typography.bodySmall,
            color = Ink.copy(alpha = 0.6f),
        )

        lastSleep?.let { milestone ->
            Text(
                text = describeMilestone(milestone),
                style = MaterialTheme.typography.bodyMedium,
                color = Sage,
            )
        }

        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = Icons.Filled.GraphicEq,
                contentDescription = null,
                tint = Clay.copy(alpha = 0.8f),
            )
            Spacer(Modifier.padding(start = 8.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.voice_title),
                    style = MaterialTheme.typography.titleMedium,
                    color = Ink,
                )
                Text(
                    text = stringResource(R.string.voice_disclosure),
                    style = MaterialTheme.typography.bodySmall,
                    color = Ink.copy(alpha = 0.6f),
                )
            }
            Switch(
                checked = voiceOn,
                onCheckedChange = onToggleVoice,
                enabled = voiceAvailable,
                colors = SwitchDefaults.colors(
                    checkedTrackColor = Sage,
                    uncheckedTrackColor = Mist,
                ),
                modifier = Modifier.semantics { contentDescription = voiceDescription },
            )
        }
    }
}

@Composable
private fun describeMilestone(milestone: SleepMilestone): String {
    val clock = HomeTime.formatClock(milestone.ts)
    return when (milestone.value) {
        "asleep" -> stringResource(R.string.night_watch_last_sleep, clock)
        "awake" -> stringResource(R.string.night_watch_last_awake, clock)
        "restless" -> stringResource(R.string.night_watch_last_restless, clock)
        "woke" -> stringResource(R.string.night_watch_last_woke, clock)
        else -> stringResource(R.string.night_watch_last_sleep, clock)
    }
}
