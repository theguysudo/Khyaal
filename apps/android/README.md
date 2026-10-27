# Khayaal — Android app (Phase 2)

The parent-side phone app: a passive, dignity-first wellbeing monitor for an
elderly parent living alone. The app **never computes a wellbeing score** —
it collects harmless signals (screen unlocks, a little movement, the evening
charger, home Wi-Fi presence), posts them to the Khayaal backend, and shows
what the backend says back: a calm status card, a gentle nudge, and one big
"I'm OK" button. That is deliberately all.

Design tokens, tier colors and copy mirror the web app in `apps/web`.

---

## Project layout

```
apps/android/
├── settings.gradle.kts          # root project "Khayaal", module :app
├── build.gradle.kts             # plugin aliases from the version catalog
├── gradle.properties
├── gradle/libs.versions.toml    # AGP 8.7.3, Kotlin 2.0.21, Compose BOM
├── gradle/wrapper/gradle-wrapper.properties   # Gradle 8.10.2 (no wrapper jar)
└── app/
    ├── build.gradle.kts         # minSdk 26, targetSdk 35, BuildConfig base URL
    └── src/main/
        ├── AndroidManifest.xml
        ├── res/                 # strings, warm-paper theme, adaptive icon
        └── java/com/khayaal/app/
            ├── KhayaalApp.kt          # Application + 6-object AppContainer
            ├── MainActivity.kt        # reactive routes: pairing ⇄ home
            ├── data/
            │   ├── api/               # Retrofit + kotlinx.serialization DTOs
            │   ├── datastore/         # DataStore: pairing, settings, queue
            │   ├── queue/             # durable in-memory signal buffer
            │   └── repo/              # KhayaalRepository (the only gateway)
            ├── signals/
            │   ├── SignalEvent.kt     # one observed moment (typed helpers)
            │   ├── SignalCollector.kt # registers/unregisters all listeners
            │   ├── SignalRecorder.kt  # pair-gate → queue → schedule flush
            │   ├── ScreenEventCollector.kt   # ACTION_USER_PRESENT → "unlock"
            │   ├── ChargingCollector.kt      # POWER_CONNECTED/DISCONNECTED
            │   ├── MotionCollector.kt        # ActivityRecognition + sig-motion
            │   ├── MotionTransitionReceiver.kt
            │   ├── WifiPresenceCollector.kt  # home-SSID match → home/away
            │   ├── AppUsageCollector.kt      # optional, package names only
            │   ├── IngestWorker.kt           # batched flush to /api/v1/ingest
            │   ├── WorkScheduler.kt          # 15-min heartbeat + one-shots
            │   └── BootReceiver.kt           # re-arm after reboot
            ├── care/
            │   ├── CheckInManager.kt         # tier → gentle notifications
            │   ├── StatePollWorker.kt        # 10-min state poll
            │   └── CheckInActionReceiver.kt  # "I'm OK"/"Snooze 1h" actions
            ├── push/FirebaseService.kt       # FCM stub (see Firebase setup)
            └── ui/
                ├── theme/                    # paper/ink/clay/sage + tiers
                ├── components/CodeInput.kt   # large warm 6-digit boxes
                ├── pairing/                  # PairingScreen + ViewModel
                └── home/                     # HomeScreen, StatusCard, Nudge
```

Serialization: **kotlinx.serialization** end to end (DTOs, the signal queue,
the Retrofit converter). Signal values are string/number/boolean on the wire,
so they are modeled as `JsonElement` and built with the typed helpers in
`SignalEvent`.

## Requirements

- **Android Studio** Ladybug (2024.2) or newer
- **JDK 17** (Studio's embedded JDK is fine)
- An Android emulator (API 26+) or a physical phone

This project ships **without a Gradle wrapper jar**. Opening it in Android
Studio is enough — Studio reads `gradle/wrapper/gradle-wrapper.properties`
and provisions Gradle 8.10.2 itself. From a terminal you can also generate
the wrapper once (`gradle wrapper` with a local Gradle install).

## 1. Run the backend first

```bash
cd ../../..            # repo root
npm install
npm run dev            # Next.js backend + web dashboard on http://localhost:3100
```

On the **emulator** the phone app reaches your laptop as
`http://10.0.2.2:3100` — that is the default base URL baked into debug builds
(`DEFAULT_BASE_URL` in `app/build.gradle.kts`). Cleartext HTTP is permitted by
`network_security_config.xml` for exactly this reason; set
`cleartextTrafficPermitted="false"` for production.

On a **physical phone**, use your laptop's LAN address instead, e.g.
`http://192.168.1.20:3100/` — enter it on the pairing screen under
**Server settings** (or later in the gear → Settings), and make sure the
phone and laptop share the Wi-Fi network.

## 2. Create a household and get the pairing code

On your machine:

```bash
curl -X POST http://localhost:3100/api/v1/pair \
  -H 'Content-Type: application/json' \
  -d '{"action":"create","parentName":"Amma","childName":"Aditya"}'
```

The response's `household.pairingCode` is the 6-digit code. (The web app's
onboarding creates households the same way and displays the code.)

## 3. Pair her phone

