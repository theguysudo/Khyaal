# Khayaal — Setup Guide

From a clean Mac to the full ecosystem running: web dashboard, Android app,
ESP32 room sensor. Time budget: **web 5 min · Android 15 min · ESP32 20 min**.
For the on-stage script see [FIVE_MINUTE_DEMO.md](FIVE_MINUTE_DEMO.md); for the
security posture see [SECURITY_AUDIT.md](SECURITY_AUDIT.md).

---

## 0. What you need

| Tool | Used by | Check |
|---|---|---|
| Node.js 22 + npm | web, engine | `node -v` |
| Python 3.10+ | ESP32 tunnel, pipeline tests | `python3 --version` |
| pip packages: `pyserial requests cryptography esptool` | tunnel, tests, flashing | `pip3 install pyserial requests cryptography esptool` |
| JDK 17 + Android SDK (platform 35, build-tools 35) | Android app | `java -version` |
| Gradle 8.10.2 | Android app | (this Mac keeps it in `.tools/`) |
| PlatformIO (`pip3 install platformio`) | building the ESP32 firmware | `pio --version` |
| Git | everything | — |

The repo is a npm-workspaces monorepo:

```
apps/web          Next.js 15 dashboard + /api/v1 backend (port 3100)
apps/android      Kotlin/Compose elder-phone app (v0.3.0)
packages/shared   the signal/household contract (TS)
packages/engine   the pure-TS risk engine + state machine
firmware/esp32-csi-sensor   PlatformIO ESP-IDF/Arduino firmware
firmware/tunnel   Mac-side USB-serial bridge + helpers
```

---

## 1. Web dashboard + backend (5 minutes)

```bash
git clone https://github.com/theguysudo/Khyaal.git
cd Khayaal
npm install                     # workspaces: web + shared + engine
npm run build                   # production build of apps/web
npm start                       # serves on http://localhost:3100
#   … or for development: npm run dev
```

Verify: open `http://localhost:3100` → the landing page; `curl localhost:3100/api/v1/server-info`
→ JSON with `lanIp` (the address phones/ESP32 will pair against).

### Optional configuration (`.env.local` in `apps/web/`)

Nothing is required to run the demo. Everything below activates only when its
keys exist — otherwise that channel is a silent no-op.

| Key | What it unlocks | How to get it |
|---|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Sign up / Login with Google | Google Cloud console → OAuth client (Web). Redirect URI must be exactly `http://localhost:3100/api/auth/google/callback` (localhost only — IP URIs are rejected by Google). |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Browser push to the dashboard | `npx web-push generate-vapid-keys` (subject = `mailto:you@example.com`). |
| `OPENROUTER_API_KEY` or `NVIDIA_API_KEY` | LLM behaviour analysis + "Ask Khayaal" | free-tier keys from openrouter.ai / build.nvidia.com |
| `FIREBASE_SERVICE_ACCOUNT_JSON` (or `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`) | Firestore persistence (instead of in-memory) + FCM push to the Android app | Firebase console → project → service account → JSON |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | care-circle email on tier 3 | any free mailbox with SMTP (e.g. Gmail app password) |

After editing `.env.local`, restart the server (`Ctrl-C`, `npm start`).
Households live in memory unless Firestore is configured — **a restart clears
them**, so re-create (2 minutes, see step 2).

### Create a family

Browser → `http://localhost:3100/onboarding` → **Sign up with Google** (or skip
and just create) → create the family. Demo mode is **instant**: baseline and a
day of history are seeded, the engine is live immediately. You land on the
household dashboard — bookmark that URL.

---

## 2. Android app (15 minutes)

**Easiest:** the prebuilt APK ships in the repo and is served by your server:
`http://<mac-lan-ip>:3100/khayaal-debug.apk` — open that URL on the phone
(same Wi-Fi), install, allow "unknown sources".

**Build it yourself:**

```bash
cd apps/android
# this Mac's pinned toolchain:
JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
  ~/.config/khayaal/gradle-8.10.2/bin/gradle assembleDebug   # adjust to your Gradle 8.10.2
# APK → app/build/outputs/apk/debug/app-debug.apk
# unit tests: … gradle testDebugUnitTest        (43 tests)
```

CI also uploads the APK artifact on every push to
`github.com/theguysudo/Khyaal → Actions → Android debug build`.

**Pair it:**

1. Phone on the **same Wi-Fi** as the Mac (personal hotspot works too — see
   the ESP32 section for hotspot notes).
