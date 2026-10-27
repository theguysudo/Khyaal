package com.khayaal.app.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * Khayaal palette — must match apps/web/tailwind.config.ts exactly.
 * Warm paper, soft ink, terracotta and sage. Nothing neon, nothing urgent
 * except the tier colors, and even those are muted.
 */
val Paper = Color(0xFFFAF6EF)
val Cream = Color(0xFFF3ECDF)
val Mist = Color(0xFFEFE3D3)
val Ink = Color(0xFF2A241D)
val Dusk = Color(0xFF3D3352)
val Clay = Color(0xFFB95C38)
val ClayDeep = Color(0xFF9C4A2B)
val Sage = Color(0xFF7D8C6F)

/** rgba(42,36,29,0.10) — the card hairline on paper. */
val CardBorder = Color(0x1A2A241D)

/** Tier colors: 0 all well, 1 nudge sent, 2 check-in asked, 3 needs attention. */
val Tier0 = Color(0xFF4C7A4F)
val Tier1 = Color(0xFFC98A2B)
val Tier2 = Color(0xFFC4622F)
val Tier3 = Color(0xFFB23A2F)

fun tierColor(tier: Int): Color = when (tier) {
    1 -> Tier1
    2 -> Tier2
    3 -> Tier3
    else -> Tier0
}
