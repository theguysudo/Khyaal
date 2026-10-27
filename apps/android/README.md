# Khayaal — Android app (Phase 3)

The parent-side phone app: a passive, dignity-first wellbeing monitor for an
elderly parent living alone. The app **never computes a wellbeing score** —
it collects harmless signals (screen unlocks, a little movement, the evening
charger, home Wi-Fi presence, today's steps), posts them to the Khayaal
backend, and shows what the backend says back: a calm status card with a
score ring, a gentle nudge, one big "I'm OK" button, and a small grid of
helpers (call family, Ask Khayaal, night watch, reminders).

Design tokens, tier colors and copy mirror the web app in `apps/web`.

**New in 0.3.0**

- **Richer signals** — `steps` (daily delta from the step counter, plus a
  30-minute absolute snapshot), `sleep_event` and `sound_event` from the
  opt-in night watch.
- **Night watch** — an opt-in microphone foreground service that classifies
  loudness on-device and narrates the night in at most a handful of events.
  **No audio is ever recorded, stored, or uploaded.**
- **Commands channel** — messages / reminders / voice notes composed on the
  family dashboard arrive as notifications; `tts` commands are read aloud
  (Hindi supported); every command is acknowledged and deduped by id.
- **Ask Khayaal** — a warm helper chat. The conversation goes to the backend,
  which holds the LLM key; the app never does.
- **Tier-3 alarm + call chain** — a full-screen alarm with a big "Call
  family" button, the escalation order from `callPlan`, and (with CALL_PHONE
  granted) an automatic, cancellable call down the `callOrder` list.
- **Hey Khayaal** — opt-in on-device voice commands: "call <name>",
  "status" / "kaisi ho", "main theek hoon".
- **Encrypted pairing** — the household id, source id and API key are
  encrypted at rest with an AndroidKeyStore AES-256-GCM key.
- 43 JVM unit tests covering the sleep classifier, command dedupe, crypto
  round-trip, step accounting and the voice grammar.

---

## Project layout

```
apps/android/
├── settings.gradle.kts          # root project "Khayaal", module :app
├── build.gradle.kts             # plugin aliases from the version catalog
├── gradle/libs.versions.toml    # AGP 8.7.3, Kotlin 2.0.21, Compose BOM
└── app/
    ├── build.gradle.kts         # minSdk 26, targetSdk 35, BuildConfig base URL
    └── src/main/
        ├── AndroidManifest.xml  # mic FGS services, CALL_PHONE, boot receiver
        ├── res/                 # strings, warm-paper theme, adaptive icon
        └── java/com/khayaal/app/
            ├── KhayaalApp.kt          # Application + AppContainer (+ legacy migration)
            ├── MainActivity.kt        # routes: pairing ⇄ home ⇄ assistant/reminders
            ├── data/
            │   ├── api/               # Retrofit + kotlinx.serialization DTOs
            │   ├── crypto/            # AesGcmCrypto (pure) + PairingCipher (KeyStore)
            │   ├── datastore/         # DataStore: encrypted pairing, queue, bookkeeping
            │   ├── queue/             # durable in-memory signal buffer
            │   └── repo/              # KhayaalRepository (the only gateway)
            ├── signals/
            │   ├── SignalEvent.kt     # one observed moment (typed helpers)
            │   ├── SignalCollector.kt # registers/unregisters all listeners
            │   ├── SignalRecorder.kt  # pair-gate → queue → schedule flush
            │   ├── ScreenEventCollector.kt / ChargingCollector.kt
            │   ├── MotionCollector.kt / MotionTransitionReceiver.kt
            │   ├── WifiPresenceCollector.kt / AppUsageCollector.kt
            │   ├── StepsCollector.kt + StepsAccumulator.kt   # daily step delta
            │   ├── IngestWorker.kt / WorkScheduler.kt / BootReceiver.kt
            ├── sleep/
            │   ├── SleepWatchPolicy.kt    # pure nightly narration (unit-tested)
            │   ├── SleepWatchService.kt   # mic FGS: AudioRecord → RMS → events
            │   └── SleepWatchManager.kt   # opt-in start/stop plumbing
            ├── commands/
            │   ├── CommandBook.kt         # pure dedupe/ack bookkeeping (tested)
            │   ├── CommandCoordinator.kt  # notify + ack + persist on every poll
            │   └── TtsSpeaker.kt          # voice reminders (en + hi, fallback toast)
            ├── voice/
            │   ├── VoiceCommandParser.kt  # pure grammar (unit-tested)
            │   ├── VoiceCommandService.kt # mic FGS: SpeechRecognizer → actions
            │   └── VoiceCommandManager.kt
            ├── care/
            │   ├── CheckInManager.kt        # tier → gentle notifications (+call action)
            │   ├── StatePollWorker.kt       # 10-min poll → tiers + commands
            │   ├── CheckInActionReceiver.kt
            │   ├── CallChainManager.kt      # arms the free tier-3 call chain
            │   ├── CallChainWorker.kt       # dials callOrder step by step
            │   ├── CallChainNotifier.kt     # "calling <name>" + Cancel button
            │   ├── CallChainActionReceiver.kt
            │   └── FamilyCall.kt            # ACTION_DIAL / TelecomManager.placeCall
            ├── push/FirebaseService.kt      # FCM stub + token registration
            └── ui/
                ├── theme/                    # paper/ink/clay/sage + tiers, serif headings
                ├── components/CodeInput.kt
                ├── pairing/                  # PairingScreen + ViewModel
                ├── home/                     # HomeScreen, StatusCard + ScoreRing,
                │                             # QuickActions, SleepCard, AlarmOverlay
                ├── assistant/                # Ask Khayaal chat + quick chips
                └── reminders/                # "From your family" history
```