2. App → server address `http://<mac-lan-ip>:3100`
   (emulator only: `http://10.0.2.2:3100`).
3. Enter the 6-digit pairing code — shown on the onboarding success screen.
   The app registers as a `phone` source and starts reporting screen, motion,
   charging and steps passively. Its pairing record is AES-256-GCM sealed in
   the Android KeyStore.
4. Watch the dashboard: last-activity updates, Rhythm map fills, the app's
   **I'm OK** logs a check-in, and dashboard → **Reach her phone** sends
   messages/reminders/TTS (the **हिं** toggle speaks Hindi, `hi-IN`).

---

## 3. ESP32 room sensor (20 minutes)

Hardware: original ESP32-WROOM-32 dev board (micro-USB, CP2102/CH340).

```bash
# one-time: install PlatformIO (verified with Core 6.2.0, Python 3.12)
pip3 install --user platformio
pio run -d firmware/esp32-csi-sensor          # builds firmware.bin
```

**Flash (one command — erases then writes):**

```bash
bash firmware/test-pipeline.sh flash
```

If the port fails with `Invalid argument (22)`, the macOS CP2102 driver is
wedged — **unplug, count to five, plug back in**, retry. No software fix works.

**Configure (serial monitor at 115200, e.g. `screen /dev/cu.usbserial-0001 115200`):**

The easy path is the dashboard: household → **Sources** card → **+ Add room
sensor (ESP32)** → a panel prints these five lines with real values filled in
(the key is shown once):

```
mode lan
host http://<mac-lan-ip>:3100
hh <householdId>
src <sourceId>
key <apiKey>
```

Then verify and calibrate:

```
show      → state=idle  wifi=up  encrypt=on  time=synced
cal       → 60 s empty-room log, ends with a suggested threshold
thr <suggested>
falltest  → one-shot fall event (the demo hook)
```

Walk past the board → the dashboard's Sources card shows the sensor green and
`motion` events land. `falltest` → instant tier-3 escalation with the full
call-chain plan.

**Wi-Fi notes:** the board must associate to a 2.4 GHz AP even in serial mode
(the AP's traffic is the sensing "illumination"). Personal hotspots work —
on iPhone enable **Maximize Compatibility**; details in `firmware/mac-setup.md`.

**Tunnel alternative (no device HTTP at all):** leave the transport in the
default `serial` mode and run the Mac-side bridge, which seals everything with
AES-256-GCM before POSTing:

```bash
python3 firmware/tunnel/register_source.py        # writes firmware/tunnel/config.json
python3 firmware/tunnel/khayaal_serial_bridge.py  # forwards USB events, sealed
```

---

## 4. Prove it all works

```bash
npm test                                      # engine: 20 scenarios
bash apps/web/scripts/pentest.sh              # 40 security checks (server must be up)
bash firmware/test-pipeline.sh                # sim + enc + lan + hardware probe
bash firmware/test-pipeline.sh enc            # tunnel crypto properties only
bash firmware/test-pipeline.sh sim            # fake sensor → real bridge → engine (no hardware)
```

CI runs the engine/web job and the Android APK job on every push.

---

## 5. Troubleshooting

| Symptom | Fix |
|---|---|
| `EADDRINUSE :::3100` | an old server is still holding the port: `kill $(lsof -tnP -iTCP:3100 -sTCP:LISTEN)` then `npm start` |
| Dashboard suddenly 404s | the server restarted and memory cleared — re-create the household (prep takes 5 min, see FIVE_MINUTE_DEMO.md) |
| Serial `Invalid argument (22)` on every baud | wedged CP2102 — physical replug, then retry |
| Phone app: "couldn't reach home" | both devices on the same network; use the LAN IP from `/api/v1/server-info`, not `localhost` (and `10.0.2.2` only inside the emulator) |
| Google sign-in `state-mismatch` | cookies blocked, or you are on a different origin than the registered redirect URI (localhost only) |
| `pair` returns 429 | rate limit (10/min) — wait a minute; it exists to stop household spam |
| Sensor `show` says `wifi=down` | 5 GHz network, or hotspot lost — re-join (2.4 GHz / Maximize Compatibility) and `show` again |
| `encrypt=off` unexpectedly | someone ran `enc off` — send `enc on` from the serial monitor |
| FCM/email alerts don't arrive | those channels are no-ops without `FIREBASE_*` / `SMTP_*` env; browser push and the app's alarm overlay work without any keys |
