# Khayaal Design System — Material 3 Expressive

The mobile apps share one design language: **Material 3 Expressive**, seeded with
Khayaal's warm terracotta. The color roles below were **generated with Google's
official `@material/material-color-utilities`** (HCT seed → tonal palettes →
roles) — the identical engine behind the Figma kit's Theme Builder — so these
values match what the Material 3 Design Kit encodes, without needing the kit file.

Seed: `#A14E2B` terracotta (default) · alternates `#4A6B4F` sage, `#6E4B8E` plum.
Regenerate: `/tmp/m3gen/gen.mjs` → `tokens.json` (pin `@material/material-color-utilities@0.2.7`).

## Color roles — terracotta seed

| Role | Light | Dark |
|---|---|---|
| primary / on-primary | `#9a4521` / `#ffffff` | `#ffb599` / `#5a1c00` |
| primary-container / on- | `#ffdbce` / `#370e00` | `#7b2f0b` / `#ffdbce` |
| secondary-container | `#ffdbce` | `#5d4035` |
| tertiary / tertiary-container | `#685e30` / `#f1e3a8` | `#d4c78e` / `#50471a` |
| error / error-container | `#ba1a1a` / `#ffdad6` | `#ffb4ab` / `#93000a` |
| surface / on-surface | `#fffbff` / `#201a18` | `#201a18` / `#ede0dc` |
| surface-container-low | `#fef1ed` | `#201a18` |
| surface-container | `#f8ebe7` | `#251e1c` |
| surface-container-high | `#f3e5e1` | `#2f2826` |
| on-surface-variant | `#53433e` | `#d8c2bb` |
| outline / outline-variant | `#85736d` / `#d8c2bb` | `#a08d86` / `#53433e` |

All values are verbatim from the generator output.

Sage and plum: same roles from `tokens.json` (the dashboard's palette switcher
uses exactly these).

## Shape scale (M3 + Expressive)

| Token | Radius | Used for |
|---|---|---|
| extra-small | 4 dp | tiny chips, snackbars |
| small | 8 dp | text fields |
| medium | 12 dp | cards (dense) |
| large | 16 dp | cards |
| extra-large | 28 dp | modals, the elder's big cards |
| **expressive-large** | 32–40 dp | hero shapes, the SOS takeover |
| full | stadium | buttons, the I'm-OK shape |
| **morph** | animated 24↔48 dp | press states — shapes squish *rounder* under pressure |

## Typography (M3 scale, one weight axis)

Display S 36/44 · Headline L 32/40 · M 28/36 · S 24/32 · Title L 22/28 ·
Body L 16/24 · M 14/20 · Label L 14/20. The elder's phone uses one step
larger everywhere (Display-M for the greeting) — aging eyes first.

## Motion (Expressive)

- **Springs, not tweens**, for anything a finger causes: `dampingRatio = 0.6–0.8`,
  `stiffness = 200–400` (Compose `spring()`). Press = scale 0.94 + corner
  radius +8 dp, release springs back with visible overshoot.
- **Emphasized decelerate** (`cubic-bezier(0.05, 0.7, 0.1, 1)`, 400–500 ms) for
  entering surfaces; **emphasized accelerate** for exits.
- Morphing containers (shape shifting between states) are the signature move —
  the I'm-OK button, the neighbour status blob, the score dial.
- Breathing idle states (3–6 s loops) keep the elder's screen alive without
  demanding attention. SOS strobes at ~4.5 Hz — the only fast loop in the app.

## Component guidance

