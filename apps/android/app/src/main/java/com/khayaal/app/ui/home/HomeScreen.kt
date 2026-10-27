package com.khayaal.app.ui.home

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.khayaal.app.R
import com.khayaal.app.ui.theme.Clay
import com.khayaal.app.ui.theme.ClayDeep
import com.khayaal.app.ui.theme.Ink
import com.khayaal.app.ui.theme.Paper
import com.khayaal.app.ui.theme.Sage

/**
 * Her daily view, deliberately near-empty: a greeting, one calm card, one
 * big "I'm OK", a small snooze. A quiet gear opens the only settings.
 * The app never shows raw signals, a score, or anything that watches her.
 */
@Composable
fun HomeScreen(
    viewModel: HomeViewModel = viewModel(),
) {
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    var showSettings by remember { mutableStateOf(false) }
    val okDescription = stringResource(R.string.a11y_im_ok_button)

    RequestCarePermissions()

    Scaffold(containerColor = Paper) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 16.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(R.string.app_name).uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color = ClayDeep,
                )
                IconButton(
                    onClick = { showSettings = true },
                    modifier = Modifier.size(48.dp),
                ) {
                    Icon(
                        imageVector = Icons.Filled.Settings,
                        contentDescription = stringResource(R.string.home_settings_description),
                        tint = Ink.copy(alpha = 0.55f),
                    )
                }
            }

            val nowMs = ui.simNowTs ?: System.currentTimeMillis()
            Text(
                text = stringResource(HomeTime.greetingResourceId(HomeTime.greetingHour(nowMs))),
                style = MaterialTheme.typography.bodyLarge,
                color = Ink.copy(alpha = 0.6f),
            )
            Text(
                text = ui.parentName.ifBlank { stringResource(R.string.app_name) },
                style = MaterialTheme.typography.displaySmall,
                color = Ink,
            )

            Spacer(Modifier.height(20.dp))

            StatusCard(
                state = ui.state,
                offline = ui.offline && !ui.loading,
            )

            if ((ui.state?.tier ?: 0) >= 1) {
                Spacer(Modifier.height(16.dp))
                NudgeCard(tier = ui.state?.tier ?: 0, childName = ui.childName)
            }

            ui.state?.snoozeUntilTs?.takeIf { it > nowMs }?.let { snoozeUntil ->
                Spacer(Modifier.height(10.dp))
                Text(
                    text = stringResource(
                        R.string.home_snoozed_until,
                        HomeTime.formatClock(snoozeUntil),
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = Ink.copy(alpha = 0.5f),
                )
            }

            Spacer(Modifier.height(28.dp))

            Button(
                onClick = viewModel::checkIn,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 84.dp)
                    .semantics {
                        contentDescription = okDescription
                    },
                shape = RoundedCornerShape(28.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Clay),
            ) {
                Text(
                    text = stringResource(R.string.home_im_ok),
                    fontSize = 26.sp,
                    lineHeight = 32.sp,
                    style = MaterialTheme.typography.titleLarge,
                )
            }

            if (ui.justCheckedIn) {
                Spacer(Modifier.height(12.dp))
                Text(
                    text = stringResource(R.string.home_im_ok_done),
                    style = MaterialTheme.typography.bodyLarge,
                    color = Sage,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            Spacer(Modifier.height(8.dp))
            TextButton(
                onClick = viewModel::snoozeOneHour,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp),
            ) {
                Text(
                    text = stringResource(R.string.home_snooze),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Ink.copy(alpha = 0.6f),
                )
            }

            ui.ingestError?.let { error ->
                Spacer(Modifier.height(12.dp))
                Text(
                    text = stringResource(R.string.home_ingest_error),
                    style = MaterialTheme.typography.bodySmall,
                    color = ClayDeep,
                )
            }
        }
    }

    if (showSettings) {
        SettingsDialog(
            baseUrl = ui.baseUrl,
            homeSsid = ui.homeSsid,
            onDismiss = { showSettings = false },
            onSave = { url, ssid ->
                viewModel.saveBaseUrl(url)
                viewModel.saveHomeSsid(ssid)
                showSettings = false
            },
            onUnpair = {
                showSettings = false
                viewModel.unpair()
            },
        )
    }
}

/** Asks once, gently, for the two permissions the passive signals need. */
@Composable
private fun RequestCarePermissions() {
    val notificationLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { }
    val activityLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { }

    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            notificationLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            activityLauncher.launch(Manifest.permission.ACTIVITY_RECOGNITION)
        }
    }
}
