# Khayaal

[![CI](https://github.com/theguysudo/Khyaal/actions/workflows/ci.yml/badge.svg)](https://github.com/theguysudo/Khyaal/actions/workflows/ci.yml)

**A silent guardian for elderly parents living alone.**
Nothing to press. Nothing to wear. Nothing to remember.

Khayaal fuses weak, privacy-safe signals from the parent's existing Android
phone (and optionally an ESP32 Wi-Fi-sensing room sensor) into one wellbeing
score (0–100), and escalates in tiers only when needed. The child sees a calm
status — never raw data.

---

## Repository layout

```
khayaal/
├── apps/
│   ├── web/                 Next.js 15 · App Router · TypeScript · Tailwind
│   │   ├── app/             landing, /demo, /onboarding, /household/[id]
│   │   ├── app/api/v1/      the versioned API (ingest, state, checkin, ack, pair…)
│   │   ├── components/      landing (hero, zoom, story, footer) + dashboard bento
│   │   └── lib/
│   │       ├── server/      store (memory) + runtime (tick engine, scenarios)
│   │       └── api.ts       client polling layer
│   └── android/             Phase 2 Kotlin/Compose parent app (see its README)
├── packages/
│   ├── shared/              the single typed contract (signals, household, tiers)
│   └── engine/              pure, framework-free risk engine + 16 unit tests
└── firmware/                ESP32 room-sensor notes (stub, same ingest endpoint)
```

## Quick start

```bash
npm install          # workspaces: web + shared + engine
npm test             # engine unit tests (16 scenarios)
npm run dev          # http://localhost:3100
```

No environment variables needed to run the demo — the server uses an
in-process memory store. All state resets when the server restarts.

### The two-minute demo

1. Open **http://localhost:3100** — the landing page: cursor-reactive hero,
   scroll-driven zoom-through, the full "how it works" story, and the footer.
2. Open **/demo** — the demo console (clearly labeled as not-for-families).
   Click **"Possible emergency"**, tick **Auto-escalate**, and watch the
   simulated clock push the real engine up the ladder 1 → 2 → 3.
3. Click **"Open child dashboard ↗"** into a second browser window *first* —
   the alert arrives there in real time (1.5 s polling).
4. On the demo console's **"Her phone (simulated)"**, tap **I'm OK** — the
   ladder stands down and the household snoozes for two hours.

Everything the console shows is the real engine scoring real (seeded) signal
absences — the scenarios merely plant a believable week of history and bend
the simulated clock.

## How the engine decides

`packages/engine` is pure TypeScript (no framework imports), fully
unit-tested. The rule-based v1:

- **Signals in:** `screen_event · motion · charging · app_usage ·
  location_zone (home|away) · presence (ESP32) · manual_checkin · steps`.
- **Absence is the signal.** No morning unlock past her usual wake time, no
  movement for 6 h, no overnight charge, room sensor quiet, total silence —
  each contributes weighted points (30 / 28 / 16 / 18 / 20).
- **Fusion:** one weak signal proves nothing; the score is the sum, clamped
  to 0–100. The prototype escalates at **72**.
- **Being out is an explanation, not a risk:** a recent `location_zone: away`
  softens every absence to 35 % and says so in plain language.
- **Tier ladder (0→3):** score bands 35 / 55 / 72, but a band alone never
  escalates — each step needs its dwell timer (default 10 / 10 / 15 min, all
  configurable). One step per evaluation, sequential, idempotent,
  race-safe by recompute.
- **Quiet hours** hold the ladder at a nudge unless the score is ≥ 85.
- **Missing data degrades confidence** (0.4–1.0) and never raises the score
  by itself; low confidence caps the reachable tier.
- **Learning window:** the engine supports a deliberate no-scoring window
  (`learningUntilTs`), and the baseline (wake time, charge start, activity
  level) is learned from robust medians over a 7-day sliding window. For the
  short demo window, new households and demo scenarios seed the baseline
  instantly — scoring starts on the first request.

`advanceState()` is a pure function — same signals, same state out. That is
what makes transitions idempotent under 1.5 s polling from any number of
clients.

## API (v1)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/v1/pair` | `{action:"create"\|"join"\|"demo"}` — create household / pair with 6-digit code / demo quick-start |
| POST | `/api/v1/ingest` | any source posts signals; per-source API key required when provided |
| GET | `/api/v1/household/{id}/state` | **the tick** — advances the state machine, returns the child-safe bundle |
| POST | `/api/v1/household/{id}/checkin` | the parent's one-tap "I'm OK" (holds the ladder down 2 h) |
| POST | `/api/v1/household/{id}/ack` | child acknowledges a tier-3 alert (siblings notified) |
| POST | `/api/v1/household/{id}/snooze` | `{minutes}` |
| PATCH | `/api/v1/household/{id}/config` | names, quiet hours, timers; `simAdvanceMinutes` = demo time-warp |
| POST | `/api/v1/household/{id}/demo` | `{scenario:"normal"\|"slow"\|"emergency"}` — seed a scripted week |
| GET/POST/DELETE | `/api/v1/household/{id}/sources` | register devices; the API key is returned exactly once |

The child-facing state bundle deliberately contains **no raw signals and no
API keys** — the UI cannot leak what it never receives.

## Storage

`lib/server/store.ts` defines one interface with two lives:

- **MemoryStore (default, zero-config)** — powers everything you see locally.
- **FirestoreStore (drop-in)** — implement the same interface against
  Firestore when you have a project: `households/{id}`,
  `households/{id}/signals` (~7-day TTL), `/state`, `/events`, `/sources`,
  plus a baseline doc. Use a transaction on `setState` for cross-instance
  safety. Nothing in the engine, API, or UI changes — the Android app and web
  keep consuming the same `/api/v1` contract.

## Privacy model

- No camera, no microphone, no message or call content — ever.
- No GPS. "Home presence" is a Wi-Fi network match, not a trail.
- Child UI: status + last-active + score trend + plain-language reasons.
- Signals retained ~7 days, scored, then discarded.
- What leaves the house is a signal, not an account.

## The Android app (Phase 2)

`apps/android/` — Kotlin + Jetpack Compose parent app: pairing via the
6-digit code, batched signal collection (WorkManager), the one-tap
"I'm OK", and tier-aware notifications. It consumes this same API unchanged.
See `apps/android/README.md`.

## ESP32 room sensor

`firmware/README.md` — Wi-Fi CSI presence sensing via Espressif `esp-csi`,
posting to the same `/api/v1/ingest` endpoint with a per-source key. The
demo console's SimulatedCsiSensor speaks the identical contract, so the real
sensor is a drop-in replacement that touches neither engine nor API.

## Design notes

The landing page borrows two interaction grammars, both re-themed to a calm,
warm care product: a cursor-reactive illustrated hero with typewriter and
pill actions, a pinned scroll zoom-through (GSAP ScrollTrigger) with stock
photography (Wikimedia Commons / Unsplash), blur-rise section reveals with
staggered fact rows and a side rail, an anime.js score gauge, and a
full-viewport frosted-wordmark footer. All animation respects
`prefers-reduced-motion`.

## Free-tier guarantee

Everything runs on free tiers by design: Google OAuth (free), OpenRouter /
NVIDIA free LLM models for behaviour analysis and the assistant, Firebase
Spark tier for FCM/Firestore when you connect them, GitHub Actions for CI,
and a self-hosted server. No paid service is wired in anywhere.

## Known limits / next steps

- Firestore adapter (interface ready, needs a Firebase project to verify).
- FCM web/Android push needs a Firebase project + VAPID keys; in-app alerts
  and polling cover the demo.
- The two open questions a pilot must answer: Wi-Fi CSI reliability across
  room layouts, and the false-alarm rate of the baseline model in real
  households.
- Phase-2 ML: per-user Isolation Forest / LSTM behind the same engine
  interface, TensorFlow Lite on-device.
