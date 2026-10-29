package com.khayaal.family.ui.components

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import kotlin.math.roundToInt

/*
 * THE SIGNATURE (docs/DESIGN_SYSTEM.md v2) — the rolling odometer.
 *
 * Every digit is a vertical 0–9 stack, one column per digit, translated by
 * −digit × slot with spring(dampingRatio 0.7, stiffness 300). The number
 * ROLLS to its next value exactly like a mechanical counter — 59 → 60 spins
 * the ones column through 9 while the tens column steps once. Giant Inter
 * SemiBold, −0.04em tracking, right-aligned so the digit widths never
 * re-flow the layout.
 */

/** One odometer column: a 0–9 stack behind a fixed slot window. */
@Composable
fun OdometerDigit(
    digit: Int,
    digitHeight: Dp,
    style: TextStyle,
    color: Color,
    modifier: Modifier = Modifier,
) {
    val density = LocalDensity.current
    val slotPx = with(density) { digitHeight.toPx() }

    // The column's translate, rolled with THE spring (0.7 / 300).
    var target by remember { mutableFloatStateOf(digit.toFloat()) }
    LaunchedEffect(digit) { target = digit.toFloat() }
    val offset by animateFloatAsState(
        targetValue = -target * slotPx,
        animationSpec = spring(dampingRatio = 0.7f, stiffness = 300f),
        label = "odometer-digit-$digit",
    )

    Box(
        modifier = modifier
            .width(digitHeight * 0.62f)
            .height(digitHeight)
            .clipToBounds(),
    ) {
        Column(
            modifier = Modifier.offset { IntOffset(0, offset.roundToInt()) },
        ) {
            for (i in 0..9) {
                Box(
                    modifier = Modifier.height(digitHeight),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = i.toString(),
                        style = style,
                        color = color,
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

/**
 * A whole number that rolls. Null shows an em-dash (the engine is still
 * learning). The digits are the Counter's: giant SemiBold, −0.04em tracking.
 */
@Composable
fun OdometerNumber(
    value: Int?,
    modifier: Modifier = Modifier,
    fontSize: Dp = 96.dp,
    color: Color = Color.White,
    placeholder: String = "—",
) {
    // Dp → sp once; the digit slots and the glyph sizes both come from it.
    val fontSizeSp = with(LocalDensity.current) { fontSize.toSp() }

    if (value == null) {
        Text(
            text = placeholder,
            fontSize = fontSizeSp * 0.9f,
            style = TextStyle(
                fontFamily = FontFamily.SansSerif,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = (-0.04).em,
            ),
            color = color,
            modifier = modifier,
        )
        return
    }

    val style = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = fontSizeSp,
        lineHeight = fontSizeSp,
        letterSpacing = (-0.04).em,
    )
    val digits = value.toString().map { it - '0' }

    Row(modifier = modifier, verticalAlignment = Alignment.Bottom) {
        digits.forEachIndexed { index, d ->
            OdometerDigit(
                digit = d,
                digitHeight = fontSize,
                style = style,
                color = color,
            )
        }
    }
}
