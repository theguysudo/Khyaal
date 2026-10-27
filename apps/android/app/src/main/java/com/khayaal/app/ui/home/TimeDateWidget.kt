package com.khayaal.app.ui.home

import androidx.compose.animation.core.animateIntAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
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
import com.khayaal.app.R
import com.khayaal.app.ui.theme.CardBorder
import com.khayaal.app.ui.theme.Cream
import com.khayaal.app.ui.theme.Ink
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * The first thing she sees: the time, huge, and the day spelled out in words.
 *
 * "Tuesday, 24 October" reads better than "Tue 24/10" — the date is written
 * the way people say it. The clock ticks on its own so the widget is never
 * stale, and the minute only changes once a minute, so the number never
 * flickers in a way that would catch her eye.
 */
@Composable
fun TimeDateWidget(
    nowMs: Long,
    modifier: Modifier = Modifier,
) {
    var tick by remember { mutableStateOf(nowMs) }
    LaunchedEffect(nowMs) {
        // Re-read the clock every half a minute — enough to stay right,
        // rarely enough to stay calm.
        while (true) {
            kotlinx.coroutines.delay(30_000L)
            tick = System.currentTimeMillis()
        }
    }
    val effective = if (tick > 0) tick else nowMs
    val local = remember(effective) {
        LocalDateTime.ofInstant(Instant.ofEpochMilli(effective), ZoneId.systemDefault())
    }

    val hour = local.hour
    val minute = local.minute
    val animatedMinute by animateIntAsState(
        targetValue = minute,
        animationSpec = tween(durationMillis = 500),
        label = "clock-minute",
    )
    val meridiem = if (hour < 12) "AM" else "PM"
    val displayHour = when {
        hour == 0 -> 12
        hour > 12 -> hour - 12
        else -> hour
    }

    val dateText = remember(local.toLocalDate()) {
        local.toLocalDate().format(
            DateTimeFormatter.ofPattern("EEEE, d MMMM", Locale.getDefault()),
        )
    }
    val description = "$displayHour:$animatedMinute $meridiem, $dateText"

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(Cream, RoundedCornerShape(28.dp))
            .padding(horizontal = 24.dp, vertical = 20.dp)
            .semantics { contentDescription = description },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(
                imageVector = Icons.Filled.AccessTime,
                contentDescription = null,
                tint = Ink.copy(alpha = 0.35f),
                modifier = Modifier.size(20.dp),
            )
            Text(
                text = stringResource(R.string.widget_time_label),
                style = MaterialTheme.typography.labelMedium,
                color = Ink.copy(alpha = 0.5f),
            )
        }

        Spacer(Modifier.height(4.dp))

        Row(verticalAlignment = Alignment.Bottom) {
            Text(
                text = displayHour.toString(),
                fontSize = 72.sp,
                lineHeight = 76.sp,
                style = MaterialTheme.typography.displayLarge,
                color = Ink,
            )
            Text(
                text = ":",
                fontSize = 60.sp,
                lineHeight = 66.sp,
                style = MaterialTheme.typography.displayLarge,
                color = Ink.copy(alpha = 0.45f),
            )
            Text(
                text = animatedMinute.toString().padStart(2, '0'),
                fontSize = 72.sp,
                lineHeight = 76.sp,
                style = MaterialTheme.typography.displayLarge,
                color = Ink,
            )
            Spacer(Modifier.size(10.dp))
            Text(
                text = meridiem,
                fontSize = 24.sp,
                lineHeight = 30.sp,
                style = MaterialTheme.typography.titleMedium,
                color = Ink.copy(alpha = 0.55f),
                modifier = Modifier.padding(bottom = 12.dp),
            )
        }

        Spacer(Modifier.height(2.dp))

        Text(
            text = dateText,
            fontSize = 22.sp,
            lineHeight = 28.sp,
            style = MaterialTheme.typography.titleMedium,
            color = Ink.copy(alpha = 0.7f),
        )
    }
}

/** Today, spelled out — used by the Today segment. */
fun todayLabel(nowMs: Long): String {
    val date: LocalDate = LocalDateTime
        .ofInstant(Instant.ofEpochMilli(nowMs), ZoneId.systemDefault())
        .toLocalDate()
    return date.format(DateTimeFormatter.ofPattern("EEEE, d MMMM", Locale.getDefault()))
}
