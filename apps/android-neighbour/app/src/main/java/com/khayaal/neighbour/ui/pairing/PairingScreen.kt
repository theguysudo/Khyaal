package com.khayaal.neighbour.ui.pairing

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.khayaal.neighbour.NeighbourApp
import com.khayaal.neighbour.R
import com.khayaal.neighbour.ui.components.CodeInput
import com.khayaal.neighbour.ui.components.KhayaalButton
import com.khayaal.neighbour.ui.theme.Ink
import com.khayaal.neighbour.ui.theme.InkSoft

/**
 * The 6-digit pairing screen. One extra field vs the elder app — the family
 * member's name — because "Stand down" is signed with it.
 */
@Composable
fun PairingScreen(
    onPaired: () -> Unit,
    viewModel: PairingViewModel = viewModel(),
) {
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    val baseUrl by viewModel.currentBaseUrl.collectAsStateWithLifecycle(initialValue = "")
    val context = LocalContext.current
    var showServer by remember { mutableStateOf(false) }
    var serverUrl by remember { mutableStateOf("") }

    LaunchedEffect(ui.success) {
        if (ui.success) onPaired()
    }
    LaunchedEffect(baseUrl) {
        if (serverUrl.isBlank()) serverUrl = baseUrl
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(horizontal = 24.dp, vertical = 32.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = stringResource(R.string.pairing_title),
            style = MaterialTheme.typography.headlineMedium,
            color = Ink,
        )
        Text(
            text = stringResource(R.string.pairing_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = InkSoft,
        )

        Spacer(Modifier.height(4.dp))

        Text(
            text = stringResource(R.string.pairing_name_label),
            style = MaterialTheme.typography.labelLarge,
            color = Ink,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = ui.memberName,
            onValueChange = viewModel::onNameChange,
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text(stringResource(R.string.pairing_name_hint)) },
            singleLine = true,
        )

        Spacer(Modifier.height(4.dp))

        Text(
            text = stringResource(R.string.pairing_email_label),
            style = MaterialTheme.typography.labelLarge,
            color = Ink,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = ui.email,
            onValueChange = viewModel::onEmailChange,
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text(stringResource(R.string.pairing_email_hint)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
        )

        Spacer(Modifier.height(4.dp))

        CodeInput(code = ui.code, onCodeChange = viewModel::onCodeChange)

        ui.error?.let {
            Text(text = it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }
        if (ui.success) {
            Text(
                text = if (ui.circleJoined) {
                    stringResource(R.string.pairing_circle_ok)
                } else {
                    stringResource(R.string.pairing_circle_failed)
                },
                style = MaterialTheme.typography.bodySmall,
                color = if (ui.circleJoined) MaterialTheme.colorScheme.secondary else InkSoft,
            )
        }

        KhayaalButton(
            onClick = viewModel::pair,
            enabled = ui.code.length == 6 && !ui.pairing,
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 64.dp),
            shape = RoundedCornerShape(24.dp),
        ) {
            Text(
                text = stringResource(R.string.pairing_button),
                style = MaterialTheme.typography.titleMedium,
            )
        }

        TextButton(onClick = { showServer = !showServer }) {
            Text(stringResource(R.string.pairing_server_button), color = InkSoft)
        }
        if (showServer) {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    text = stringResource(R.string.pairing_server_hint) + " — " + baseUrl,
                    style = MaterialTheme.typography.bodySmall,
                    color = InkSoft,
                )
                OutlinedTextField(
                    value = serverUrl,
                    onValueChange = { serverUrl = it },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                )
                TextButton(onClick = { viewModel.saveBaseUrl(serverUrl) }) {
                    Text(stringResource(R.string.settings_save))
                }
            }
        }
    }
}
