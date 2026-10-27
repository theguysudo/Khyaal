# Khayaal — the 5-minute demo

Everything fiddly happens **before** the judges sit down. The 5 minutes are
pure theatre: one phone lying face-down on a desk, one ESP32 board in the
corner, one dashboard on the screen.

---

## Part 1 — Prep (do this once, ~15 minutes, not on stage)

> **Do not restart the server after prep** — households live in memory. If it
> ever restarts, redo steps 2–5 (takes 5 minutes with this checklist).

1. **Server:** `cd ~/HIET/khayaal/apps/web && npm start` → keep the terminal open.
2. **Household:** browser → `http://localhost:3100/onboarding` → **Sign up with
   Google** → create the family (instant mode, no learning wait). You land on
   the dashboard. Bookmark it — this URL is your demo home.
3. **Dashboard setup (2 minutes):**
   - **Alerts on this device** card → *Enable urgent alerts here* → allow. This
     is the free browser-push channel (VAPID, already configured).
   - **Care circle** card → add one member (name + any email, role Neighbour).
   - **Sources** card → **+ Add room sensor (ESP32)** → a panel appears with
     `mode lan / host / hh / src / key` — keep it open for step 4. The key is
     shown exactly once.
4. **ESP32 (needs the board once):**
   - If the port errors with `Invalid argument`: unplug the board, count to
     five, plug it back. (macOS CP2102 driver state bug — no software fix.)
   - `bash firmware/test-pipeline.sh flash`
   - Serial monitor: `screen /dev/cu.usbserial-0001 115200` (or Arduino IDE)
   - Paste the five lines from the dashboard panel, then: `show` → expect
     `state=idle  wifi=up  encrypt=on`. Type `falltest` but **don't press
     Enter yet**. Leave the monitor open.
   - Phone hotspot alternative to your home Wi-Fi: 2.4 GHz, "Maximize
     Compatibility" ON — see `firmware/mac-setup.md`.
5. **Phone (Track B):** install
   `http://<mac-lan-ip>:3100/khayaal-debug.apk` (or the button on the
   onboarding success screen) → same Wi-Fi as the Mac → app → server address
   `http://<mac-lan-ip>:3100` → paste the 6-digit pairing code from the
   onboarding success screen. The home screen shows her score. Set the phone
   face-down on the desk.
6. **Browser tabs:** dashboard (home) + `http://localhost:3100/demo` (console).
7. **Dry run (60 seconds):** press Enter on `falltest`, watch tier 3 + the
   phone's full-screen alarm + the browser notification, then click
   **checked in** on the dashboard and confirm everything stands down.

## Part 2 — The run of show (5:00)

**0:00–0:30 · The premise.**
Phone face-down on the desk, board in the corner. *"She hasn't pressed a
button, worn a gadget, or remembered a thing — and the family already knows
all is well."* Point at the dashboard: status "fine", the rhythm map filling
hour by hour, last-activity timestamp.

**0:30–1:15 · Signals, not surveillance.**
*Why this score* card — plain language, no jargon. Sources card: her phone +
the room sensor, both green. The promise: **no camera, no microphone
recording, no message content — ever**; signals are AES-256-GCM encrypted at
rest, discarded after 7 days. If asked about the tunnel: `bash
firmware/test-pipeline.sh enc` prints sealed-accepted / replay-rejected /
tamper-rejected in ~15 seconds.

**1:15–2:15 · Reach her phone (Track B live).**
Pick the phone up: score ring, steps today, quick actions. On the dashboard →
**Reach her phone** → switch to the **हिं** toggle → type a Hindi reminder →
Voice (spoken aloud) → Send. The phone **speaks it in Hindi** (hi-IN TTS).
Then **Ask Khayaal** on the phone: *"meri dawai ka time batao"* — the assistant
answers (server holds the LLM key; the app never does).

**2:15–3:00 · She's fine — one tap, zero effort.**
Tap **I'm OK** on the phone → the dashboard logs the check-in instantly.
Mention the night-watch toggle (opt-in, loudness only, on-device, audio never
leaves the phone).

**3:00–4:15 · The moment that matters (Track D live).**
Press **Enter** on `falltest` in the serial monitor. Within seconds:
- dashboard → tier 3, "**needs attention**", the call-chain plan visible
  (call her → alert family → neighbours) with circle names;
- phone → full-screen alarm overlay with the cancel action;
- Mac → browser-push notification (tab closed or in background).
Say: *"the room sensor felt an impact pattern followed by stillness — and a
fall skips the whole ladder, even at 3 am. No wearables, no cameras — just
the Wi-Fi already in the room."*

**4:15–4:45 · Stand down + audit trail.**
Click **checked in** on the dashboard → everything de-escalates. The **Quiet
log** shows the full story as plain sentences.

**4:45–5:00 · Close.**
*"Zero new interfaces for her. The family gets a ladder, not a feed. Every
channel is free — native dialer, FCM, VAPID, SMTP — nothing to subscribe to.
One command (`firmware/test-pipeline.sh`) re-proves the entire pipeline:
sensor → sealed tunnel → engine → escalation."*

## If something wobbles on stage
- **Dashboard 404s:** the server restarted → redo prep steps 2–5 (5 min).
- **falltest, nothing happens:** `show` in the monitor — if `wifi=down`, the
  hotspot dropped; use the dashboard **Wi-Fi** panel on the sensor chip to
  re-join (or re-send via serial). If `encrypt=off`, re-paste the block.
- **Phone app can't reach the server:** both devices must be on the same
  network; re-check the server address (`http://<mac-lan-ip>:3100`).
- **Need a guaranteed tier-3 without hardware:** the `/demo` tab → Emergency
  scenario → then open the dashboard household it created.
