# Khayaal — Development Log

Step-by-step record of how Khayaal was built, newest at the bottom. Khayaal is
passive, dignity-first eldercare monitoring: *"Nothing to press. Nothing to
wear. Nothing to remember."* Monorepo: `apps/web` (Next.js 15), `apps/android`
(Kotlin/Compose), `packages/engine` (pure-TS risk engine), `packages/shared`,
`firmware` (ESP32 + tunnel).

---

## Stage 0 — Concept (deck)
Read the team pitch, extracted the hard constraints: **no camera, no microphone
recording, no reading of message/call content**; the elder's devices only ever
show status + last-active + score trend; zero required action from the elder;
one common signal interface. These constraints still decide every design fight.

## Stage 1 — Landing page (web)
- Built the site web-first: cursor-reactive hero (an illustrated grandmother who
  turns toward your cursor — presence noticed, no camera anywhere), typewriter
  line, glass navbar, pill buttons.
- Scroll story with Planet-Jump-style reveals (blur-rise sections, fact rows,
  side rail), GSAP ScrollTrigger zoom-through portal, anime.js counters.
- Liquid glass tuned from too-opaque to genuinely glassy; footer with the
  unit-system wordmark. Driftbar-derived design language throughout.
- Branding fixed to **Khayaal** everywhere; `homepage_animation.mp4` wired as
  the hero scrub video; header, commas, and text alignment bugs squashed;
  scroll-back overlap of the side rail fixed with a root IntersectionObserver.

## Stage 2 — The engine (packages)
- `packages/shared`: the one contract — `Signal {sourceId, type, value, ts}`,
  households, baseline, tiers.
- `packages/engine`: pure, idempotent `advanceState()` + weighted rule scorer
  (weights 30/28/16/18/20, tiers at 35/55/72). Absence outweighs presence;
  quiet hours cap escalation; low confidence caps the tier; being out
  *softens* other signals instead of hiding them; dwell timers make the ladder
  sequential. 16 unit tests from the spec's scenarios.

## Stage 3 — Dashboard + demo (web)
- Bento dashboard: status, 24-hour score trend, escalation ladder, plain-language
  "why this score", events log, sources. 72/100 gauge rebuilt after arc
  misalignment.
- Demo console with time-warp (`simTimeOffsetMs`) and deterministic scenario
  seeding — hours become seconds on stage.
- Android agent launched in parallel (same UI language as the web).

## Stage 4 — Android app v0.1–0.2
Kotlin/Compose client: pairing by 6-digit code, passive collectors (screen,
motion, charging, steps), WorkManager batched ingest, home screen with live
score. Built via Gradle 8.10.2 / AGP 8.7.3 on JDK 17; first APK.

