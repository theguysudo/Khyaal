package com.khayaal.app.ui.home

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.expandVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khayaal.app.R
import com.khayaal.app.data.datastore.ChecklistItem
import com.khayaal.app.ui.theme.Clay
import com.khayaal.app.ui.theme.Cream
import com.khayaal.app.ui.theme.Ink
import com.khayaal.app.ui.theme.Mist
import com.khayaal.app.ui.theme.Sage

/**
 * Her own to-do list. Add a line, tick it off, throw it away — all three
 * with one big tap, all three saved on the phone so they survive a restart.
 *
 * The list is never uploaded: it belongs to her, not to the family.
 */
@Composable
fun ChecklistWidget(
    items: List<ChecklistItem>,
    onAdd: (String) -> Unit,
    onToggle: (ChecklistItem) -> Unit,
    onDelete: (ChecklistItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    var draft by remember { mutableStateOf("") }
    val addLabel = stringResource(R.string.widget_checklist_add)
    val hint = stringResource(R.string.widget_checklist_hint)
    val deleteDesc = stringResource(R.string.widget_checklist_delete_desc)
    val doneDesc = stringResource(R.string.widget_checklist_done_desc)
    val undoDesc = stringResource(R.string.widget_checklist_undo_desc)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(Cream, RoundedCornerShape(28.dp))
            .padding(horizontal = 20.dp, vertical = 18.dp),
    ) {
        Text(
            text = stringResource(R.string.widget_checklist_title),
            style = MaterialTheme.typography.titleMedium,
            color = Ink,
        )

        Spacer(Modifier.height(10.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            OutlinedTextField(
                value = draft,
                onValueChange = { draft = it },
                placeholder = { Text(hint, style = MaterialTheme.typography.bodyLarge) },
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(18.dp),
                singleLine = true,
                textStyle = MaterialTheme.typography.bodyLarge,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(
                    onDone = {
                        if (draft.isNotBlank()) {
                            onAdd(draft.trim())
                            draft = ""
                        }
                    },
                ),
            )
            Button(
                onClick = {
                    if (draft.isNotBlank()) {
                        onAdd(draft.trim())
                        draft = ""
                    }
                },
                enabled = draft.isNotBlank(),
                modifier = Modifier
                    .size(64.dp)
                    .semantics { contentDescription = addLabel },
                shape = RoundedCornerShape(20.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Clay),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp),
            ) {
                Icon(
                    imageVector = Icons.Filled.Add,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onPrimary,
                    modifier = Modifier.size(32.dp),
                )
            }
        }

        Spacer(Modifier.height(8.dp))

        if (items.isEmpty()) {
            Text(
                text = stringResource(R.string.widget_checklist_empty),
                style = MaterialTheme.typography.bodyMedium,
                color = Ink.copy(alpha = 0.5f),
            )
        }

        items.forEach { item ->
            AnimatedVisibility(
                visible = true,
                enter = fadeIn(tween(200)) + expandVertically(tween(200)),
                exit = fadeOut(tween(200)) + shrinkVertically(tween(200)),
            ) {
                ChecklistRow(
                    item = item,
                    deleteDescription = deleteDesc,
                    doneDescription = doneDesc,
                    undoDescription = undoDesc,
                    onToggle = { onToggle(item) },
                    onDelete = { onDelete(item) },
                )
            }
        }
    }
}

@Composable
private fun ChecklistRow(
    item: ChecklistItem,
    deleteDescription: String,
    doneDescription: String,
    undoDescription: String,
    onToggle: () -> Unit,
    onDelete: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // The tick: a big square that turns green when the job is done.
        Box(
            modifier = Modifier
                .size(44.dp)
                .background(
                    color = if (item.done) Sage else Mist,
                    shape = RoundedCornerShape(14.dp),
                )
                .clickable(onClick = onToggle)
                .semantics {
                    contentDescription = if (item.done) undoDescription else doneDescription
                },
            contentAlignment = Alignment.Center,
        ) {
            if (item.done) {
                Icon(
                    imageVector = Icons.Filled.Check,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onPrimary,
                    modifier = Modifier.size(28.dp),
                )
            }
        }

        Text(
            text = item.text,
            modifier = Modifier.weight(1f),
            style = MaterialTheme.typography.bodyLarge,
            fontSize = 18.sp,
            color = if (item.done) Ink.copy(alpha = 0.45f) else Ink,
            textDecoration = if (item.done) TextDecoration.LineThrough else null,
        )

        IconButton(
            onClick = onDelete,
            modifier = Modifier.size(48.dp),
        ) {
            Icon(
                imageVector = Icons.Filled.Close,
                contentDescription = deleteDescription,
                tint = Ink.copy(alpha = 0.4f),
                modifier = Modifier.size(26.dp),
            )
        }
    }
}
