package com.khayaal.family.ui.home

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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.khayaal.family.R

/** The small settings dialog: server address and unpair. */
@Composable
fun SettingsDialog(
    baseUrl: String,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit,
    onUnpair: () -> Unit,
) {
    var url by remember { mutableStateOf(baseUrl) }
    var confirmUnpair by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.settings_title)) },
        text = {
            Column {
                Text(
                    text = stringResource(R.string.settings_base_url_label),
                    style = MaterialTheme.typography.labelLarge,
                )
                Spacer(Modifier.height(6.dp))
                OutlinedTextField(
                    value = url,
                    onValueChange = { url = it },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                Spacer(Modifier.height(10.dp))
                if (confirmUnpair) {
                    Text(
                        text = stringResource(R.string.settings_unpair_warning),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                    Spacer(Modifier.height(6.dp))
                    TextButton(onClick = onUnpair) {
                        Text(stringResource(R.string.settings_unpair_confirm))
                    }
                } else {
                    TextButton(onClick = { confirmUnpair = true }) {
                        Text(stringResource(R.string.settings_unpair))
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onSave(url) }) {
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
