package com.khayaal.app.ui.home

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.khayaal.app.ui.theme.CardBorder
import com.khayaal.app.ui.theme.tierColor

/**
 * The status ring: a soft arc that fills with the day's score and takes the
 * tier's color. Deliberately unhurried — the number arrives, it doesn't pounce.
 */
@Composable
fun ScoreRing(
    score: Int?,
    tier: Int,
    modifier: Modifier = Modifier,
    size: Dp = 92.dp,
    ringWidth: Dp = 8.dp,
) {
    val target = ((score ?: 0) / 100f).coerceIn(0f, 1f)
    val progress by animateFloatAsState(
        targetValue = target,
        animationSpec = tween(durationMillis = 900),
        label = "score-ring-progress",
    )
    val targetColor = tierColor(tier)
    val ringColor by animateColorAsState(
        targetValue = targetColor,
        animationSpec = tween(durationMillis = 600),
        label = "score-ring-color",
    )
    val track = CardBorder
    val description = if (score == null) {
        "Status ring, still learning"
    } else {
        "Status ring, score $score of 100"
    }

    Box(
        modifier = modifier
            .size(size)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(modifier = Modifier.size(size)) {
            val stroke = ringWidth.toPx()
            val inset = stroke / 2
            val arcSize = Size(this.size.width - stroke, this.size.height - stroke)
            val topLeft = Offset(inset, inset)
            drawArc(
                color = track,
                startAngle = -90f,
                sweepAngle = 360f,
                useCenter = false,
                topLeft = topLeft,
                size = arcSize,
                style = Stroke(width = stroke, cap = StrokeCap.Round),
            )
            if (score != null) {
                drawArc(
                    color = ringColor,
                    startAngle = -90f,
                    sweepAngle = 360f * progress,
                    useCenter = false,
                    topLeft = topLeft,
                    size = arcSize,
                    style = Stroke(width = stroke, cap = StrokeCap.Round),
                )
            }
        }
        Text(
            text = score?.toString() ?: "…",
            style = MaterialTheme.typography.headlineMedium,
            color = if (score == null) Color.Gray.copy(alpha = 0.4f) else ringColor,
        )
    }
}

/** Blends two tier colors gently — used by the alarm overlay's entrance. */
fun tierColorBlend(from: Color, to: Color, fraction: Float): Color = lerp(from, to, fraction)