- **Elder home**: greeting (Display) → morphing hero shape (last night's sleep)
  → I'm OK (full-width filled, `primary-container`, springs on press) → SOS
  (hold-to-arm 2 s, `error-container` → `error` when armed, concentric ring
  animation while ringing).
- **SOS takeover** (all apps): full-bleed `error` surface, kicker label
  (button/auto), 56 sp "SOS" breathing at 1.1 s, responder chip
  (`on-error` @ 14% bg), Stand-down filled `inverse`. Never a silent red page:
  the siren button is first-run prominent (browser audio needs a gesture; on
  Android the alarm stream rings without one).
- **Family dashboard**: score dial (animated sweep, emphasized decelerate),
  ladder rungs, activity tiles as `surface-container` rounded-24 cards.
- **Neighbour**: one status shape (morphs green↔red), respond FAB (full,
  `primary`), on-duty pill. One bit of truth, zero dashboard.

## Compose mapping

```kotlin
// KhayaalTheme.kt — seed-derived; matches docs/DESIGN_SYSTEM.md exactly.
private val Terracotta = Color(0xFFA14E2B)
val LightColors = lightColorScheme(
    primary = Color(0xFF9a4521), onPrimary = Color(0xFFffffff),
    primaryContainer = Color(0xFFffdbce), onPrimaryContainer = Color(0xFF370e00),
    secondaryContainer = Color(0xFFffdbce), onSecondaryContainer = Color(0xFF370e00),
    tertiary = Color(0xFF685e30), tertiaryContainer = Color(0xFFf1e3a8),
    error = Color(0xFFba1a1a), errorContainer = Color(0xFFffdad6),
    background = Color(0xFFfffbff), onBackground = Color(0xFF201a18),
    surface = Color(0xFFfffbff), onSurface = Color(0xFF201a18),
    surfaceVariant = Color(0xFFf5ded6), onSurfaceVariant = Color(0xFF53433e),
    outline = Color(0xFF85736d), outlineVariant = Color(0xFFd8c2bb),
)
val DarkColors = darkColorScheme(
    primary = Color(0xFFffb599), onPrimary = Color(0xFF5a1c00),
    primaryContainer = Color(0xFF7b2f0b), onPrimaryContainer = Color(0xFFffdbce),
    error = Color(0xFFffb4ab), errorContainer = Color(0xFF93000a),
    background = Color(0xFF201a18), onBackground = Color(0xFFede0dc),
    surface = Color(0xFF201a18), onSurface = Color(0xFFede0dc),
    onSurfaceVariant = Color(0xFFd8c2bb),
)
// Motion: spring(dampingRatio = 0.7f, stiffness = 300f) for press morphs.
```

(Dynamic Color stays available on Android 12+: `dynamicLightColorScheme(ctx)`
gives the same role set from the user's wallpaper — the layouts must only ever
reference roles, never literals, which these guidelines enforce.)

## v2 — the production direction: Untitled UI × the Counter (approved working direction)

The M3 token foundation above stays as the semantic layer, but the visible
system now fuses two Figma sources the user chose (both pulled via MCP):

1. **Untitled UI v2.0 free kit** (`MpYb4JxkTmuViu8NiLzmb6`) — the structural layer:
   - **Type**: Inter, weights 400/500/600. Display xl 60/72 (-0.02em) → Display sm
     30/38 → Text xl 20/30 → lg 18/28 → md 16/24 → sm 14/20.
   - **Neutrals**: 50 `#FAFAFA` · 100 `#F5F5F5` · 200 `#E5E5E5` · 300 `#D4D4D4` ·
     500 `#737373` · 600 `#525252` · 700 `#404040` · 800 `#262626` · 900 `#171717`.
   - **Surfaces**: white cards, 1px `#E5E5E5` borders, shadow-xs
     (`0 1px 2px rgba(0,0,0,.05)`), 8px controls, 12px dense cards, 32px sections.
   - Components observed: Button (Primary/Secondary-gray, lg), Input field,
     Badge, Modal actions, dark-mode variants throughout.
2. **The user's Counter frame** (`tNwILFNaBEw7UP86o6slKB` node `1:2740`) — the
   data signature: giant Inter Semi-Bold digits (letter-spacing -0.04em) rolling
   odometer-style, deep-radius dark glass (`#262626`, radius ~40dp in-app scale),
   orange radial glow (`#FF6B21` → `#F27F24` → `#FFDCA6`), built with Bounce.
   **Every number that matters rolls**: wellbeing score, steps, room readings.
3. **Brand**: Untitled UI's purple (`#7F56D9`) is replaced by the Khayaal
   terracotta ramp — brand-600 `#DC6803` for filled controls (Primary button:
   8px radius, 10×18 padding, white 16/24 Semibold), glow oranges for data
   moments. Error: `#D92D20`/`#B42318` (Untitled UI error ramp). Success: `#039855`.

Reference implementation: `.zcode` visualization
`khayaal-untitled-mobile.html` (three live screens, light/dark, rolling
odometers, spring press morphs). The Android apps must reproduce: dark-glass
counter cards with the glow, Inter weights 400/500/600, 8px controls with
spring press (scale .955 + radius 8→16), breathing idle states, SOS strobe as
the only fast loop.
