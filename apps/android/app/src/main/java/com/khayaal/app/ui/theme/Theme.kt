package com.khayaal.app.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

private val KhayaalColorScheme = lightColorScheme(
    primary = Clay,
    onPrimary = Color.White,
    primaryContainer = Mist,
    onPrimaryContainer = ClayDeep,
    secondary = Sage,
    onSecondary = Color.White,
    secondaryContainer = Cream,
    onSecondaryContainer = Ink,
    background = Paper,
    onBackground = Ink,
    surface = Color.White,
    onSurface = Ink,
    surfaceVariant = Cream,
    onSurfaceVariant = Ink.copy(alpha = 0.72f),
    outline = CardBorder,
    outlineVariant = CardBorder,
    error = Tier3,
    onError = Color.White,
    errorContainer = Tier3.copy(alpha = 0.12f),
    onErrorContainer = Tier3,
)

private val KhayaalShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(20.dp),
    large = RoundedCornerShape(28.dp),
    extraLarge = RoundedCornerShape(32.dp),
)

/** Warm paper, large type, calm corners. Light-only by design. */
@Composable
fun KhayaalTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = KhayaalColorScheme,
        typography = KhayaalTypography,
        shapes = KhayaalShapes,
        content = content,
    )
}