Serialization: **kotlinx.serialization** end to end, `ignoreUnknownKeys` on
every model — the web team's new fields (`commands`, `careCircle`,
`callPlan`, `lang`, `phone`) are consumed when present and silently absent
when not.

## Requirements

- **Android Studio** Ladybug (2024.2) or newer, **JDK 17**
- An Android emulator (API 26+) or a physical phone

Terminal build (used for CI):

```bash
JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
ANDROID_HOME=$HOME/Library/Android/sdk \
/Users/aditya/HIET/khayaal/.tools/gradle-8.10.2/bin/gradle \
  -p apps/android assembleDebug --no-daemon
cp apps/android/app/build/outputs/apk/debug/app-debug.apk apps/web/public/khayaal-debug.apk
```

## 1. Run the backend first

```bash
npm run dev            # Next.js backend + web dashboard on http://localhost:3100
```

On the **emulator** the app reaches your laptop as `http://10.0.2.2:3100`
(baked in as `DEFAULT_BASE_URL`). On a **physical phone**, enter your
laptop's LAN address under **Server settings** during pairing.

## 2. Pair

Create a household (dashboard onboarding or `POST /api/v1/pair` with
`{"action":"create",...}`), then enter the 6-digit code in the app.

The app then joins the household, registers a "phone" source, **encrypts the
pairing record** (AES-256-GCM, AndroidKeyStore — see Security), schedules the
15-minute ingest heartbeat + 10-minute state poll, and settles on the daily
view.

## Signal mapping

| Android event | Signal | Value | Notes |
|---|---|---|---|
| Screen unlocked | `screen_event` | `"unlock"` | Expedited flush |
| Charger in / out | `charging` | `true/false` | State-change only |
| Walking (Activity Recognition + sig-motion) | `motion` | `1` | Never a position |
| Home Wi-Fi SSID match | `location_zone` | `"home"/"away"` | Presence only |
| App opened (optional permission) | `app_usage` | `"<package>"` | Package names only |
| Step counter (ACTIVITY_RECOGNITION) | `steps` | steps today | Daily delta; absolute snapshot every 30 min at flush |
| Night watch (opt-in mic FGS) | `sleep_event` | `asleep/restless/woke/awake` | On-device classification only |
| Night watch (opt-in mic FGS) | `sound_event` | `quiet/noise/loud` | Loudness bucket, max 1 per 2 min |
| "I'm OK" tapped | `manual_checkin` | `true` | + `POST /checkin` |

