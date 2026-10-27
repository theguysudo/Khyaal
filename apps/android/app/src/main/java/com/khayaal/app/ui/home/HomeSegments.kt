package com.khayaal.app.ui.home

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DirectionsWalk
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.NightsStay
import androidx.compose.material.icons.filled.WbSunny
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khayaal.app.R
import com.khayaal.app.ui.theme.Clay
import com.khayaal.app.ui.theme.Cream
import com.khayaal.app.ui.theme.Ink
import com.khayaal.app.ui.theme.Mist
import com.khayaal.app.ui.theme.Sage

/**
 * The five sections of the daily view. She moves between them with one big
 * tap at the bottom of the screen; the body of the screen changes with a
 * soft cross-fade.
 *
 * The order is the order of a day: what is happening now, who loves me, am I
 * safe, am I moving, and did I sleep.
 */
enum class HomeSegment(
    val labelRes: Int,
    val icon: ImageVector,
) {
    TODAY(R.string.segment_today, Icons.Filled.WbSunny),
    FAMILY(R.string.segment_family, Icons.Filled.Groups),
    HEALTH(R.string.segment_health, Icons.Filled.Favorite),
    MOVEMENT(R.string.segment_movement, Icons.Filled.DirectionsWalk),
    NIGHT(R.string.segment_night, Icons.Filled.NightsStay),
}

/**
 * The bottom bar. Five targets, each at least 64dp tall — a big target is a
 * kind target. The selected one grows a little and turns clay, so the choice
 * is obvious at a glance.
 */
@Composable
fun SegmentBar(
    selected: HomeSegment,
    onSelect: (HomeSegment) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(Cream, RoundedCornerShape(28.dp))
            .padding(horizontal = 6.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        HomeSegment.entries.forEach { segment ->
            SegmentTab(
                segment = segment,
                active = segment == selected,
                onClick = { onSelect(segment) },
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun SegmentTab(
    segment: HomeSegment,
    active: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val label = stringResource(segment.labelRes)
    val tint by animateColorAsState(
        targetValue = if (active) Clay else Ink.copy(alpha = 0.45f),
        animationSpec = tween(durationMillis = 220),
        label = "segment-tint",
    )
    val iconSize by animateDpAsState(
        targetValue = if (active) 30.dp else 24.dp,
        animationSpec = spring(dampingRatio = 0.7f, stiffness = 220f),
        label = "segment-icon-size",
    )
    val scale by animateFloatAsState(
        targetValue = if (active) 1f else 0.96f,
        animationSpec = spring(dampingRatio = 0.7f, stiffness = 220f),
        label = "segment-scale",
    )

    Column(
        modifier = modifier
            .heightIn(min = 64.dp)
            .background(
                color = if (active) Mist else Color.Transparent,
                shape = RoundedCornerShape(20.dp),
            )
            .clickable(onClick = onClick)
            .semantics { contentDescription = label }
            .padding(vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            imageVector = segment.icon,
            contentDescription = null,
            tint = tint,
            modifier = Modifier
                .size(iconSize)
                .graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                },
        )
        Spacer(Modifier.height(2.dp))
        Text(
            text = label,
            fontSize = 12.sp,
            lineHeight = 15.sp,
            style = MaterialTheme.typography.labelSmall,
            color = tint,
        )
    }
}

/** A plain content card — the building block of every segment. */
@Composable
fun SegmentCard(
    modifier: Modifier = Modifier,
    content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(Cream, RoundedCornerShape(24.dp))
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        content = content,
    )
}

/** A section heading inside a card. */
@Composable
fun SegmentHeading(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleMedium,
        fontSize = 20.sp,
        color = Ink,
    )
}

/** A big, plain label — the value of a fact ("At home", "312 steps"). */
@Composable
fun SegmentValue(text: String, accent: Color = Ink) {
    Text(
        text = text,
        style = MaterialTheme.typography.headlineSmall,
        fontSize = 26.sp,
        color = accent,
    )
}

/** A small quiet line under a value. */
@Composable
fun SegmentHint(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodyMedium,
        color = Ink.copy(alpha = 0.55f),
    )
}

/** The little sage dot that says "moving right now". */
@Composable
fun MovingDot(moving: Boolean) {
    val color = if (moving) Clay else Sage
    Box(
        modifier = Modifier
            .size(12.dp)
            .background(color, RoundedCornerShape(6.dp)),
    )
}
