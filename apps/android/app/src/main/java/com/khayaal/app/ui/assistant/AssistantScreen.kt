package com.khayaal.app.ui.assistant

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.khayaal.app.R
import com.khayaal.app.care.FamilyCall
import com.khayaal.app.ui.theme.Clay
import com.khayaal.app.ui.theme.ClayDeep
import com.khayaal.app.ui.theme.Ink
import com.khayaal.app.ui.theme.Mist
import com.khayaal.app.ui.theme.Paper
import com.khayaal.app.ui.theme.Sage

/**
 * The chat: large warm bubbles, three quick-action chips, one big input.
 * "Call family" is a chip that dials rather than a chat turn — help should
 * sometimes be a phone call, not a sentence.
 */
@Composable
fun AssistantScreen(
    onBack: () -> Unit,
    viewModel: AssistantViewModel = viewModel(),
) {
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    var draft by remember { mutableStateOf("") }
    val listState = rememberLazyListState()
    val context = LocalContext.current
    val sendDescription = stringResource(R.string.assistant_send_desc)
    val backDescription = stringResource(R.string.assistant_back_desc)

    LaunchedEffect(ui.messages.size) {
        if (ui.messages.isNotEmpty()) listState.animateScrollToItem(ui.messages.size - 1)
    }

    Scaffold(containerColor = Paper) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding(),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBack, modifier = Modifier.size(48.dp)) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = backDescription,
                        tint = Ink.copy(alpha = 0.6f),
                    )
                }
                Column {
                    Text(
                        text = stringResource(R.string.assistant_title),
                        style = MaterialTheme.typography.headlineSmall,
                        color = Ink,
                    )
                    Text(
                        text = stringResource(R.string.assistant_subtitle),
                        style = MaterialTheme.typography.bodySmall,
                        color = Ink.copy(alpha = 0.55f),
                    )
                }
            }

            LazyColumn(
                state = listState,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentPadding = PaddingValues(horizontal = 20.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(ui.messages) { message ->
                    Bubble(message)
                }
                if (ui.sending) {
                    item {
                        Box(Modifier.padding(start = 4.dp)) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                strokeWidth = 2.dp,
                                color = Sage,
                            )
                        }
                    }
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                val medicineChip = stringResource(R.string.assistant_quick_medicine)
                val callChip = stringResource(R.string.assistant_quick_call)
                val jokeChip = stringResource(R.string.assistant_quick_joke)
                Chip(medicineChip) {
                    viewModel.quickAction(medicineChip)
                }
                Chip(callChip) {
                    FamilyCall.openDialer(context, null)
                }
                Chip(jokeChip) {
                    viewModel.quickAction(jokeChip)
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedTextField(
                    value = draft,
                    onValueChange = { draft = it },
                    placeholder = { Text(stringResource(R.string.assistant_input_hint)) },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(20.dp),
                    singleLine = true,
                )
                Button(
                    onClick = {
                        viewModel.send(draft)
                        draft = ""
                    },
                    enabled = draft.isNotBlank() && !ui.sending,
                    modifier = Modifier
                        .size(56.dp)
                        .semantics { contentDescription = sendDescription },
                    shape = RoundedCornerShape(18.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Clay),
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.Send,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onPrimary,
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
private fun Bubble(message: AssistantViewModel.ChatMessage) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (message.isFromUser) Arrangement.End else Arrangement.Start,
    ) {
        Box(
            modifier = Modifier
                .widthIn(max = 300.dp)
                .background(
                    color = if (message.isFromUser) Clay else MaterialTheme.colorScheme.surface,
                    shape = RoundedCornerShape(
                        topStart = 20.dp,
                        topEnd = 20.dp,
                        bottomStart = if (message.isFromUser) 20.dp else 4.dp,
                        bottomEnd = if (message.isFromUser) 4.dp else 20.dp,
                    ),
                )
                .padding(horizontal = 16.dp, vertical = 12.dp),
        ) {
            Text(
                text = message.content,
                style = MaterialTheme.typography.bodyLarge,
                color = if (message.isFromUser) MaterialTheme.colorScheme.onPrimary else Ink,
            )
        }
    }
}

@Composable
private fun Chip(label: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .heightIn(min = 48.dp)
            .background(Mist, RoundedCornerShape(24.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge,
            color = ClayDeep,
        )
    }
}
