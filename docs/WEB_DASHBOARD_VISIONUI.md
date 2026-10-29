# Web Dashboard — Vision UI re-skin

The household dashboard (`/household/[id]`, its `/settings` page and every
`components/dashboard/**` surface) now speaks the **Vision UI dark-glass**
language while keeping Khayaal's identity: terracotta stays the brand colour
of every filled action, the wellbeing counter keeps its orange glow, and not
one feature, handler or API call changed.

Design source: Vision UI Dashboard Figma (`zxxQKywVTTCgmXdHQHQxdh`,
Dashboard Screen node `580:3777`). Values below were pulled from the file,
not eyeballed.

## The surface system

| Token | Value | Figma source |
| --- | --- | --- |
| Page fill | `#060B26` | frame fill, 580:3777 |
| Page gradient | `linear-gradient(169deg, #0F123B 7%, #090D2E 62%, #020515 100%)` | rect 580:3781 |
| Page depth | blurred colour blobs (pure CSS), standing in for the 136px-blurred backdrop image | rect 580:3784 |
| Card fill | `linear-gradient(175deg, rgba(6,11,40,.74) 0%, rgba(14,21,58,.71) 100%)` | frame 580:4143 |
| Card blur | `backdrop-filter: blur(60px)` | effect on 580:4143 |
| Card radius | 20px | 580:4143 |
| Card shadow | `0 3.5px 5.5px rgba(0,0,0,.02)` | 580:3793 |
| Card hairline | `linear-gradient(138deg, rgba(255,255,255,.34) → transparent)`, masked 1px ring at ~14% | sidebar stroke 580:4333 pattern |
| Input fill / stroke | `#0F1535` / `rgba(255,255,255,.15)` | search input 580:4242 |
| Separators + chart grid | `#2D2E5F` | Vision separator token |
| Secondary text / labels | `#A0AEC0` | Vision muted token |
| Type | Plus Jakarta Sans (Google Fonts family for Vision's "Plus Jakarta Display"), 400/500/600/700; 18px bold card titles, 28px bold big numbers | 580:3787 etc. |

The recipe lives in `apps/web/app/household/motion.css` (`.kh-glass`,
`.kh-gradring`, `.kh-gbtn`, `.kh-blobs`) and the colour tokens in
`apps/web/tailwind.config.ts` under `theme.extend.colors.vision.*`
(add-only — the landing routes share this config and keep their own ramps).

## Brand mapping

- **Khayaal terracotta (`brand-*`)** — filled actions only: Reach her, Send,
  Ask Amma to talk, Connect sensor, Save settings, the ✳︎ logomark chip, the
  playing-sound play buttons, and the wellbeing counter's own glow
  (`#FF6B21 → #FFDCA6`).
- **Vision accents (`vision-*`)** — data only: trend line + live-sensor teal
  `#4FD1C5`, rhythm/blueprint blue `#0075FF` and white, progress/scope
  purple `#4318FF` (selected network), success `#01B574`, alert red
  `#E31A1A`.
- **Error family** — tier-3 banner, SOS overlay and destructive hovers use
  the `err-*` ramp on dark error glass
  (`linear-gradient(175deg, rgba(96,17,22,.62), rgba(34,7,14,.72))`).

## Where things live

- `apps/web/app/household/[id]/page.tsx` — page field (gradient on `main`,
  fixed blob layer, tier wash that still cross-fades via `.kh-tier-ease`),
  header, tier-3 banner, and every inline card (reach-her, rhythm, ladder,
  explain, analysis, circle, push, events, sources + Wi-Fi panel, trend
  chart).
- `apps/web/app/household/[id]/settings/page.tsx` — glass sections on the
  same field.
- `apps/web/app/household/layout.tsx` — Plus Jakarta Sans (+ Inter kept as
  fallback) scoped to `.kh-root`; `color-scheme: dark` for native controls.
- `apps/web/app/household/motion.css` — type layer, glass recipe, gradient
  hairline, page blobs, card-entrance stagger, line reveals, press/lift,
  odometer + counter glow, reduced-motion fallbacks.
- `apps/web/components/dashboard/kh.ts` — buttons/inputs/badges/focus
  vocabulary and the dark `TIER_UI` pill map.
- `apps/web/components/dashboard/bento.tsx` — `BentoCard` = the glass card;
  `CardTitle` = 18px bold white + `#A0AEC0` note.
- `apps/web/components/dashboard/Odometer.tsx` — the counter card on the
  Vision recipe (20px, glass fill + hairline) with the orange glow kept.
- Charts: `CsiScope.tsx` (white waveform, teal motion, red fall, violet IR
  channel), `BlueprintMap.tsx` (dark plan `#0B1029`, teal live dots),
  `NightWatchCard.tsx` (night sky aligned to the recipe), `MovementCard.tsx`
  + `SmartwatchPanel.tsx` (`#1A1F37` stat tiles), `TalkbackCard.tsx`
  (terracotta hold-to-talk, glass consent modal), `SosOverlay.tsx` (dark
  error glass takeover).

## Honest scope notes

- The **CSI scope's "big number"** moved to the Vision 28px bold setting;
  the counter hero keeps its own 76/88px signature size.
- The **IR beam accent** was `#8a5a8f` (too dark for text on navy); it is
  lifted to violet `#A78BFA` (graphics) / `#C4B5FD` (text) so the
  near-field channel stays visually separate from the CSI verdict.
- The **trend chart's tier bands** keep their semantic positions with the
  Vision ramp (`#E31A1A / #DC6803 / #F79009 / #01B574`) at 5–6% opacity.
- `FOCUS_ON_DARK`/`FOCUS_ON_N50` in `kh.ts` are now aliases of the single
  white-ring focus style; focus rings are white/40 offset onto the page navy.
- Landing pages, login, onboarding, the demo console and everything under
  `app/api/**`, `lib/**`, `packages/**` are untouched.