## Stage 5 — ESP32 room sensor (firmware)
- CSI-based presence sensing (amplitude variance over a rolling window, ported
  from Espressif's esp-csi): variance > threshold → `motion`, quiet → `idle`,
  Wi-Fi down → `lost`. Raw CSI never leaves the device.
- Two transports: USB-serial (JSON lines → the Mac bridge → backend) and direct
  LAN HTTP. Serial CLI (`ssid/pass/host/hh/src/key/mode/thr/cal`) persisted to
  NVS; 60-second empty-room calibration suggests the threshold.
- Personal-hotspot demo documented in `firmware/mac-setup.md` (2.4 GHz, Maximize
  Compatibility, `ipconfig getifaddr en0`).

## Stage 6 — Repo + CI
Pushed everything to `github.com/theguysudo/Khyaal`; GitHub Actions: engine
tests + web build job, Android APK job (artifact upload). Fixed workspace
protocol, tsconfig, and CI's broken Android setup step along the way — green.

## Stage 7 — Instant demo mode
The 24-hour learning phase was removed for time-boxed demos: households seed a
baseline + one day of history at creation, so the engine is fully live the
moment the judge opens it. (Real deployments can still re-enable learning.)

## Stage 8 — Auth-first onboarding
Sign up / Login buttons precede any family registration; hand-rolled Google
OAuth2 (authorization-code, OIDC profile, signed session cookie) because IP
redirect URIs are banned by Google — solved with one-time transfer links that
carry the session from the Mac browser to the phone.

## Stage 9 — 14-slide technical deck
`Khayaal_Technical_Deck.pptx` generated programmatically: architecture, signal
flow, engine, state machine, API surface, privacy stance, Android, ESP32,
verification.

## Stage 10 — The big feature round (all free-tier, no paid APIs)
- **Care circle:** family + trusted neighbours; notify list, claim-by-code.
- **Escalation call chain:** call elder → alert family → neighbours, via the
  native dialer (no Twilio/Exotel) with `callPlan` config and cancel.
- **Commands channel:** messages, reminders, TTS voice notes (Hindi `hi-IN`
  included), check-in requests — app acks delivery.
- **Richer signals:** steps (day-anchored deltas), sleep-aware night rules
  (`sleep_event`), Sleep-Cycle-style sound watch (`sound_event`, loudness only,
  on-device classifier, +15 contribution for loud events at night).
- **AI:** LLM behaviour analysis (OpenRouter/NVIDIA, aggregates only) and the
  in-app "Ask Khayaal" assistant — the backend holds keys, never the app.
- **Rhythm map:** 24-bucket hourly activity on the dashboard.
- **Security pass 1:** AES-256-GCM at rest for signals, HMAC sessions, rate
  limits (pair/ingest/commands), security headers, first pen-test suite
  (15 checks), SECURITY.md.
- **Android v0.3.0** (agent, 43/43 unit tests): night watch FGS, command
  coordinator + TTS, assistant chat, ScoreRing, quick actions, tier-3 alarm
  overlay, KeyStore-encrypted pairing, FCM token registration, call chain,
  "Hey Khayaal" voice commands.

## Stage 11 — Fall detection (CSI)
- Firmware: sharp variance spike (>3× rolling mean, >400 ms) followed by 2 s of
  stillness → one-shot `fall` presence event; state machine settles to idle
  after. `falltest` CLI hook for demos.
- Engine: a fresh fall saturates the score (effect 100) and **bypasses the
  ladder, quiet hours, and the confidence gate** — a fall at 3 am still calls
  the family; an hour-old fall with no movement stays elevated; movement right
  after stands it down. 4 new engine tests (20/20 total).

## Stage 12 — Judge-testable pipeline
`firmware/test-pipeline.sh`: one command, levels `sim` (PTY fake sensor → real
bridge → real backend → tier-3 verified), `enc` (tunnel crypto properties),
`lan` (direct HTTP), `hardware` (real CP2102 board, with the wedged-port replug
hint), and `flash` (erase + reflash). Sim, enc and lan verified live.

## Stage 13 — Security audit + hardening (this round)
Full audit in **[SECURITY_AUDIT.md](SECURITY_AUDIT.md)**; the fixes:
1. **Household authorization** (`lib/server/authz.ts`) — all 15 household routes
   now require a family session or device credentials; anonymous callers get
   404s (existence not confirmable). The `/demo` console and no-login creators
   keep working through a signed, household-bound `kh_demo` cookie that
   authorizes exactly one household for a day. 17 new pen-test checks.
2. **Source mint protected** — pairing code required and rotated on use.
3. **Ingest key mandatory** on plaintext.
4. **LLM endpoints capped + gated** (8 turns × 2000 chars; analysis family-only).
5. **AES-256-GCM communication tunnel** (`enc v1`): HKDF-derived key from the
   source key (never on the wire), identity-bound AAD, server-side replay
   cache, tamper rejection — implemented in the bridge (Python), the server
   (node:crypto), and the ESP32 firmware (mbedtls, `enc` CLI). Verified live:
   sealed accept / replay 409 / tamper 400 / keyless 403 / cross-household 403.
6. **Pen-test grown to 40 checks** — all passing; engine 20/20; Android 43/43;
   CI green. APK rebuilt (v0.3.0, auth headers + pairing code).

## Stage 14 — Live movement interface: CSI scope, room blueprint, Grok (2026-10-26)
1. **Firmware** — the sensor now streams what it computes: a batched `csi`
   event per second (4 slow-window + 4 fast-window variance readings, mean,
   packet rate, threshold, state), alongside the unchanged presence events.
   Fast window (`KH_CSI_FAST_SAMPLES`, ~0.25 s) added so a hand wave shows
   immediately; ring-buffer indexing fixed in `readStats`. Still scalars
   only — raw subcarrier I/Q never leaves the chip. **Status LEDs**:
   `led_controller.{h,cpp}` — green GPIO 27 = fresh CSI data (pulsed,
   rate-limited), pink GPIO 26 = confirmed motion (state machine), red
   GPIO 25 = fault (link lost after being up, or 5 s frame silence past a
   30 s grace). Non-blocking, `csi on|off` CLI. Build green; flash pending
   a physical replug (board unplugged).
2. **Pipeline** — `SignalType` gains `csi` with a bounded numeric-vector
   `meta` (≤32 numbers); the bridge forwards it; the server stores the
   series separately from the signal log (30 min retention) so a 1 Hz stream
   can never evict presence events.
3. **Dashboard** — `GET /household/{id}/csi` returns the flattened 4 Hz
   series, state changes with room labels, per-sensor levels, and a weighted
   position estimate. Two new cards: **Room blueprint** (LLM-draftable floor
   plan, draggable sensor anchors, glowing motion anchors, fading movement
   trail) and **What the sensor hears** (live oscilloscope with threshold
   line, motion shading, event rail). `POST .../motion/narrate` turns the
   sensor log into plain language ("brief pass-through movement rather than
   sustained activity").
4. **LLM** — xAI **Grok** added as a fourth provider (`XAI_API_KEY`);
   request-supplied keys now stay on the provider they belong to; the 429
   backoff actually retries the same model (NIM per-minute throttle); JSON
   mode is best-effort with a prompt-side fallback; dead model id
   `nemotron-3.5-bolt-e4b` replaced after the NIM catalogue rotated
   (verified live against `/v1/models`).
5. **No-hardware demo** — `firmware/tunnel/simulate_csi.py` speaks the real
   wire format over a PTY; `apps/web/scripts/csi_stress.py` benchmarks the
   path. Benchmarks (dev server, sim device + readers): ingest p50 16 ms /
   p95 96 ms, `GET /csi` p50 19 ms / p95 92 ms, 300-post flood fully shed
   by the 120/min limiter, 0×5xx, RSS high-water GC-reclaimable.
6. **Verification** — engine 36/36 (11 new blueprint tests), pen-test
   43/43, pipeline sim 4/4, web typecheck + production build green; both
   cards verified live in the browser with the simulator driving real
   sealed traffic (waveform, blueprint, narration all confirmed on-screen).

## Where things stand
- Landing + dashboard + demo console: live.
- Android v0.3.0 APK: `apps/web/public/khayaal-debug.apk` (+ CI artifact).
- ESP32: firmware carries fall detection, sealed LAN ingest, the live CSI
  stream and the 3-LED controller — built and ready; flash as soon as the
  board is back on USB (`pio run -t upload --upload-port /dev/cu.usbserial-0001`,
  no erase — NVS keeps the Wi-Fi + household config).
- Verification: engine 36/36, Android 43/43, pen-test 43/43, pipeline
  sim/enc/lan green, CSI stress PASS (0×5xx), CI green on every push.
