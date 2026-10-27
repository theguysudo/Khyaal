# Khayaal

[![CI](https://github.com/theguysudo/Khyaal/actions/workflows/ci.yml/badge.svg)](https://github.com/theguysudo/Khyaal/actions/workflows/ci.yml)

**A silent guardian for elderly parents living alone.**
Nothing to press. Nothing to wear. Nothing to remember.

Khayaal fuses weak, privacy-safe signals from the parent's existing Android
phone (and optionally an ESP32 Wi-Fi-sensing room sensor) into **one** wellbeing
score (0–100), and escalates in tiers only when needed. The family sees a calm
status — never raw data, never a feed, never a map.

> **Team Nivaan** — Aditya Dubey & Rudra Pratap Singh Negi, IILM University,
> Greater Noida.

---

## Table of contents

1. [What it is](#what-it-is)
2. [How it works](#how-it-works)
3. [The three surfaces](#the-three-surfaces)
4. [Feature tour](#feature-tour)
5. [Tech stack](#tech-stack)
6. [The API](#the-api)
7. [The engine](#the-engine)
8. [Privacy model](#privacy-model)
9. [Setup](#setup)
10. [The five-minute demo](#the-five-minute-demo)
11. [Tests and CI](#tests-and-ci)
12. [Free-tier guarantee](#free-tier-guarantee)
13. [Known limits](#known-limits)

---

## What it is

An elderly parent lives alone. Her family wants to know she is all well —
without her having to do anything, and without anyone watching her through a
window.

Most "monitoring" products solve this by adding a camera, a wearable or a
daily phone call. Khayaal refuses all three. Instead it reads the ordinary
signals a phone and a room already produce — whether she unlocked it this
morning, whether she moved around the house, whether it went on charge
overnight, whether the room sensor felt anyone, whether she has been silent
for hours — and learns what *ordinary* looks like **for this one person**.

Then it does the only thing that matters: when several absences line up, it
tells the family, in plain language, what it noticed and what it did.

```
Absence is the signal.

Presence proves very little — a phone that pings every hour says nothing.
But a phone that has not moved since dawn, has not been unlocked, has not
charged, and whose room has felt nobody for three hours is telling a story.
Khayaal is built to notice that story, and to stay silent otherwise.
```

**What it is not:** it is not a surveillance feed, not a tracker, not a
panic-button product, and not something that asks her to remember anything.

---

## How it works

```
   ┌──────────────────────┐         ┌──────────────────────┐
   │   Her Android phone  │         │  ESP32 room sensor   │
   │                      │         │                      │
   │  unlock · motion     │         │  Wi-Fi CSI variance  │
   │  steps · charging    │         │  → motion / idle     │
   │  sleep · loudness    │         │  → fall              │
   │  GPS → zone +        │         │                      │
   │    movement numbers  │         │                      │
   └──────────┬───────────┘         └──────────┬───────────┘
              │  POST /api/v1/ingest            │  sealed tunnel
              │  (AES-256-GCM)                  │  (HKDF + GCM)
              └───────────────┬─────────────────┘
                              ▼
                   ┌─────────────────────────┐
                   │   Next.js API (v1)      │
                   │   · one contract        │
                   │   · authorisation       │
                   │   · rate limiting       │
                   │   · sealed at rest      │
                   └────────────┬────────────┘
                                ▼
                   ┌─────────────────────────┐
                   │   Risk engine           │
                   │   (pure TypeScript)     │
                   │   absence → one score   │
                   │   0 / 1 / 2 / 3 tiers   │
                   └────────────┬────────────┘
                                ▼
        ┌───────────────────────┴───────────────────────┐
        ▼                                               ▼
┌───────────────┐                            ┌────────────────────┐
│ Family        │                            │ Her phone          │
│ dashboard     │  commands · talkback ·     │ nudges · reminders │
│ status, why,  │  alerts · AI analysis      │ TTS · voice        │
│ night watch,  │                            │ answers · to-do    │
│ talkback      │                            │ widget             │
└───────────────┘                            └────────────────────┘
```

Every source speaks the **same** small REST contract. The phone, the sensor,
the USB bridge and the dashboard are interchangeable clients — which is why
the demo's simulated sensor is a drop-in replacement for the real board.

---

## The three surfaces

### 1. Web — `apps/web`

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind.

| Route | What it is |
| --- | --- |
| `/` | The landing page: video-scrub hero, scroll story, **the full documentation section** (`#docs`), blue-hour footer |
| `/demo` | The demo console — seeded scenarios, time-warp, simulated phone and sensor |
| `/onboarding` | Create a family (sign-in first) and get the pairing code |
| `/login` | Google sign-in, your families, and the "open on her phone" session transfer |
| `/household/{id}` | The family dashboard — the calm bento |
| `/household/{id}/settings` | Names, quiet hours, escalation timers, care circle, call plan |

The dashboard's cards: current status, 24-hour score trend, **talkback**,
rhythm map, escalation ladder, plain-language reasons, **night watch with
calming sounds**, **movement**, AI behaviour analysis, care circle, browser
push, the quiet log, and the sources panel (add a room sensor, run a fall
test, manage its Wi-Fi).

### 2. Android — `apps/android`

Kotlin · Jetpack Compose · Retrofit · WorkManager · AndroidKeyStore.

The parent's app. It is deliberately calm: large type, big targets, no hidden
gestures, and a segmented set of tabs she can move between.

- **Today** — status, score, one-tap "I'm OK", snooze
- **Movement** — steps, GPS zone (home/away), last movement
- **Night** — sleep milestones, night-watch state, calming sounds
- **Talk** — Ask Khayaal, **voice answers**, reminders, **talkback**
- **Family** — the care circle and the call plan
- **More** — server address, home Wi-Fi, toggles, widget, unpair

Plus a **home-screen widget**: the time, the date and a to-do list she can
edit without opening the app.

See `apps/android/README.md` for the full app documentation.

### 3. Firmware — `firmware/`

ESP32-WROOM-32 · Arduino-ESP32 3.x · Espressif `esp-csi`.

Presence and fall sensing through Wi-Fi CSI — no camera, no microphone,
nothing worn. Two transports:

- **serial** — one JSON line per event over USB, picked up by the Mac-side
  Python bridge (`firmware/tunnel/khayaal_serial_bridge.py`) and sealed with
  AES-256-GCM before it hits the network;
- **lan** — the board posts to the backend itself, with the same sealing.

The serial CLI (`help · show · cal · thr · ssid · pass · host · hh · src ·
key · mode · enc · scan · wififorget · statusjson · factory · falltest`) is
also how the dashboard's Wi-Fi management works — the board can be joined to a
network without anyone typing a serial command.

---

## Feature tour

| Feature | Where | What it does |
| --- | --- | --- |
| **Wellbeing score** | dashboard | One 0–100 number from the absence rules, with a plain-language "why" |
| **Escalation ladder** | dashboard + phone | 0 quiet → 1 nudge → 2 check-in → 3 family alerted, with dwell timers |
| **Talkback** | dashboard + phone | A consent-first walkie-talkie. Either side asks; the other side gets a popup; only after **Allow** does the microphone open. PCM16 mono 16 kHz over a long-polled channel. |
| **Movement (GPS)** | dashboard + phone | The phone works out a home/away zone and movement numbers **on-device**. Coordinates never leave the phone; there is no map and no trail. |
| **Night watch** | dashboard | The overnight log — sleep milestones and loudness classification — plus **calming nature sounds** made by the browser itself (rain, ocean, forest, night, fireplace), each with its own volume and mute, and a room-level mute. |
| **"Hey Khayaal"** | phone | Say a thing; she gets a **text answer** and a spoken one. Deterministic tasks (call someone, check in, read the status) are performed; everything else is answered by a free LLM — MiniMax, NVIDIA NIM or OpenRouter — proxied by the server so the app holds no key. |
| **Commands channel** | dashboard → phone | Message, reminder, spoken TTS (English/हिंदी), check-in request |
| **Care circle + call plan** | dashboard | Neighbours and family who are notified on a tier-3 alert, and the order her phone dials |
| **AI behaviour analysis** | dashboard | An LLM reads privacy-safe aggregates only — trend, tiers, hourly shape — and suggests what to do |
| **Alerts** | all | FCM push, VAPID web push and SMTP email to the circle — all free, all silent no-ops without credentials |
| **Wi-Fi management** | dashboard | Laptop-style scan / join / forget for the room sensor, over the USB relay |
| **Fall detection** | sensor + engine | A CSI variance spike followed by stillness raises tier 3 immediately, bypassing the ladder, quiet hours and the confidence gate |
| **Home-screen widget** | phone | Time, date, and an editable to-do list |

---

## Tech stack

| Layer | Choice |
| --- | --- |
| **Web** | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, GSAP + anime.js, hand-rolled OAuth (no extra deps) |
| **Engine** | Pure TypeScript, Vitest, rule-based scoring with dwell timers, quiet hours and a learned baseline |
| **Android** | Kotlin, Jetpack Compose, Retrofit + kotlinx.serialization, WorkManager, DataStore, AndroidKeyStore AES-256-GCM, AppWidget |
| **Firmware** | ESP32-WROOM-32, Arduino-ESP32 3.x, Espressif `esp-csi`, HKDF-SHA256 tunnel keys, AES-256-GCM sealed ingest, PlatformIO |
| **Transport** | Python USB-serial bridge (`pyserial`, `requests`, `cryptography`) |
| **Infrastructure** | Google OAuth 2.0, Firebase Spark (Firestore + FCM), VAPID web push, SMTP (nodemailer), MiniMax / NVIDIA NIM / OpenRouter |
| **Delivery** | npm workspaces monorepo, GitHub Actions CI, APK published as a build artifact |
| **Cost** | Free tier only. No paid service is wired in anywhere. |

---

## The API

Everything lives under `/api/v1`. Household routes accept **either** a family
session cookie **or** a device credential pair (`x-kh-source` / `x-kh-key`).

### Core

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/v1/pair` | `{action:"create"\|"join"\|"demo"}` — create a household (needs a session), join with the 6-digit code, or the demo quick-start |
| POST | `/api/v1/ingest` | Any source posts one signal. Plaintext with the source key, or a sealed `enc:"v1"` envelope |
| GET | `/api/v1/household/{id}/state` | **The tick** — advances the state machine and returns the family-safe bundle |
| POST | `/api/v1/household/{id}/checkin` | Her one-tap "I'm OK" (holds the ladder down for 2 h) |
| POST | `/api/v1/household/{id}/ack` | The family acknowledges an alert |
| POST | `/api/v1/household/{id}/snooze` | `{minutes}` |
| PATCH | `/api/v1/household/{id}/config` | Names, quiet hours, timers, `simAdvanceMinutes` (demo time-warp) |
| POST | `/api/v1/household/{id}/demo` | `{scenario:"normal"\|"slow"\|"emergency"}` |
| GET/POST/DELETE | `/api/v1/household/{id}/sources` | Register devices; the API key is returned exactly once |
| GET/POST | `/api/v1/household/{id}/pairing-code` | Read the current code; regenerate it explicitly (never automatic) |

### Commands, care and alerts

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/v1/household/{id}/commands` | `{type:"message"\|"reminder"\|"tts"\|"request_checkin", text, lang}` |
| POST | `/api/v1/household/{id}/command-ack` | The phone confirms a command landed |
| POST | `/api/v1/household/{id}/circle` | `{action:"add"\|"remove", name, email, phone, role}` |
| POST | `/api/v1/household/{id}/analysis` | LLM behaviour analysis over privacy-safe aggregates |
| POST | `/api/v1/household/{id}/assistant` | "Ask Khayaal" — `{messages, provider?}` → `{reply, provider, model}` |
| POST/DELETE | `/api/v1/household/{id}/devices` | Register / remove an FCM token |
| POST | `/api/v1/household/{id}/push-subscribe` | Browser push subscription |

### Talkback

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/v1/household/{id}/talkback/request` | `{direction:"to_parent"\|"to_family"}` → a pending session |
| GET | `/api/v1/household/{id}/talkback/session` | The live session and which side you are |
| POST | `/api/v1/household/{id}/talkback/answer` | `{sessionId, allow}` — only the callee may answer |
| POST | `/api/v1/household/{id}/talkback/chunk` | `{sessionId, mime, data}` — base64 PCM16 mono 16 kHz |
| GET | `/api/v1/household/{id}/talkback/chunks?after=N` | Long-poll (≤15 s) for new slices |
| POST | `/api/v1/household/{id}/talkback/end` | Either side hangs up |

### Devices and session

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/device/actions?via=lan\|usb` | The dashboard's control channel. The channel matters: the sensor polls `lan`, the USB relay polls `usb`, and neither can eat the other's work |
| POST | `/api/v1/device/wifi` | The relay posts scan results and connection status back |
| GET | `/api/v1/household/{id}/sources/{sourceId}/wifi` | The family-side view of the last scan and status |
| POST | `/api/v1/household/{id}/sources/{sourceId}/actions` | Queue a fall test or a Wi-Fi action |
| GET | `/api/v1/server-info` | The LAN base URL and the VAPID public key |
| GET | `/api/auth/google/{start,callback}` | The family sign-in |
| POST | `/api/auth/transfer` | Mint a one-time link that hands the session to her phone |

The child-facing state bundle deliberately contains **no raw signals and no API
keys** — the UI cannot leak what it never receives.

---

## The engine

`packages/engine` is pure TypeScript (no framework imports) and fully
unit-tested (**25 tests**). The rule-based v1:

- **Signals in:** `screen_event · motion · charging · app_usage · location_zone
  · gps_motion · presence · manual_checkin · steps · sleep_event · sound_event`.
- **Absence is the signal.** No morning unlock past her usual wake time, no
  movement for 6 h, no overnight charge, room sensor quiet, total silence —
  each contributes weighted points (30 / 28 / 16 / 18 / 20).
- **Fusion:** one weak signal proves nothing; the score is the sum, clamped to
  0–100. The prototype escalates at **72**.
- **Being out is an explanation, not a risk:** a recent `location_zone: away`
  softens every *absence* to 35 % and says so in plain language. A fall or a
  loud sound is a verdict and is never softened.
- **Travel explains a quiet house:** GPS movement in the last 3 h softens
  absences to 50 % — less than a declared zone, because it is a hint.
- **Tier ladder (0→3):** score bands 35 / 55 / 72, but a band alone never
  escalates — each step needs its dwell timer (default 10 / 10 / 15 min, all
  configurable). One step per evaluation, sequential, idempotent, race-safe by
  recompute.
- **Quiet hours** hold the ladder at a nudge unless the score is ≥ 85.
- **Missing data degrades confidence** (0.4–1.0) and never raises the score by
  itself; low confidence caps the reachable tier.
- **Learning window:** the engine supports a deliberate no-scoring window
  (`learningUntilTs`), and the baseline (wake time, charge start, activity
  level) is learned from robust medians over a 7-day sliding window. For the
  demo, new households seed the baseline instantly — scoring starts on the
  first request.

`advanceState()` is a pure function — same signals, same state out. That is
what makes transitions idempotent under 1.5 s polling from any number of
clients.

---

## Privacy model

- **No camera, ever.** There is no video pipeline and no image in the sensing path.
- **No location trail.** The phone computes a home/away zone and a few movement
  numbers **on-device**. Latitude and longitude never leave the phone, never
  reach the API, and there is no map in the product.
- **No message content.** App usage is a package name. Nothing ever reads a
  message, a call or a notification.
- **No wearable, no daily ritual.** The phone she already owns and the room
  she already sits in.
- **Consent before audio.** Talkback opens a microphone only after the other
  side taps Allow. The audio passes through and is gone; it is never written
  to disk.
- **Encrypted at rest and in transit.** Signals are AES-256-GCM sealed in the
  store; the sensor tunnel is sealed with a key derived by HKDF-SHA256 from
  the source key and never transmitted, with the household and source bound
  in as AAD and a replay cache.
- **The child UI cannot leak.** It only ever receives aggregates, a status,
  plain-language reasons and the family's own actions.
- **Seven days, then gone.** Signal history is discarded after a week.
- **What leaves the house is a signal, not an account.**

Every household route is authorised, and unknown households answer **404** —
never 401 or 403 — so the API is not an existence oracle. The pen-test
(`apps/web/scripts/pentest.sh`) asserts this.

---

## Setup

### Web

```bash
npm install          # workspaces: web + shared + engine
npm test             # engine unit tests
npm run dev          # http://localhost:3100
```

No environment variables are needed for the demo — the server uses an
in-process memory store, and all state resets when it restarts.

Copy `apps/web/.env.example` to `apps/web/.env.local` to enable the optional
features (Google sign-in, the LLM providers, Firebase, push, SMTP). The file
is gitignored; **never commit a key**.

### Android

The SDK lives at `~/Library/Android/sdk`. JDK 17 and Gradle 8.10.2 are
required (newer JDKs break AGP 8.7):

```bash
cd apps/android
JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
  ../../.tools/gradle-8.10.2/bin/gradle assembleDebug
```

If you have no Homebrew JDK 17, Android Studio ships a working one:

```bash
cd apps/android
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
  ../../.tools/gradle-8.10.2/bin/gradle assembleDebug
```

> **A build that fails with a bare `25.0.1` and no file or line is a JDK
> problem, not a code problem.** That is the Kotlin compiler choking on
> JDK 25. Set `JAVA_HOME` as above and it builds.

The APK lands at `apps/android/app/build/outputs/apk/debug/app-debug.apk`.
Copy it to `apps/web/public/khayaal-debug.apk` and the onboarding page offers
it as a direct download on her phone.

### ESP32

```bash
bash firmware/test-pipeline.sh sim      # no hardware: fake sensor → bridge → backend
bash firmware/test-pipeline.sh lan      # direct ingest, like the board's LAN mode
bash firmware/test-pipeline.sh hardware  # the real board over USB
bash firmware/test-pipeline.sh flash    # erase + write the firmware
```

The pipeline asserts in PASS/FAIL form and exits non-zero on failure, so it
is judge-testable in one command. Full instructions — including the Wi-Fi
setup from the dashboard — are in `docs/SETUP_GUIDE.md`.

---

## The five-minute demo

`docs/FIVE_MINUTE_DEMO.md` has the timed run-of-show and the pre-demo
checklist. The short version:

1. **Prep (before the stage).** Start the server, create the household, add
   the room sensor, paste the identity block into the board once, start the
   USB relay.
2. **Open the dashboard.** The status reads "doing fine" immediately — the
   baseline is seeded, so there is no waiting.
3. **Ask her to talk.** The talkback card sends a request; her phone shows a
   consent popup; tap Allow; hold to talk.
4. **Run a fall test.** The Sources card fires the sensor; the score jumps to
   tier 3 and the alert arrives on every device at once.
5. **Read the night.** The night-watch card shows the overnight log and plays
   calming sounds.

All the fiddly parts are in the checklist, so the stage time is only the live
moments.

---

## Tests and CI

```bash
npm test         # engine — 25 unit tests
npm run typecheck # all workspaces
bash apps/web/scripts/pentest.sh   # 43 security checks
bash firmware/test-pipeline.sh sim # the sensor pipeline, no hardware
```

GitHub Actions runs two jobs on every push: **web** (install, typecheck,
engine tests, `next build`) and **android** (JDK 17, SDK 35, Gradle 8.10.2,
`assembleDebug`, APK uploaded as an artifact).

---

## Free-tier guarantee

Everything runs on free tiers by design: Google OAuth, the hosted open models
(MiniMax, NVIDIA NIM, OpenRouter), Firebase Spark for FCM and Firestore, VAPID
web push, SMTP, GitHub Actions, and a self-hosted server. **No paid service is
wired in anywhere** — calling and alerting go through native dialler hand-off
and free push channels, never a paid gateway.

---

## Known limits

- Firestore and FCM need a Firebase project to be exercised; both are silent
  no-ops without credentials.
- VAPID and SMTP alerting are the same: configured in `.env.local`, dormant
  until then.
- The two open questions a pilot must answer: Wi-Fi CSI reliability across
  room layouts, and the false-alarm rate of the baseline model in real
  households.
- Next: a per-user anomaly model behind the same engine interface, and
  TensorFlow Lite on-device.
