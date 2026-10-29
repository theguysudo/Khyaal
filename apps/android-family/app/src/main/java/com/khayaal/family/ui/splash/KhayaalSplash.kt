package com.khayaal.family.ui.splash

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.EaseOutCubic
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khayaal.family.ui.theme.Brand600
import com.khayaal.family.ui.theme.GlowHot
import com.khayaal.family.ui.theme.GlowMid
import com.khayaal.family.ui.theme.GlowSoft
import com.khayaal.family.ui.theme.SplashCanvas
import com.khayaal.family.R
import kotlinx.coroutines.delay
import kotlin.math.cos
import kotlin.math.sin

/*
 * THE v2 SPLASH (docs/DESIGN_SYSTEM.md, screen spec 1) — shared by all three
 * Khayaal apps; the household role only changes the words.
 *
 * Full-bleed near-black brown (#1A120C), the orange glow rising from the
 * bottom edge, the ✳︎ mark inside a ring whose arc draws in over ~2.4 s
 * (a 300° sweep — the ring keeps a 60° gap open), "Khayaal" 34sp SemiBold
 * white, the tagline at 66% white, three breathing dots. At ~2.6 s the
 * handoff line swaps and the primary button fades in — terracotta #DC6803,
 * white 16/24 Semibold, the v2 press morph (scale .955, radius 8→16 spring).
 * With no stored pairing there is no button: the caller walks to pairing.
 */

/** How long the ring takes to draw (spec: ~2.4 s). */
private const val ARC_DRAW_MS = 2_400

/** When the handoff line swaps and the button may appear (spec: ~2.6 s). */
private const val HANDOFF_MS = 2_600L

@Composable
fun KhayaalSplash(
    visible: Boolean,
    enterLabel: String?,
    handoffLine: String,
    onEnter: () -> Unit,
    modifier: Modifier = Modifier,
) {
    AnimatedVisibility(
        visible = visible,
        modifier = modifier,
        enter = androidx.compose.animation.EnterTransition.None,
        exit = fadeOut(animationSpec = tween(durationMillis = 460)),
    ) {
        SplashContent(
            enterLabel = enterLabel,
            handoffLine = handoffLine,
            onEnter = onEnter,
        )
    }
}

@Composable
private fun SplashContent(
    enterLabel: String?,
    handoffLine: String,
    onEnter: () -> Unit,
) {
    var elapsed by remember { mutableStateOf(0f) } // 0→1 once the intro has run
    LaunchedEffect(Unit) {
        delay(HANDOFF_MS)
        elapsed = 1f
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(SplashCanvas),
    ) {
        // The orange glow rising from the bottom edge.
        Canvas(modifier = Modifier.fillMaxSize()) {
            val radius = size.width * 1.1f
            drawRect(
                brush = Brush.radialGradient(
                    colors = listOf(
                        GlowHot.copy(alpha = 0.34f),
                        GlowMid.copy(alpha = 0.16f),
                        Color.Transparent,
                    ),
                    center = Offset(size.width / 2f, size.height * 1.08f),
                    radius = radius,
                ),
            )
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(modifier = Modifier.weight(0.9f))

            // The mark: a ring drawing itself around the ✳︎.
            MarkWithRing(elapsed = elapsed)

            Spacer(modifier = Modifier.height(36.dp))

            Text(
                text = "Khayaal",
                fontSize = 34.sp,
                lineHeight = 40.sp,
                fontWeight = FontWeight.SemiBold,
                fontFamily = FontFamily.SansSerif,
                letterSpacing = (-0.68).sp, // -0.02em at 34sp
                color = Color.White,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = "the quiet guardian for parents who live alone",
                fontSize = 13.5.sp,
                lineHeight = 20.sp,
                fontWeight = FontWeight.Normal,
                fontFamily = FontFamily.SansSerif,
                color = Color.White.copy(alpha = 0.66f),
                textAlign = TextAlign.Center,
            )

            Spacer(modifier = Modifier.height(28.dp))
            BreathingDots()
            Spacer(modifier = Modifier.weight(1.1f))

            // The handoff: "connecting…" until ~2.6 s, then the found line.
            val handoffAlpha by animateFloatAsState(
                targetValue = if (elapsed > 0f) 1f else 0.55f,
                animationSpec = tween(420, easing = EaseOutCubic),
                label = "splash-handoff-alpha",
            )
            Text(
                text = if (elapsed > 0f) handoffLine else "finding her home…",
                fontSize = 13.5.sp,
                lineHeight = 20.sp,
                color = Color.White.copy(alpha = 0.66f * handoffAlpha + 0.1f),
                textAlign = TextAlign.Center,
            )

            Spacer(modifier = Modifier.height(18.dp))

            // The primary button — only when there is a home to enter.
            val buttonAlpha by animateFloatAsState(
                targetValue = if (elapsed > 0f && enterLabel != null) 1f else 0f,
                animationSpec = tween(520, easing = EaseOutCubic),
                label = "splash-button-alpha",
            )
            if (enterLabel != null) {
                SplashEnterButton(
                    label = enterLabel,
                    alpha = buttonAlpha,
                    enabled = elapsed > 0f,
                    onClick = onEnter,
                )
            }
            Spacer(modifier = Modifier.height(40.dp))
        }
    }
}

