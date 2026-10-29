package com.khayaal.family.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.dp
import com.khayaal.family.ui.theme.Brand600
import com.khayaal.family.ui.theme.Brand700
import com.khayaal.family.ui.theme.Wash

/**
 * The Khayaal button — the one filled control in the app (v2 spec).
 *
 * Terracotta #DC6803, white 16/24 Semibold type, 8dp radius — and THE v2
 * press morph: the whole thing scales to 0.955 and the corner radius springs
 * 8→16 while held, spring(dampingRatio 0.7, stiffness 300).
 */
@Composable
fun KhayaalButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    containerColor: Color = Brand600,
    contentColor: Color = Color.White,
    disabledContainerColor: Color = Wash,
    shape: Shape = MaterialTheme.shapes.extraSmall,
    minHeight: androidx.compose.ui.unit.Dp = 56.dp,
    content: @Composable RowScope.() -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.955f else 1f,
        animationSpec = spring(dampingRatio = 0.7f, stiffness = 300f),
        label = "khayaal-button-scale",
    )
    val corner by animateFloatAsState(
        targetValue = if (pressed) 16f else 8f,
        animationSpec = spring(dampingRatio = 0.7f, stiffness = 300f),
        label = "khayaal-button-corner",
    )
    val alpha by animateFloatAsState(
        targetValue = if (pressed) 0.96f else 1f,
        animationSpec = spring(stiffness = 300f),
        label = "khayaal-button-alpha",
    )

    Button(
        onClick = onClick,
        modifier = modifier
            .heightIn(min = minHeight)
            .scale(scale)
            .alpha(alpha),
        enabled = enabled,
        shape = androidx.compose.foundation.shape.RoundedCornerShape(corner.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = containerColor,
            contentColor = contentColor,
            disabledContainerColor = disabledContainerColor,
            disabledContentColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f),
        ),
        interactionSource = interaction,
        content = content,
    )
}

/** The pressed container colour — Brand700 — for callers that hand-roll buttons. */
val PressedBrand: Color get() = Brand700
