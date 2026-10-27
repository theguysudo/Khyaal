package com.khayaal.app.ui.pairing

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.khayaal.app.R
import com.khayaal.app.ui.components.CodeInput
import com.khayaal.app.ui.theme.Clay
import com.khayaal.app.ui.theme.ClayDeep
import com.khayaal.app.ui.theme.Ink
import com.khayaal.app.ui.theme.Paper
import com.khayaal.app.ui.theme.Sage
import kotlinx.coroutines.delay

/**
 * The first screen her family ever sees: a 6-digit code and one warm button.
 * On success it rests for a moment on "Khayaal is watching over her —
 * quietly." before the daily view takes over.
 */
@Composable
fun PairingScreen(
    onPaired: () -> Unit,
    viewModel: PairingViewModel = viewModel(),
) {
    val ui by viewModel.ui.collectAsState()
    val baseUrl by viewModel.currentBaseUrl.collectAsState(initial = "")
    var showServerDialog by remember { mutableStateOf(false) }

    LaunchedEffect(ui.success) {
        if (ui.success) {
            delay(SUCCESS_HOLD_MS)
            onPaired()
        }
    }

    Scaffold(containerColor = Paper) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 32.dp),
        ) {
            Text(
                text = stringResource(R.string.app_name).uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = ClayDeep,
            )
            Spacer(Modifier.height(16.dp))

            if (ui.success) {
                SuccessState()
            } else {
                Text(
                    text = stringResource(R.string.pairing_title),
                    style = MaterialTheme.typography.displaySmall,
                    color = Ink,
                )
                Spacer(Modifier.height(12.dp))
                Text(
                    text = stringResource(R.string.pairing_subtitle),
                    style = MaterialTheme.typography.bodyLarge,
                    color = Ink.copy(alpha = 0.72f),
                )
                Spacer(Modifier.height(32.dp))

                CodeInput(
                    code = ui.code,
                    onCodeChange = viewModel::onCodeChange,
                )

                ui.error?.let { error ->
                    Spacer(Modifier.height(12.dp))
                    Text(
                        text = error,
                        style = MaterialTheme.typography.bodyMedium,
                        color = ClayDeep,
                    )
                }

                Spacer(Modifier.height(32.dp))
                Button(
                    onClick = viewModel::pair,
                    enabled = ui.code.length == 6 && !ui.pairing,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    shape = RoundedCornerShape(28.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Clay),
                ) {
                    if (ui.pairing) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(22.dp),
                            strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.onPrimary,
                        )
                    } else {
                        Text(
                            text = stringResource(R.string.pairing_button),
                            style = MaterialTheme.typography.titleMedium,
                        )
                    }
                }

                Spacer(Modifier.height(16.dp))
                TextButton(onClick = { showServerDialog = true }) {
                    Text(
                        text = stringResource(R.string.pairing_server_button),
                        style = MaterialTheme.typography.bodyMedium,
                        color = Sage,
                    )
                }
                if (baseUrl.isNotBlank()) {
                    Text(
                        text = baseUrl,
                        style = MaterialTheme.typography.bodySmall,
                        color = Ink.copy(alpha = 0.45f),
                    )
                }
            }
        }
    }

    if (showServerDialog) {
        ServerDialog(
            initialUrl = baseUrl,
            onDismiss = { showServerDialog = false },
            onSave = { url ->
                viewModel.saveBaseUrl(url)
                showServerDialog = false
            },
        )
    }
}

@Composable
private fun SuccessState() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(28.dp))
            .padding(28.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = stringResource(R.string.pairing_success_title),
            style = MaterialTheme.typography.headlineSmall,
            color = Sage,
        )
        Text(
            text = stringResource(R.string.pairing_success_body),
            style = MaterialTheme.typography.bodyLarge,
            color = Ink.copy(alpha = 0.72f),
        )
        Box(
            modifier = Modifier
                .size(28.dp)
                .background(Sage.copy(alpha = 0.18f), RoundedCornerShape(14.dp)),
        )
    }
}

@Composable
private fun ServerDialog(
    initialUrl: String,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit,
) {
    var url by remember { mutableStateOf(initialUrl) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.pairing_server_button)) },
        text = {
            OutlinedTextField(
                value = url,
                onValueChange = { url = it },
                label = { Text(stringResource(R.string.pairing_server_hint)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        },
        confirmButton = {
            TextButton(onClick = { onSave(url) }) { Text(stringResource(R.string.settings_save)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.settings_close)) }
        },
    )
}

private const val SUCCESS_HOLD_MS = 1800L
