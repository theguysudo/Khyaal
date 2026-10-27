package com.khayaal.app.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.NightsStay
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.khayaal.app.R
import com.khayaal.app.ui.theme.Clay
import com.khayaal.app.ui.theme.Cream
import com.khayaal.app.ui.theme.Ink
import com.khayaal.app.ui.theme.Mist
import com.khayaal.app.ui.theme.Sage

/**
 * The four everyday helpers, one gentle grid: Call family, Ask Khayaal,
 * Night watch (a real toggle) and Reminders. Every tile is at least 48dp,
 * every tile speaks its purpose aloud for TalkBack.
 */
@Composable
fun QuickActions(
    nightWatchOn: Boolean,
    onCallFamily: () -> Unit,
    onAskKhayaal: () -> Unit,
    onToggleNightWatch: (Boolean) -> Unit,
    onReminders: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        ActionTile(
            icon = Icons.Filled.Call,
            label = stringResource(R.string.qa_call_family),
            description = stringResource(R.string.qa_call_family_desc),
            onClick = onCallFamily,
            modifier = Modifier.weight(1f),
        )
        ActionTile(
            icon = Icons.Filled.Chat,
            label = stringResource(R.string.qa_ask_khayaal),
            description = stringResource(R.string.qa_ask_khayaal_desc),
            onClick = onAskKhayaal,
            modifier = Modifier.weight(1f),
        )
    }
    Spacer(Modifier.padding(top = 12.dp))
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        ToggleTile(
            icon = Icons.Filled.NightsStay,
            label = stringResource(R.string.qa_night_watch),
            description = stringResource(R.string.qa_night_watch_desc),
            checked = nightWatchOn,
            onCheckedChange = onToggleNightWatch,
            modifier = Modifier.weight(1f),
        )
        ActionTile(
            icon = Icons.Filled.List,
            label = stringResource(R.string.qa_reminders),
            description = stringResource(R.string.qa_reminders_desc),
            onClick = onReminders,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun ActionTile(
    icon: ImageVector,
    label: String,
    description: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .heightIn(min = 96.dp)
            .background(Cream, RoundedCornerShape(24.dp))
            .clickable(onClick = onClick)
            .semantics { contentDescription = description }
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = Clay,
            modifier = Modifier.padding(2.dp),
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge,
            color = Ink,
        )
    }
}

@Composable
private fun ToggleTile(
    icon: ImageVector,
    label: String,
    description: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .heightIn(min = 96.dp)
            .background(if (checked) Mist else Cream, RoundedCornerShape(24.dp))
            .clickable { onCheckedChange(!checked) }
            .semantics { contentDescription = description }
            .padding(16.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (checked) Sage else Clay,
                modifier = Modifier.padding(2.dp),
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelLarge,
                color = Ink,
            )
        }
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(
                checkedTrackColor = Sage,
                uncheckedTrackColor = MaterialTheme.colorScheme.surfaceVariant,
            ),
            modifier = Modifier.semantics { contentDescription = label },
        )
    }
}
