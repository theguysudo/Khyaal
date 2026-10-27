package com.khayaal.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.khayaal.app.data.datastore.PairingInfo
import com.khayaal.app.ui.home.HomeScreen
import com.khayaal.app.ui.pairing.PairingScreen
import com.khayaal.app.ui.theme.KhayaalTheme
import com.khayaal.app.ui.theme.Paper
import kotlinx.coroutines.flow.map

/**
 * Two routes, decided by pairing state, not by menus: an unpaired phone sees
 * only the 6-digit pairing flow; a paired one lives on the near-empty daily
 * view. Unpairing is reactive — the moment DataStore empties, the flow
 * walks the UI back to pairing.
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
    const val HOME = "home"
}

private sealed interface PairingUi {
    data object Loading : PairingUi
    data object Unpaired : PairingUi
    data class Paired(val info: PairingInfo) : PairingUi
}

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

    LaunchedEffect(pairingUi) {
        when (val state = pairingUi) {
            PairingUi.Loading -> Unit
            PairingUi.Unpaired -> if (currentRoute != Routes.PAIRING) {
                navController.navigate(Routes.PAIRING) { popUpTo(0) { inclusive = true } }
            }
            is PairingUi.Paired -> if (currentRoute != Routes.HOME) {
                navController.navigate(Routes.HOME) { popUpTo(0) { inclusive = true } }
            }
        }
    }

    if (pairingUi == PairingUi.Loading) {
        // One quiet paper frame while DataStore wakes up.
        Box(Modifier.fillMaxSize().background(Paper))
        return
    }

    NavHost(navController, startDestination = Routes.PAIRING) {
        composable(Routes.PAIRING) {
            PairingScreen(
                onPaired = {
                    navController.navigate(Routes.HOME) { popUpTo(Routes.PAIRING) { inclusive = true } }
                },
            )
        }
        composable(Routes.HOME) {
            HomeScreen()
        }
    }
}
