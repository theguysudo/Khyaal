package com.khayaal.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.khayaal.app.data.datastore.PairingInfo
import com.khayaal.app.ui.assistant.AssistantScreen
import com.khayaal.app.ui.home.HomeScreen
import com.khayaal.app.ui.pairing.PairingScreen
import com.khayaal.app.ui.permissions.PermissionsScreen
import com.khayaal.app.ui.reminders.RemindersScreen
import com.khayaal.app.ui.splash.KhayaalSplash
import com.khayaal.app.ui.talkback.TalkbackConsentOverlay
import com.khayaal.app.ui.talkback.TalkbackScreen
import com.khayaal.app.ui.theme.KhayaalTheme
import com.khayaal.app.ui.theme.Paper
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.map

/**
 * Five routes, decided by pairing state, not by menus: the splash holds the
 * stage while DataStore wakes, then an unpaired phone sees the 6-digit
 * pairing flow, a freshly paired one gets the one-time permissions step, and
 * a paired one lives on the daily view. Unpairing is reactive — the moment
 * DataStore empties, the flow walks the UI back to pairing.
 */
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            KhayaalTheme {
                KhayaalRoot()
            }
        }
    }
}

private object Routes {
    const val PAIRING = "pairing"
    const val PERMISSIONS = "permissions"
    const val HOME = "home"
    const val ASSISTANT = "assistant"
    const val REMINDERS = "reminders"
    const val TALKBACK = "talkback"
}

private sealed interface PairingUi {
    data object Loading : PairingUi
    data object Unpaired : PairingUi
    data class Paired(val info: PairingInfo) : PairingUi
}

/** The decelerate curve every screen transition rides on. */
private val NavEase = CubicBezierEasing(0.1f, 0.8f, 0.2f, 1f)

/** How long the brand moment lasts at minimum, even on a warm DataStore. */
private const val MIN_SPLASH_MS = 1400L

@Composable
private fun KhayaalRoot() {
    val context = androidx.compose.ui.platform.LocalContext.current
    val container = (context.applicationContext as KhayaalApp).container
    val navController = rememberNavController()

    val pairingUi by remember(container) {
        container.pairingStore.pairing.map { info ->
            if (info == null) PairingUi.Unpaired else PairingUi.Paired(info)
        }
    }.collectAsStateWithLifecycle(initialValue = PairingUi.Loading)

    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route

    var minSplashElapsed by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        delay(MIN_SPLASH_MS)
        minSplashElapsed = true
    }

    LaunchedEffect(pairingUi) {
        when (val state = pairingUi) {
            PairingUi.Loading -> Unit
            PairingUi.Unpaired -> if (currentRoute != Routes.PAIRING) {
                navController.navigate(Routes.PAIRING) { popUpTo(0) { inclusive = true } }
            }
            is PairingUi.Paired -> if (currentRoute == null || currentRoute == Routes.PAIRING) {
                navController.navigate(Routes.HOME) { popUpTo(0) { inclusive = true } }
            }
        }
    }

    // The talkback poll runs for as long as the phone is paired — an incoming
    // request must reach her even if she is on another screen.
    LaunchedEffect(pairingUi is PairingUi.Paired) {
        if (pairingUi is PairingUi.Paired) {
            container.talkbackManager.start()
        } else {
            container.talkbackManager.stop()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Paper),
    ) {
        NavHost(
            navController,
            startDestination = Routes.PAIRING,
            enterTransition = {
                slideInHorizontally(animationSpec = tween(340, easing = NavEase)) { it / 5 } +
                    fadeIn(tween(300, easing = NavEase))
            },
            exitTransition = { fadeOut(tween(180)) },
            popEnterTransition = { fadeIn(tween(300, easing = NavEase)) },
            popExitTransition = {
                slideOutHorizontally(animationSpec = tween(340, easing = NavEase)) { it / 5 } +
                    fadeOut(tween(200))
            },
        ) {
            composable(Routes.PAIRING) {
                PairingScreen(
                    onPaired = {
                        navController.navigate(Routes.PERMISSIONS) {
                            popUpTo(Routes.PAIRING) { inclusive = true }
                        }
                    },
                )
            }
            composable(Routes.PERMISSIONS) {
                PermissionsScreen(
                    onFinish = {
                        navController.navigate(Routes.HOME) { popUpTo(0) { inclusive = true } }
                    },
                )
            }
            composable(Routes.HOME) {
                HomeScreen(
                    onAskKhayaal = { navController.navigate(Routes.ASSISTANT) },
                    onReminders = { navController.navigate(Routes.REMINDERS) },
                    onTalkback = { navController.navigate(Routes.TALKBACK) },
                )
            }
            composable(Routes.ASSISTANT) {
                AssistantScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.REMINDERS) {
                val container2 = (context.applicationContext as KhayaalApp).container
                val commands by container2.pairingStore.commandHistoryFlow
                    .collectAsStateWithLifecycle(initialValue = emptyList())
                RemindersScreen(
                    commands = commands,
                    onBack = { navController.popBackStack() },
                )
            }
            composable(Routes.TALKBACK) {
                TalkbackScreen(
                    manager = container.talkbackManager,
                    onBack = { navController.popBackStack() },
                )
            }
        }

        // The splash sits above everything until the brand moment has played
        // and DataStore has decided the first destination, then fades away.
        KhayaalSplash(visible = !minSplashElapsed || pairingUi == PairingUi.Loading)
    }

    // The consent popup sits above everything: when the family asks to talk,
    // it must reach her no matter which screen she is on.
    val talkbackUi by container.talkbackManager.ui.collectAsStateWithLifecycle()
    if (talkbackUi.incomingPending) {
        TalkbackConsentOverlay(
            requesterName = talkbackUi.session?.requesterName.orEmpty(),
            onAllow = { container.talkbackManager.answer(allow = true) },
            onDecline = { container.talkbackManager.answer(allow = false) },
        )
    }
}
