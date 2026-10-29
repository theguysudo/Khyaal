package com.khayaal.family.ui.theme

/**
 * The tier ladder exactly as the web dashboard names and colors it
 * (apps/web/lib/api.ts TIER_META). Kept as data so a unit test can pin the
 * copy parity — the family app and the dashboard must never disagree about
 * what "Check-in asked" means.
 */
object TierMeta {

    data class Tier(
        val tier: Int,
        val label: String,
        /** Hex strings straight from the web, for test parity. */
        val colorHex: String,
        val softHex: String,
        val textHex: String,
    )

    val ALL: Map<Int, Tier> = mapOf(
        0 to Tier(0, "All well", colorHex = "#4c7a4f", softHex = "#e6efe2", textHex = "#33512f"),
        1 to Tier(1, "Nudge sent", colorHex = "#c98a2b", softHex = "#f7ecd7", textHex = "#7a5416"),
        2 to Tier(2, "Check-in asked", colorHex = "#c4622f", softHex = "#f8e3d5", textHex = "#7c3c17"),
        3 to Tier(3, "Needs attention", colorHex = "#b23a2f", softHex = "#f6dcd8", textHex = "#77231c"),
    )

    fun forTier(tier: Int): Tier = ALL[tier.coerceIn(0, 3)] ?: ALL.getValue(0)
}
