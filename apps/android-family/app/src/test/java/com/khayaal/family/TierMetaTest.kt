package com.khayaal.family

import com.khayaal.family.ui.theme.TierMeta
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Copy parity with the web dashboard: the tier names and colors here are the
 * web's TIER_META (apps/web/lib/api.ts), pinned so the family app and the
 * dashboard can never drift apart.
 */
class TierMetaTest {

    @Test
    fun `tier labels match the web dashboard copy`() {
        assertEquals("All well", TierMeta.forTier(0).label)
        assertEquals("Nudge sent", TierMeta.forTier(1).label)
        assertEquals("Check-in asked", TierMeta.forTier(2).label)
        assertEquals("Needs attention", TierMeta.forTier(3).label)
    }

    @Test
    fun `tier colors match the web dashboard hexes`() {
        assertEquals("#4c7a4f", TierMeta.forTier(0).colorHex)
        assertEquals("#c98a2b", TierMeta.forTier(1).colorHex)
        assertEquals("#c4622f", TierMeta.forTier(2).colorHex)
        assertEquals("#b23a2f", TierMeta.forTier(3).colorHex)
    }

    @Test
    fun `tier soft backgrounds match the web dashboard hexes`() {
        assertEquals("#e6efe2", TierMeta.forTier(0).softHex)
        assertEquals("#f7ecd7", TierMeta.forTier(1).softHex)
        assertEquals("#f8e3d5", TierMeta.forTier(2).softHex)
        assertEquals("#f6dcd8", TierMeta.forTier(3).softHex)
    }

    @Test
    fun `an out-of-range tier clamps instead of crashing`() {
        assertEquals("All well", TierMeta.forTier(-1).label)
        assertEquals("Needs attention", TierMeta.forTier(9).label)
    }
}