**Batching:** every event is queued in DataStore-backed memory and flushed by
the 15-minute heartbeat. Unlock (and check-ins) schedule one-shot flushes; a
401/403 drops the queue and surfaces a quiet note on Home.

## Night watch ("Sleep Cycle"-style, strictly private)

Default **OFF**. Turning it on (Home quick-actions tile or the sleep card)
asks for RECORD_AUDIO and starts a `foregroundServiceType="microphone"`
service with the persistent notification **"Khayaal night watch is on"**.

The pipeline: `AudioRecord` (8 kHz mono, in-memory only) → RMS amplitude per
5-second window → `SleepClassifier` bucket → `SleepWatchPolicy`:

- 10 sustained quiet minutes at night (21:00–07:00) → `sleep_event 'asleep'`
  (once per night);
- any spike → `sound_event 'noise' | 'loud'`, rate-limited to one per 2 min;
- 2 minutes of steady noise while asleep → `sleep_event 'restless'` (once);
- 30 seconds of sustained loudness while asleep → `sleep_event 'woke'` (once);
- morning, or any stop path (toggle, battery <10%, 14-hour cap, process
  death) → `sleep_event 'awake'` if a night was open.

**Privacy:** audio bytes exist in memory for the duration of one RMS window
and are then gone — never written to disk, never uploaded. Only the
classified events above leave the phone, through the same encrypted-queue
path as every other signal. The Home sleep card states the disclosure word
for word: *"Listens for loud sounds only. Nothing is recorded, stored, or
uploaded — analysis happens on this device."*

If the toggle is ON but the service is dead (fresh boot), Home restarts it
while the app is foregrounded — Android forbids starting a mic FGS from
`BOOT_COMPLETED`.

## Commands channel (family → app)

The state bundle may carry
`"commands": [{"id","type","text","ts","ackTs","lang"}]` with
`type ∈ {message, reminder, tts, request_checkin}`. On every poll (and every
Home refresh), `CommandCoordinator`:

1. dedupes by id against DataStore (`CommandBook`, capped at 200 ids) — a
   reboot never re-notifies an old reminder;
2. posts one notification per new command on the `khayaal-commands` channel
   (`request_checkin` carries an "I'm OK" action);
3. speaks `tts` commands aloud via TextToSpeech — `lang: "hi"` switches the
   utterance to `hi-IN`, falling back to the default voice with a one-time
   toast suggesting Hindi speech data if it's missing;
