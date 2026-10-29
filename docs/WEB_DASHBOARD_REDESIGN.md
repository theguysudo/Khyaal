# Web dashboard redesign — household route

Date: 2026-10-29. Scope: presentation-layer facelift only. No API changes, no
feature removals, no changes outside the household route + dashboard
components + brand token files.

## Sources (pulled via Figma MCP)

| Node | What was extracted |
| --- | --- |
| `MpYb4JxkTmuViu8NiLzmb6` / `1686:419019` (Dashboards) | Table anatomy: 72px rows, 44px Neutral/50 header bars with Neutral/200 bottom borders; white cards, 1px Neutral/200 borders, shadow-xs/sm; badge pills (2px 8px, 16px radius, Green/50 + Green/700); Primary (Brand/600) and Secondary-gray (white + Neutral/300 + shadow-xs) buttons at 8px radius, Text sm/Semibold; inputs 10px 14px with Neutral/300 border; breadcrumbs; the full Inter Display/Text type scale. |
| `1023:36350` (Colors) | Full Neutral + Tailwind ramps; swatch/card grammar. |
| `18:1951` (Typography) | Inter scale: Display 2xl 72/90 … xs 24/32 (−2% tracking on Display), Text xl 20/30 → xs 12/18, weights 400/500/600. |
| `1030:33573` (Effect styles) | shadow-xs `0 1px 2px rgba(0,0,0,.05)` through shadow-3xl; background blur steps. |
| `1051:0` (Spacing/radius) | 4px soft grid, 8px button/card radius, 16px badge radius. |
| `tNwILFNaBEw7UP86o6slKB` / `1:2740` (Counter) | Dark-glass plate #262626, deep radius; outer glow `0 -80px 187px -61px rgba(255,255,255,.35)` + `0 184px 176px -151px rgba(255,107,33,.72)`; inset white highlights; orange radial glow `rgba(255,47,0) → rgba(242,127,36) → rgba(255,220,166)`; digits Inter SemiBold white. (Shadow values scaled ~0.24 for web in `Odometer.tsx`.) |
| `khayaal-untitled-v3.html` (approved mobile reference) | Header anatomy (logomark chip + “Khayaal / Overview” crumb + tier badge), counter geometry (28px radius hero), odometer implementation (per-digit clipped column, 0–9 stack, `translateY(-Nem)`, `1.1s cubic-bezier(.22,1.4,.36,1)`), ladder progress bar (green → amber → red), spring press `scale(.955) cubic-bezier(.34,1.56,.64,1)`. |

## Token layer

- `apps/web/tailwind.config.ts` — new ramps: `n` (Neutral 25–950), `brand`
  (terracotta 25–900: #DC6803/#B54708 + glow #FF6B21/#F27F24/#FFDCA6), `err`
  (#D92D20/#B42318…), `ok` (#039855/#027A48…), plus Untitled shadows as
  `shadow-xs … shadow-unt-2xl`. Legacy aliases kept as names but re-pointed:
  `paper`→#FAFAFA, `ink`→#171717, `clay`→#DC6803, `claydeep`→#B54708.
  `sage/dusk/mist/cream` untouched (used by landing scenes).
- `apps/web/app/globals.css` — `--paper: #fafafa`, `--ink: #171717`,
  selection → terracotta/white.
- `apps/web/app/household/layout.tsx` (new) — loads Inter 400/500/600 via
  `next/font/google` as `--font-inter`; `.kh-root` re-points `--font-heading`
  at it so `font-heading` resolves to Inter inside the household only (the
  landing keeps Fraunces/its own faces).

## New components

- `components/dashboard/kh.ts` — shared FOCUS rings, BTN_PRIMARY /
  BTN_SECONDARY / BTN_DANGER, INPUT, BADGE, and `TIER_UI` (dashboard-side
  tier colours; `lib/api.ts` is untouched — TIER_META still supplies the
  tier tint + labels).
- `components/dashboard/Odometer.tsx` — the signature: `Odometer` (rolling
  digits) + `CounterCard` (dark glass #262626, 28px radius, breathing orange
  glow, glass shadows scaled from the Figma source). Digits are aria-hidden
  stacks with an `aria-live` plain-text mirror.

## Restyled files (one-liners)

- `app/household/[id]/page.tsx` — v3 header (✳︎ chip, breadcrumb, tier badge,
  anchor nav, Reach her/Settings), error-ramp tier-3 banner (same grid-row
  collapse, masked line reveals, inert), StatusCard → CounterCard with live
  odometer, and every inline card moved onto the new surfaces/buttons/charts.
- `app/household/[id]/settings/page.tsx` — same language: white sections,
  INPUT fields, terracotta save, logomark breadcrumb.
- `app/household/motion.css` — Inter scoping vars; spring press
  (.96, overshoot); `kh-counter-glow`, `kh-odo` geometry, `kh-tier-ease`;
  reduced-motion escapes for all of them.
- `components/dashboard/bento.tsx` — BentoCard → white, `rounded-xl`,
  1px `n-200`, `shadow-xs`; CardTitle → 13.5px/600 n-900 + 10.5px n-400 note.
- `components/dashboard/TalkbackCard.tsx` — shared buttons/inputs; hold-to-talk
  opens mic in err-600; consent popup white/rounded-xl.
- `components/dashboard/NightWatchCard.tsx` — night panel → dark glass with
  rising Khayaal glow (starfield + moon kept); mixer rows on n-50 with
  terracotta play state.
- `components/dashboard/MovementCard.tsx`, `SmartwatchPanel.tsx` — Stat boxes
  → n-50/n-200 rounded-lg, Inter SemiBold numerals, terracotta accents.
- `components/dashboard/SosOverlay.tsx` — error ramp (#B42318 panel on
  err-900 overlay, white buttons); siren arm/stand-down logic untouched.
- `components/dashboard/BlueprintMap.tsx`, `CsiScope.tsx` — chart constants
  moved to the new ramps (INK #171717, CLAY #DC6803, SAGE #039855,
  RED #D92D20), surfaces to n-50/n-200, buttons via kh.ts. IR channel keeps
  its distinct #8a5a8f.
- Retired from the route: the cinematic `DashboardHero` band (file kept,
  unused) — replaced by the v3 header per the approved reference.

## Verification

- `npm run build` (repo root): ✓ Compiled successfully, 19/19 pages, type
  check inside. `/household/[id]` 28.1 kB.
- Visual pass on a private dev server (port 3101, killed afterwards; :3100
  untouched): desktop + 390px mobile; tier-0 normal, tier-3 banner (via an
  in-browser fetch patch of the state poll — no code changes) and the SOS
  overlay; odometer rolled 0→96 live; settings page; landing page unaffected.

## Deliberately unchanged

- `lib/api.ts` (TIER_META tints still feed the page wash behind a Neutral
  veil) and all API routes/auth.
- Dark mode: not attempted — light-only this pass.
- `DashboardHero.tsx`/`hero.css` files left in place, just unused.
- IR-channel purple, emoji glyphs, and all copy kept as-is.
