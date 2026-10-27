package com.khayaal.app.ui.home

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember

/**
 * The motion helpers for the daily view.
 *
 * Everything here is slow and soft on purpose: cards arrive one after
 * another, nothing blinks, nothing strobes, and no animation is ever the only
 * way to understand what happened. A senior-friendly interface may be
 * unhurried, but it must never be confusing.
 */
@Composable
fun StaggeredIn(
    index: Int,
    modifier: androidx.compose.ui.Modifier = androidx.compose.ui.Modifier,
    content: @Composable () -> Unit,
) {
    // A short, fixed delay per card — long enough to read as a sequence,
    // short enough that nobody waits.
    val state = remember { MutableTransitionState(false) }
    LaunchedEffect(Unit) { state.targetState = true }
    AnimatedVisibility(
        visibleState = state,
        modifier = modifier,
        enter = fadeIn(animationSpec = tween(durationMillis = 260, delayMillis = index * 70)) +
            slideInVertically(
                animationSpec = tween(durationMillis = 320, delayMillis = index * 70),
                initialOffsetY = { it / 6 },
            ),
    ) {
        content()
    }
}
