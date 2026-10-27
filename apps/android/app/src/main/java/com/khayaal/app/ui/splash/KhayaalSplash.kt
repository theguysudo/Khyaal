package com.khayaal.app.ui.splash

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.EaseOutCubic
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.khayaal.app.R
import com.khayaal.app.ui.theme.ClayDeep
import com.khayaal.app.ui.theme.Ink
import com.khayaal.app.ui.theme.Paper
import kotlinx.coroutines.delay
import kotlin.math.roundToInt

/**
 * The Khayaal splash — one quiet brand moment before the app opens.
 *
 * The mark rises into place: it fades and scales in over about 700 ms on the
 * night-navy canvas, a soft glow breathing behind it, the wordmark settling
 * underneath. When the app behind it is ready the whole layer fades away, so
 * the hand-off into the pairing or daily view is fluid, never a hard cut.
 *
 * The system splash (Android 12+) paints the same navy first, so there is no
 * white frame anywhere in the cold start.
 */
@Composable
fun KhayaalSplash(visible: Boolean, modifier: Modifier = Modifier) {
    AnimatedVisibility(
        visible = visible,
        modifier = modifier,
        enter = androidx.compose.animation.EnterTransition.None,
        exit = fadeOut(animationSpec = tween(durationMillis = 460)),
    ) {
        SplashContent()
    }
}

@Composable
private fun SplashContent() {
    // The canvas is the same colour the window and system splash already
    // painted — this layer only ever continues them.
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Paper),
        contentAlignment = Alignment.Center,
    ) {
        // A breathing glow behind the mark.
        val glowTransition = rememberInfiniteTransition(label = "splash-glow")
        val glowAlpha by glowTransition.animateFloat(
            initialValue = 0.10f,
            targetValue = 0.20f,
            animationSpec = infiniteRepeatable(
                animation = tween(durationMillis = 2200),
                repeatMode = RepeatMode.Reverse,
            ),
            label = "splash-glow-alpha",
        )
        Canvas(modifier = Modifier.size(360.dp)) {
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(
                        Color(0xFF5B8DFF).copy(alpha = glowAlpha),
                        Color.Transparent,
                    ),
                    center = Offset(size.width / 2f, size.height / 2f),
                    radius = size.width / 2f,
                ),
            )
        }

        val appeared = remember { mutableStateOf(false) }
        LaunchedEffect(Unit) { appeared.value = true }

        val logoAlpha by animateFloatAsState(
            targetValue = if (appeared.value) 1f else 0f,
            animationSpec = tween(durationMillis = 700, easing = EaseOutCubic),
            label = "splash-logo-alpha",
        )
        val logoScale by animateFloatAsState(
            targetValue = if (appeared.value) 1f else 0.74f,
            animationSpec = spring(dampingRatio = 0.72f, stiffness = 170f),
            label = "splash-logo-scale",
        )
        val wordAlpha by animateFloatAsState(
            targetValue = if (appeared.value) 1f else 0f,
            animationSpec = tween(durationMillis = 560, delayMillis = 380, easing = EaseOutCubic),
            label = "splash-word-alpha",
        )
        val wordOffset by animateFloatAsState(
            targetValue = if (appeared.value) 0f else 14f,
            animationSpec = tween(durationMillis = 560, delayMillis = 380, easing = EaseOutCubic),
            label = "splash-word-offset",
        )

        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Image(
                painter = painterResource(R.drawable.brand_logo),
                contentDescription = null,
                modifier = Modifier
                    .size(148.dp)
                    .graphicsLayer {
                        scaleX = logoScale
                        scaleY = logoScale
                        this.alpha = logoAlpha
                    }
                    .clip(RoundedCornerShape(34.dp)),
            )
            Spacer(Modifier.height(22.dp))
            Text(
                text = "Khayaal",
                style = MaterialTheme.typography.displaySmall,
                color = Ink,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .alpha(wordAlpha)
                    .offset { IntOffset(0, wordOffset.roundToInt()) },
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = "watching over her — quietly",
                style = MaterialTheme.typography.bodyMedium,
                color = ClayDeep.copy(alpha = 0.85f),
                modifier = Modifier
                    .alpha(wordAlpha)
                    .padding(horizontal = 40.dp),
            )
        }
    }
}
