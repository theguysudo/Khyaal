package com.khayaal.neighbour

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.khayaal.neighbour.ui.home.HomeScreen
import com.khayaal.neighbour.ui.pairing.PairingScreen
import com.khayaal.neighbour.ui.splash.KhayaalSplash
import com.khayaal.neighbour.ui.theme.NeighbourTheme
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.map

/**
 * Two screens, decided by pairing state: an unpaired phone sees the 6-digit
 * flow, a paired one lives on the status. Unpairing is reactive — the moment
 * DataStore empties, the UI walks back to pairing. Two routes need no
 * navigation library; a sealed state is the whole router.
 *
 * The v2 splash rides above both: the ring draws, the handoff line lands,
 * then a paired phone gets the "enter" button; an unpaired one walks to the
 * pairing screen instead (spec: no stored pairing → pairing).
 */
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            NeighbourTheme {
                NeighbourRoot()
            }
        }
    }
}

private sealed interface PairingUi {
    data object Loading : PairingUi
    data object Unpaired : PairingUi
    data class Paired(val info: com.khayaal.neighbour.data.datastore.PairingInfo) : PairingUi
}

/** Minimum splash time even on a warm DataStore — the ring deserves its arc. */
private const val MIN_SPLASH_MS = 2_800L

@Composable
private fun NeighbourRoot() {
    val context = LocalContext.current
    val container = (context.applicationContext as NeighbourApp).container

    val pairingUi by remember(container.store) {
        container.store.pairing.map { info ->
            if (info == null) PairingUi.Unpaired else PairingUi.Paired(info)
        }
    }.collectAsStateWithLifecycle(initialValue = PairingUi.Loading)

    // The splash holds the stage until its arc has played AND DataStore spoke.
    var minSplashElapsed by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        delay(MIN_SPLASH_MS)
        minSplashElapsed = true
    }
    var splashDone by remember { mutableStateOf(false) }
    val splashVisible = !splashDone &&
        (!minSplashElapsed || pairingUi == PairingUi.Loading)

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        when (val state = pairingUi) {
            PairingUi.Loading -> Unit // one quiet frame while DataStore wakes
            PairingUi.Unpaired -> PairingScreen(onPaired = { /* reactive — the flow flips */ })
            is PairingUi.Paired -> HomeScreen()
        }

        KhayaalSplash(
            visible = splashVisible,
            enterLabel = if (pairingUi is PairingUi.Paired) {
                "Check on the household"
            } else {
                null // no stored pairing → the pairing screen, no button
            },
            handoffLine = "home found — you're on the circle",
            onEnter = { splashDone = true },
        )
    }

    // Unpaired: when the splash has said its piece, walk to pairing quietly.
    LaunchedEffect(pairingUi, minSplashElapsed) {
        if (pairingUi == PairingUi.Unpaired && minSplashElapsed && !splashDone) {
            delay(600) // let the handoff line land
            splashDone = true
        }
    }
}
