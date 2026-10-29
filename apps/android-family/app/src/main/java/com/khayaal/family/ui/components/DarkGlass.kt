package com.khayaal.family.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.khayaal.family.ui.theme.DarkGlassDeep
import com.khayaal.family.ui.theme.GlowHot
import com.khayaal.family.ui.theme.GlowMid
import com.khayaal.family.ui.theme.GlowSoft
import com.khayaal.family.ui.theme.Neutral800

/*
 * THE SIGNATURE (docs/DESIGN_SYSTEM.md v2) — the dark-glass counter card:
 * #262626 in light mode, #0D0D0D in dark, ~28dp radius, and the orange radial
 * glow rising from the bottom edge (#FF6B21 → #F27F24 → #FFDCA6).
 */

/**
 * A dark-glass card with the Counter glow. [glowStrength] scales the radial
 * gradient — the hero counter runs it full; quieter surfaces can dim it.
 */
@Composable
fun DarkGlassCard(
    modifier: Modifier = Modifier,
    cornerRadius: Int = 28,
    glowStrength: Float = 1f,
    content: @Composable BoxScope.() -> Unit,
) {
    val base = if (isSystemInDarkTheme()) DarkGlassDeep else Neutral800
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(cornerRadius.dp))
            .background(base)
            .drawBehind {
                val radius = size.width * 0.95f
                drawRect(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            GlowHot.copy(alpha = 0.55f * glowStrength),
                            GlowMid.copy(alpha = 0.30f * glowStrength),
                            GlowSoft.copy(alpha = 0.10f * glowStrength),
                            Color.Transparent,
                        ),
                        center = Offset(size.width / 2f, size.height * 1.04f),
                        radius = radius,
                    ),
                )
                // A hairline of light along the top edge — the "glass".
                drawRect(
                    brush = Brush.verticalGradient(
                        colors = listOf(
                            Color.White.copy(alpha = 0.08f),
                            Color.Transparent,
                        ),
                        endY = size.height * 0.22f,
                    ),
                )
            },
        content = content,
    )
}

/** The full-width convenience — dashboard cards are edge-to-edge in their gutter. */
@Composable
fun DarkGlassCardWide(
    modifier: Modifier = Modifier,
    cornerRadius: Int = 28,
    glowStrength: Float = 1f,
    content: @Composable BoxScope.() -> Unit,
) {
    DarkGlassCard(
        modifier = modifier.fillMaxWidth(),
        cornerRadius = cornerRadius,
        glowStrength = glowStrength,
        content = content,
    )
}
