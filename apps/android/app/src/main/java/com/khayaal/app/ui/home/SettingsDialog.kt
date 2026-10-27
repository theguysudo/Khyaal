package com.khayaal.app.ui.home

import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.khayaal.app.R
import com.khayaal.app.ui.theme.Tier3

/**
 * The deliberately hidden settings: server address, home Wi-Fi name, and the
 * quiet way out (unpair). Reached only through the small gear.
 */
@Composable
fun SettingsDialog(
    baseUrl: String,
    homeSsid: String?,
    onDismiss: () -> Unit,
    onSave: (baseUrl: String, homeSsid: String) -> Unit,
    onUnpair: () -> Unit,
) {
    var url by rememberSaveable { mutableStateOf(baseUrl) }
    var ssid by rememberSaveable { mutableStateOf(homeSsid.orEmpty()) }
    var confirmUnpair by rememberSaveable { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.settings_title)) },
        text = {
            Column {
                OutlinedTextField(
                    value = url,
                    onValueChange = { url = it },
                    label = { Text(stringResource(R.string.settings_base_url_label)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = ssid,
                    onValueChange = { ssid = it },
                    label = { Text(stringResource(R.string.settings_home_ssid_label)) },
                    supportingText = { Text(stringResource(R.string.settings_home_ssid_hint)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(16.dp))
                Text(
                    text = if (confirmUnpair) {
                        stringResource(R.string.settings_unpair_warning)
                    } else {
                        stringResource(R.string.settings_unpair)
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (confirmUnpair) Tier3 else MaterialTheme.colorScheme.primary,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                        ) {
                            if (confirmUnpair) onUnpair() else confirmUnpair = true
                        },
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { onSave(url, ssid) }) {
                Text(stringResource(R.string.settings_save))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.settings_close))
            }
        },
    )
}
