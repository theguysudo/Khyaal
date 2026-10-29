package com.khayaal.family.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

private val FamilyLightScheme = lightColorScheme(
    primary = Brand600, // terracotta filled controls (pressed = Brand700)
    onPrimary = Color.White,
    primaryContainer = Brand50,
    onPrimaryContainer = Brand700,
    secondary = Neutral600,
    onSecondary = Color.White,
    secondaryContainer = Wash,
    onSecondaryContainer = Ink,
    background = Paper, // Neutral-50
    onBackground = Ink, // Neutral-900
    surface = Card, // white cards, 1px Hairline borders, shadow-xs
    onSurface = Ink,
    surfaceVariant = Wash,
    onSurfaceVariant = InkSoft,
    outline = Hairline,
    outlineVariant = Hairline,
    error = Error600,
    onError = Color.White,
    errorContainer = Error100,
    onErrorContainer = Error700,
)

private val FamilyDarkScheme = darkColorScheme(
    primary = Brand600,
    onPrimary = Color.White,
    primaryContainer = Neutral800,
    onPrimaryContainer = GlowSoft,
    secondary = Neutral300,
    onSecondary = Neutral900,
    secondaryContainer = Neutral800,
    onSecondaryContainer = Neutral100,
    background = SplashCanvasDeep,
    onBackground = Neutral100,
    surface = Neutral900,
    onSurface = Neutral50,
    surfaceVariant = Neutral800,
    onSurfaceVariant = Neutral300,
    outline = Neutral700,
    outlineVariant = Neutral700,
    error = Error600,
    onError = Color.White,
    errorContainer = Error700,
    onErrorContainer = Color.White,
)

private val FamilyShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp), // controls
    small = RoundedCornerShape(12.dp), // dense cards
    medium = RoundedCornerShape(20.dp),
    large = RoundedCornerShape(28.dp), // the counter's deep radius
    extraLarge = RoundedCornerShape(32.dp), // sections
)

/**
 * v2: white-on-neutral light scheme with terracotta controls; a true dark
 * scheme deepens the dark-glass surfaces to #0D0D0D. Follows the system.
 */
@Composable
fun FamilyTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    MaterialTheme(
        colorScheme = if (dark) FamilyDarkScheme else FamilyLightScheme,
        typography = FamilyTypography,
        shapes = FamilyShapes,
        content = content,
    )
}

/** The dark-glass card surface for the current theme (#262626 / #0D0D0D). */
@Composable
fun darkGlassSurface(): Color = if (isSystemInDarkTheme()) DarkGlassDeep else DarkGlass