1. Install/run the app (`app` configuration in Android Studio, ▶).
2. On the emulator, tap **Server settings** and confirm `http://10.0.2.2:3100/`.
3. Type the 6-digit code and tap **Pair her phone**.

The app then:

- `POST /api/v1/pair {"action":"join","code":"…"}` → household
- `POST /api/v1/household/{id}/sources {"type":"phone","label":"Amma's phone"}`
  → `{id, apiKey}` (shown once, stored in DataStore)
- schedules the 15-minute ingest heartbeat and the 10-minute state poll
- shows **"Khayaal is watching over her — quietly."** and moves on.

From then on the daily view is intentionally near-empty: greeting, one status
card (the backend's own `state.status` string), one big **I'm OK**, a small
**Snooze for an hour**, and a gear. Tapping **I'm OK** calls
`POST /household/{id}/checkin`; Snooze calls `POST /household/{id}/snooze`.

## Signal mapping

| Android event | Signal posted | Value | Notes |
|---|---|---|---|
| Screen unlocked (`ACTION_USER_PRESENT`) | `screen_event` | `"unlock"` | Expedited flush — the strongest "she's up" moment |
| Charger in / out (`ACTION_POWER_CONNECTED/DISCONNECTED` + `BatteryManager` sticky state) | `charging` | `true` / `false` | State-change only; survives reboots |
| Walking / on foot (Activity Recognition; significant-motion sensor fallback) | `motion` | `1` | Never a position; in-vehicle/still are ignored |
| Joined / left home Wi-Fi (SSID match from Settings) | `location_zone` | `"home"` / `"away"` | Presence only. No GPS, no scans, no trail |
| App opened (optional, Usage Access permission) | `app_usage` | `"<package>"` | Package name only, never content; collected in bulk at flush time |
| "I'm OK" tapped | `manual_checkin` | `true` | Plus the dedicated `POST /checkin` call |

**Batching:** every event is queued in DataStore-backed memory and flushed by
a periodic WorkManager job (15 min, network-constrained, battery-friendly).
Unlock and charge events additionally schedule a one-shot flush; only the
unlock flush is expedited (Doze-friendly). On 403 the queue is dropped and a
quiet note appears on the home screen — a rejected key should not loop.

**Demo time-warp:** the backend can skew its clock (`simTimeOffsetMs`). Each
state poll stores the offset, and signal timestamps are shifted to the
backend's clock on upload so the simulator sees coherent data.

## Notifications ("care" tiers)

`CheckInManager` observes the tier on every 10-minute poll (and FCM pushes)
and only speaks when the tier **rises**:

| Tier | Notification | Channel |
|---|---|---|
| 1 — Nudge sent | Soft, silent hello — "Everything okay? 🌼" | `khayaal-care` (IMPORTANCE_DEFAULT) |
| 2 — Check-in asked | "Are you alright?" with **I'm OK** and **Snooze 1h** actions | `khayaal-care` |
| 3 — Needs attention | Full-screen intent, high importance | `khayaal-urgent` (IMPORTANCE_HIGH) |

Tier 1 sits on the DEFAULT channel per spec and is additionally marked
`setSilent(true)`; if you want it truly silent, move it to an IMPORTANCE_LOW
channel. Full-screen intent needs the `USE_FULL_SCREEN_INTENT` grant on
Android 14+ (Settings → Apps → Special access).

## Firebase setup (optional, stub included)

`push/FirebaseService` is wired and ready but dormant — the app works fully
on polling without it. To enable instant pushes:

1. Add `app/google-services.json` from your Firebase project.
2. In **project**-level `build.gradle.kts`, add the plugin:
   `id("com.google.gms.google-services") version "4.4.2" apply false`
3. In **app**-level `build.gradle.kts`, apply it: `id("com.google.gms.google-services")`.
4. Have the backend push data payloads:
   `{"tier":"2","parentName":"Amma","childName":"Aditya","status":"…"}`.

The Gradle plugin is intentionally **not** applied, so the project builds
cleanly without the config file. `onNewToken` has a `TODO(fcm-config)`: the
backend has no device-token endpoint yet (see "What's left").

## Privacy model

- **No `ACCESS_FINE_LOCATION`. Ever.** Presence comes from a home-SSID match
  entered once in Settings; the app never reads GPS, scan results or a trail.
- **No message content, no screen content.** `app_usage` sends package names
  only, and only with explicit Usage Access permission.
- The **child view** lives on the web dashboard and mirrors *state only* —
  score, tier, status strings, check-in times. Raw sensor data, location
  trails and message content never appear there; the phone app doesn't show
  them at all.
- The API key stays in DataStore and travels only in the ingest body.
- Logging is BASIC level in debug builds (method + URL, never bodies).

## What's left

- A real Firebase project + `google-services.json`, and a backend endpoint to
  register FCM device tokens (suggested: `POST /api/v1/household/{id}/devices`).
- Instrumentation tests (the pure-logic unit tests live in `app/src/test`).
- A release signing config, and flipping `cleartextTrafficPermitted` to
  `false` once the production URL is real.
- Optionally a dedicated IMPORTANCE_LOW channel for tier-1 notifications.
