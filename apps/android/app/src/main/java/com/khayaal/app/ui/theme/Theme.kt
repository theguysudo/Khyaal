package com.khayaal.app.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

private val KhayaalColorScheme = darkColorScheme(
    primary = Clay,
    onPrimary = Color(0xFF071030), // deep navy on the glow blue — large-type safe
    primaryContainer = Mist,
    onPrimaryContainer = ClayDeep,
    secondary = Sage,
    onSecondary = Color.White,
    secondaryContainer = Mist,
    onSecondaryContainer = Ink,
    background = Paper,
    onBackground = Ink,
    surface = Cream,
    onSurface = Ink,
    surfaceVariant = Mist,
    onSurfaceVariant = Ink.copy(alpha = 0.72f),
    outline = CardBorder,
    outlineVariant = CardBorder,
    error = Tier3,
    onError = Color.White,
    errorContainer = Tier3.copy(alpha = 0.16f),
    onErrorContainer = Tier3,
)

private val KhayaalShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(20.dp),
    large = RoundedCornerShape(28.dp),
    extraLarge = RoundedCornerShape(32.dp),
)

/** Night-navy canvas, glow-blue accents, large type. Dark-only by design. */
@Composable
fun KhayaalTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = KhayaalColorScheme,
        typography = KhayaalTypography,
        shapes = KhayaalShapes,
        content = content,
    )
}