/** The real Khayaal mark inside the drawing ring, with a soft drop-shadow glow. */
@Composable
private fun MarkWithRing(elapsed: Float) {
    val sweep by animateFloatAsState(
        targetValue = 300f * elapsed, // the ring keeps a 60° gap open
        animationSpec = tween(ARC_DRAW_MS, easing = EaseOutCubic),
        label = "splash-arc-sweep",
    )
    val glow = rememberInfiniteTransition(label = "mark-glow")
    val glowAlpha by glow.animateFloat(
        initialValue = 0.16f,
        targetValue = 0.30f,
        animationSpec = infiniteRepeatable(tween(3_000), RepeatMode.Reverse),
        label = "mark-glow-alpha",
    )

    Box(modifier = Modifier.size(148.dp), contentAlignment = Alignment.Center) {
        Canvas(modifier = Modifier.size(148.dp)) {
            val c = Offset(size.width / 2f, size.height / 2f)
            val ringRadius = size.minDimension * 0.42f

            // Glow drop-shadow behind the mark.
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(GlowHot.copy(alpha = glowAlpha), Color.Transparent),
                    center = c,
                    radius = size.minDimension * 0.55f,
                ),
                radius = size.minDimension * 0.55f,
                center = c,
            )
            // The ring track (the gap the arc closes is left visible).
            drawCircle(
                color = Color.White.copy(alpha = 0.12f),
                radius = ringRadius,
                center = c,
                style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round),
            )
            // The arc drawing in, starting from the top.
            if (sweep > 0.5f) {
                drawArc(
                    brush = Brush.sweepGradient(
                        0f to GlowSoft,
                        0.6f to GlowMid,
                        1f to GlowHot,
                        center = c,
                    ),
                    startAngle = -90f,
                    sweepAngle = sweep,
                    useCenter = false,
                    topLeft = Offset(c.x - ringRadius, c.y - ringRadius),
                    size = androidx.compose.ui.geometry.Size(ringRadius * 2, ringRadius * 2),
                    style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round),
                )
            }
        }
        // The actual brand mark — the same asset as the launcher.
        Image(
            painter = painterResource(R.drawable.brand_logo),
            contentDescription = null,
            modifier = Modifier
                .size(92.dp)
                .clip(RoundedCornerShape(24.dp)),
        )
    }
}

/** Three dots, breathing on a staggered ~3 s loop — idle, never hurried. */
@Composable
private fun BreathingDots() {
    val transition = rememberInfiniteTransition(label = "splash-dots")
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        repeat(3) { index ->
            val pulse by transition.animateFloat(
                initialValue = 0.25f,
                targetValue = 1f,
                animationSpec = infiniteRepeatable(
                    animation = tween(1_500, delayMillis = index * 260, easing = LinearEasing),
                    repeatMode = RepeatMode.Reverse,
                ),
                label = "splash-dot-$index",
            )
            Canvas(modifier = Modifier.size(7.dp)) {
                drawCircle(color = GlowSoft.copy(alpha = 0.25f + 0.6f * pulse))
            }
        }
    }
}

/** The v2 primary button: scale 0.955 + corner radius 8→16 on press. */
@Composable
private fun SplashEnterButton(
    label: String,
    alpha: Float,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.955f else 1f,
        animationSpec = spring(dampingRatio = 0.7f, stiffness = 300f),
        label = "splash-enter-scale",
    )
    val corner by animateFloatAsState(
        targetValue = if (pressed) 16f else 8f,
        animationSpec = spring(dampingRatio = 0.7f, stiffness = 300f),
        label = "splash-enter-corner",
    )

    Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        Button(
            onClick = onClick,
            enabled = enabled,
            interactionSource = interaction,
            modifier = Modifier
                .fillMaxWidth(0.82f)
                .height(56.dp)
                .alpha(alpha)
                .scale(scale),
            shape = RoundedCornerShape(corner.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = Brand600,
                contentColor = Color.White,
                disabledContainerColor = Brand600.copy(alpha = 0.55f),
                disabledContentColor = Color.White.copy(alpha = 0.9f),
            ),
        ) {
            Text(
                text = label,
                fontSize = 16.sp,
                lineHeight = 24.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}
