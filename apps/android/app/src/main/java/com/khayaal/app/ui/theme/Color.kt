package com.khayaal.app.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * Khayaal palette — the dark-navy brand direction.
 *
 * The tokens keep their historical names but are semantic now, not literal:
 * "Paper" is the canvas the app is printed on (near-black navy, the same
 * colour as the splash), "Ink" is what is written on it (warm off-white),
 * and the accents come straight from the brand mark's glow — a blue that
 * cools into cyan. Tier colours are lifted a little brighter than their
 * light-theme ancestors so they keep their meaning on the dark canvas.
 */
val Paper = Color(0xFF050514) // app canvas — identical to the splash background
val Cream = Color(0xFF0E0E26) // resting card surface
val Mist = Color(0xFF191938) // elevated surface: chips, pressed states, fields
val Ink = Color(0xFFF1F0FA) // primary text — warm off-white
val Dusk = Color(0xFF8B8BD4) // quiet secondary accent
val Clay = Color(0xFF5B8DFF) // primary action — the logo's glow blue
val ClayDeep = Color(0xFF5EE2EC) // accent text — the logo's glow cyan
val Sage = Color(0xFF34A76A) // success and calm confirmations

/** The app-name label on splash and headers — cyan glow, slightly deep. */
val Glow = Color(0xFF5EE2EC)

/** A hairline that separates cards from the canvas without shouting. */
val CardBorder = Color(0x1FFFFFFF)

/** Tier colors: 0 all well, 1 nudge sent, 2 check-in asked, 3 needs attention. */
val Tier0 = Color(0xFF58A05C)
val Tier1 = Color(0xFFD9A23F)
val Tier2 = Color(0xFFD97545)
val Tier3 = Color(0xFFE25B4E)

fun tierColor(tier: Int): Color = when (tier) {
    1 -> Tier1
    2 -> Tier2
    3 -> Tier3
    else -> Tier0
}
