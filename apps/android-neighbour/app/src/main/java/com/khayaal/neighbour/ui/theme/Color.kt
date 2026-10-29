package com.khayaal.neighbour.ui.theme

import androidx.compose.ui.graphics.Color

/*
 * Khayaal Neighbour palette — the v2 production direction
 * (docs/DESIGN_SYSTEM.md, "v2 — production direction"): Untitled UI's neutral
 * structure × the Counter's terracotta signature.
 *
 * The historical names (Paper, Ink, Accent, SosRed…) are kept so the screens
 * that predate v2 keep compiling; they now carry the v2 values.
 */

// -- Untitled UI neutrals ------------------------------------------------------
val Neutral50 = Color(0xFFFAFAFA)
val Neutral100 = Color(0xFFF5F5F5)
val Neutral200 = Color(0xFFE5E5E5)
val Neutral300 = Color(0xFFD4D4D4)
val Neutral500 = Color(0xFF737373)
val Neutral600 = Color(0xFF525252)
val Neutral700 = Color(0xFF404040)
val Neutral800 = Color(0xFF262626)
val Neutral900 = Color(0xFF171717)

// -- The Khayaal terracotta ramp (replaces Untitled UI's purple) ----------------
val Brand50 = Color(0xFFFFFAEB) // icon tiles
val Brand100 = Color(0xFFFEF0C7)
val Brand600 = Color(0xFFDC6803) // filled controls
val Brand700 = Color(0xFFB54708) // pressed / icon strokes

// The Counter's radial glow, rising through the dark-glass cards.
val GlowHot = Color(0xFFFF6B21)
val GlowMid = Color(0xFFF27F24)
val GlowSoft = Color(0xFFFFDCA6)

// Status — the Untitled UI green/error ramps the v2 spec pins.
val Success50 = Color(0xFFECFDF3)
val Success100 = Color(0xFFD1FADF)
val Success600 = Color(0xFF039855)
val Success700 = Color(0xFF027A48)
val Error100 = Color(0xFFFEE4E2)
val Error600 = Color(0xFFD92D20)
val Error700 = Color(0xFFB42318)

// THE SIGNATURE — dark-glass counter surfaces. Light mode wears #262626;
// true dark mode deepens to #0D0D0D (see Theme.kt).
val DarkGlass = Neutral800
val DarkGlassDeep = Color(0xFF0D0D0D)

// The splash canvas — near-black brown, the glow rising out of it.
val SplashCanvas = Color(0xFF1A120C)
val SplashCanvasDeep = Color(0xFF0D0A07)

// -- Legacy names, remapped to v2 values ---------------------------------------
val Paper = Neutral50 // app canvas
val Card = Color(0xFFFFFFFF)
val Wash = Neutral100 // quiet chip / field surface
val Ink = Neutral900
val InkSoft = Neutral500
val Hairline = Neutral200 // 1px card borders
val Accent = Brand600 // filled controls are terracotta now
val Sage = Success600 // "All well"

// Kept for any surviving copy-parity references; the v2 spec replaces the
// warm tier tones on controls with the terracotta/error ramps above.
val Tier0 = Success600
val Tier1 = Color(0xFFDC6803)
val Tier2 = Color(0xFFDC6803)
val Tier3 = Error600

val SosRed = Error600
val SosRedDeep = Error700
