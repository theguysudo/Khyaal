# Khayaal — "The Quiet Ledger" Design System

Source of truth for the 2026-10-30 redesign. Derived from three verified pulls:
the user's **iOS & iPadOS 26 (Community)** Figma kit (`R2uB12K5SU5MKlFswvvxXx` —
Colors `0:1746`, Text Styles `0:2194`, Buttons `507:24673`, Tab Bars `507:24689`),
four studio references (norgram.co, subnet.ch, thenewmvt.com, couragecreative.co.uk),
and uiverse.io component mechanics (MIT-licensed patterns, re-authored natively).

## Direction

Khayaal is a calm instrument that watches over a parent. It reads like a printed
ledger, not a SaaS console: paper, ink, hairlines, numbered sections, one warm
accent. Structure does the designing — rules and indices instead of shadows and
rounded card grids.

**Banned (non-negotiable):** generic SaaS template layout; gradients;
glassmorphism / blur; glowing elements; floating blobs; rows of identical
rounded cards; decorative animation; generic stock iconography; emoji as icons;
purple/indigo AI-palette.

## Tokens

| Token | Light (default) | Dark (SOS contexts) |
|---|---|---|
| `--paper` | #FAF8F5 (warm paper) | #141210 |
| `--paper-raised` | #FFFFFF | #1E1B18 |
| `--ink` | #1A1815 | #F2EEE8 |
| `--ink-2` (secondary) | #57534E | #A8A29E |
| `--ink-3` (tertiary/meta) | #8A857D | #78716C |
| `--rule` (hairline) | #E7E2DA | #2C2823 |
| `--rule-strong` | #D6CFC4 | #3B362F |
| `--signal` (brand terracotta) | #B4451C | #D96B3A |
| `--signal-ink` (text on signal) | #FFF7F0 | #FFF7F0 |
| `--calm` (ok green, desaturated) | #2F6B4F | #7FB89B |
| `--watch` (amber) | #9A6A1B | #D9B36A |
| `--alarm` (SOS red) | #B3261E | #E5645C |

Type (SF Pro from the kit, web fallback stack):
`display: ui-serif, "New York", Georgia, serif` — verdicts only.
`body/-ui: -apple-system, "SF Pro Text", Inter, system-ui, sans-serif`.
`data/indices: ui-monospace, "SF Mono", monospace` — all numerals, indices, timestamps.
Ramp: 48/34 display (tight -0.02em), 22 section, 17 body, 15 ui, 13 meta caps
(0.08em tracking, uppercase for section labels). Verdicts ("Amma is doing fine.")
are serif — the single loudest element on the page.

Spacing: 4px base; section padding 40/64; cards use hairline rules, not shadows,
radius 8 (never pill cards); page max-width 1120px.

## Composition grammar

1. **Numbered editorial sections** — `01 — SIGNALS`, `02 — THE WATCHERS`,
   `03 — TALK`, `04 — NIGHT WATCH`, `05 — SOURCES`. Mono index + caps label +
   hairline rule spanning the column. Every card belongs to a section.
2. **The verdict** — one serif sentence under the household header ("Amma is
   doing fine."), with the odometer wellbeing counter beneath it (keep the
   existing Odometer; it is the signature interaction).
3. **Ledger rows, not card grids** — data lives in full-width rows separated by
   hairlines: label left (caps 13px), value right (tabular mono), status as a
   6px dot + word. Rows may group 2–3 per panel; panels never shadow, only
   1px rule + raised paper.
4. **Status dots** carry meaning; color is never the only carrier (dot + word).
5. **Pagination indices** on multi-frame content, mono: `01 / 04` (TNM pattern).

## Components

**Buttons (iOS 26 families + uiverse mechanics, re-authored):**
- `btn-primary` — signal fill, radius 8, no gradient. Motion: **swipe-fill**
  inverse on hover (a paper-colored layer translates in from the left over
  240ms iOS curve `cubic-bezier(.32,.72,0,1)`, label crossfades to ink),
  magnetic press: `transform: scale(.97)` + shadow compress on `:active`.
- `btn-secondary` — transparent, 1px `rule-strong` border. Motion:
  **border-draw** — on hover the border thickens via inset box-shadow sweep
  200ms; press as primary.
- `btn-ghost` — ink text, no border; underline draws left→right on hover.
- `btn-sos` — alarm fill, full-width in the SOS rail, persistent 1.5s rest
  pulse of a 1px outline (the only permitted loop; disabled under
  `prefers-reduced-motion`).
- All: 40px height (44 on mobile), 15px semibold labels, focus ring 2px signal.

**Sections/panels:** header row = mono index + caps title + rule; body rows as
ledger rows. Panels stack with 24px gaps on a shared column, not masonry.

**Lists (iOS 26 `Lists 507:24675`):** rows with leading status dot, label,
trailing mono value + chevron; dividers inset 16px; press state = paper tint
4% flash 150ms.

**Segmented control (iOS 26):** for CSI scope / range toggles — track paper-raised,
1px rule, active segment ink-on-paper with 160ms slide.

**Sheet (SOS overlay):** iOS sheet behavior — full-bleed alarm panel slides up
`cubic-bezier(.32,.72,0,1)` 360ms, dark mode tokens, countdown in mono,
Keep the existing SosOverlay logic/handlers; reskin only.

**Tab bar (mobile ≤720px):** iOS 26 floating tab bar flattened to editorial:
bottom fixed paper bar, hairline top rule, mono indices 01–04 for
Signals/Watchers/Talk/Night, active = signal underline 2px. No blur.

## Motion law

One spring-ish curve everywhere: `cubic-bezier(.32,.72,0,1)` (iOS sheet).
Durations 160–360ms. Allowed: odometer (keep), section fade-up on first paint
(staggered 60ms, once), swipe-fill/border-draw hovers, SOS sheet + pulse.
Everything else static. `prefers-reduced-motion: reduce` kills all but opacity.

## Anti-slop checklist (verify before delivery)

- [ ] No gradient, blur, glass, glow, blob anywhere (grep: `gradient|blur|shadow-lg|drop-shadow`)
- [ ] No two adjacent panels with identical rounded silhouette
- [ ] Every section numbered with mono index + rule
- [ ] Verdict is serif; data is mono; labels are caps 13px
- [ ] Only the SOS pulse loops
- [ ] Focus states visible; hit areas ≥40px; status = dot+word