4. acks each with `POST /api/v1/household/{id}/command-ack {"id"}`, retrying
   on later polls until confirmed (a 404 — backend predates the route — is
   accepted as terminal so it doesn't retry forever).

The Reminders screen shows the last 30 commands, newest first.

## Tier-3 alarm + call chain (free, no Twilio)

When the tier rises to 3:

- a full-screen high-importance notification fires, and the daily view shows
  the **AlarmOverlay**: warm-red, a big **Call family** button
  (`ACTION_DIAL` — the app never dials without the platform's blessing),
  an "I'm OK" button, and the escalation order from
  `household.callPlan` + `household.careCircle`;
- if the household carries `callPlan.callOrder: [{name, phone}]`, the call
  chain arms itself: after `callElderAfterMin` minutes it dials the first
  number — directly via `TelecomManager.placeCall` when **CALL_PHONE** is
  granted, otherwise the dialer opens pre-filled — then continues down the
  list every `alertCircleAfterMin` minutes. Every step is cancellable: the
  notification's **Cancel** button or the alarm's cancel stops the chain
  (`CallChainWorker` re-reads the DataStore snapshot each step).
- True answer detection needs privileged telephony APIs, so the chain is
  time-driven and cancellable by design.

## Ask Khayaal

A warm chat for her. Quick chips: "What medicine is next?", "Call family"
(dials), "Tell me a joke". Transport:
`POST /api/v1/household/{id}/assistant {"messages":[{role,content}]}`
(last 10 turns) → `{reply}`. **The app never holds an API key** — the
backend proxies to its LLM. If the route doesn't exist yet (404) or the
network is down, a gentle bubble says so and the chat stays intact.

## Hey Khayaal (voice commands)

Opt-in (default OFF) mic foreground service using on-device
`SpeechRecognizer` (`EXTRA_PREFER_OFFLINE`). Grammar-free listening; a
transcript becomes an action only when the wake word "Khayaal" is present:

| She says | Khayaal does |
|---|---|
| "Khayaal, call Aditya" | Dials the matching `callPlan.callOrder` contact (or the plain dialer) |
| "Khayaal, main theek hoon" / "I'm OK" | Posts a check-in |
| "Khayaal, status" / "kaisi ho" | Reads the current status aloud |

Transcripts are used in memory to trigger the action and are never stored or
uploaded. The parser is pure Kotlin and unit-tested.

## FCM device tokens

`FirebaseService.onNewToken` stores the token in DataStore and registers it
with `POST /api/v1/household/{id}/devices {"token"}` (best-effort — the
endpoint may not exist, the phone may not be paired). Pairing re-registers
the stored token idempotently; unpair calls `DELETE …/devices`. Tier pushes
remain a speed-up on top of the 10-minute poll.

## Security

- **Pairing record encrypted at rest.** householdId, sourceId and apiKey are
  serialized to JSON and sealed with AES-256-GCM under a non-exportable
  AndroidKeyStore key (`khayaal-pairing-v1`); the blob lands in DataStore as
  `pairing_encrypted`. Legacy v0.2 plaintext keys are migrated once at app
  start and wiped. If the KeyStore key is ever lost (wipe, corruption),
  decryption returns null and pairing again is the honest recovery.
- The API key travels only in the ingest body, never a header, never a log.
- HTTP logging stays BASIC (method + URL, never bodies) in debug, NONE in
  release.
- `allowBackup="false"`; no ACCESS_FINE_LOCATION, ever.

## Notifications ("care" tiers)

| Tier | Notification | Channel |
|---|---|---|
| 1 — Nudge sent | Soft, silent hello | `khayaal-care` (DEFAULT, marked silent) |
| 2 — Check-in asked | "Are you alright?" with **I'm OK** / **Snooze 1h** | `khayaal-care` |
| 3 — Needs attention | Full-screen intent + **Call family** action | `khayaal-urgent` (HIGH) |
| Family commands | message / reminder / voice note / check-in request | `khayaal-commands` (HIGH) |
| Night watch active | "Khayaal night watch is on" (ongoing) | `khayaal-night-watch` (LOW) |
| Hey Khayaal active | "Khayaal is listening for 'Hey Khayaal'" (ongoing) | `khayaal-voice` (LOW) |

## Privacy model

- **No `ACCESS_FINE_LOCATION`. Ever.** Presence is a home-SSID match.
- **No audio leaves the phone, from either service.** Night watch emits
  loudness buckets and sleep milestones only; voice commands keep transcripts
  in memory for one action. Neither service writes audio to disk.
- **No message content, no screen content.** `app_usage` is package names
  only, behind an explicit AppOps grant.
- **The LLM key lives on the server.** The assistant endpoint carries
  conversation text only.
- **The API key is encrypted at rest** (AndroidKeyStore AES-256-GCM) and
  never logged.
- Logging is BASIC in debug builds (method + URL, never bodies).

## What's left / known gaps

- **Backend routes this build tolerates but doesn't require**: `commands`
  and `careCircle`/`callPlan` in the state bundle, `command-ack`,
  `assistant`, `devices` — all consumed defensively; absent fields degrade
  silently.
- The call chain cannot observe call answers (needs privileged telephony);
  it is time-driven and cancellable.
- Boot does not auto-restart the mic services (Android 14 forbids mic FGS
  from `BOOT_COMPLETED`); Home re-arms them on first open.
- Assistant history is in-memory (a restart starts a fresh chat).
- A real Firebase project + `google-services.json` for instant pushes;
  a release signing config; `cleartextTrafficPermitted="false"` once the
  production URL is real.
- Instrumentation tests (the 43 pure-logic unit tests live in `app/src/test`).
