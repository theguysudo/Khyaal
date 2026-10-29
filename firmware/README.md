# Khayaal room sensor — ESP32 Wi-Fi CSI (real firmware)

The room sensor is **optional**. Khayaal degrades gracefully to phone-only;
adding the ESP32 raises confidence (and adds a `presence` signal the engine
already understands). The sensor reads Wi-Fi **CSI** (Channel State
Information) amplitude variance — no camera, no microphone, nothing worn.
**Privacy is a hard constraint: only derived scalars leave the device —
the presence state and batched variance readings for the live scope; raw CSI
(subcarrier I/Q) never does.**

## Layout

```
firmware/
  README.md                        <- you are here
  mac-setup.md                     # macOS bring-up on this machine (verified)
  esp32-csi-sensor/                # PlatformIO project (espressif32, esp32dev)
    platformio.ini
    include/config.h               # compiled-in defaults (all knobs documented)
    src/main.cpp                   # Wi-Fi, serial CLI, both transports
    src/csi_sensor.[ch]            # CSI capture + amplitude variance (esp-csi port)
    src/presence.[ch]              # motion/idle/lost state machine
    src/config_store.[ch]          # NVS-backed runtime config
  tunnel/                          # the USB-serial path (zero network setup)
    khayaal_serial_bridge.py       # JSON lines over USB -> POST /api/v1/ingest
    register_source.py             # (re)register an esp32 source, write config.json
    config.json                    # real household/source/apiKey (shown once)
    config.example.json
```

## The contract

The firmware is just another source: it sends `presence` events to the same
endpoint as the web demo's `SimulatedCsiSensor` — nothing in the engine or
API changes when the real sensor replaces the simulator.

```json
{"householdId":"hh_…","sourceId":"src_…","apiKey":"sk_…",
 "type":"presence","value":"motion","ts":1730000000000}
```

`value` is `motion` | `idle` | `lost`. Register a source with:

```bash
curl -s -X POST http://localhost:3100/api/v1/household/<householdId>/sources \
  -H 'Content-Type: application/json' -d '{"type":"esp32","label":"Room sensor (ESP32)"}'
# response contains the apiKey — shown once — or just run tunnel/register_source.py
```

## Quickstart (this Mac)

```bash
# 1. build (toolchain cached; first run downloads ~1 GB)
cd esp32-csi-sensor && ~/Library/Python/3.12/bin/pio run

# 2. flash (identify the port first; erase a fresh board — see mac-setup.md)
python3 -m esptool --port /dev/cu.usbserial-0001 erase-flash
pio run -t upload && pio device monitor

# 3. configure Wi-Fi from the monitor (2.4 GHz; internet not required)
#    ssid <name>   /   pass <password>   /   cal   /   thr <suggested>

# 4. run the tunnel (terminal 2)
cd ../tunnel && python3 khayaal_serial_bridge.py
```

Two transports, both implemented (`mode <lan|serial>` on the device CLI):

- **serial** (default): one JSON line per event over USB; the Python bridge
  fills in household/source/apiKey, stamps `ts` when the device had no NTP,
  and POSTs to `http://localhost:3100/api/v1/ingest`. Reconnects on
  disconnect, retries with backoff, `--dry-run` supported.
- **lan**: the device POSTs directly (5 s timeout, exponential backoff up to
  60 s). Needs `host`/`hh`/`src`/`key` set on the device CLI.

State machine (deliberately dumb — the intelligence lives server-side):
variance above threshold for > 2 s -> `motion`; quiet > 10 min -> `idle`;
Wi-Fi down -> `lost`; heartbeat every 30 s. Threshold lives in NVS/config;
`cal` logs variance for 60 s and suggests one (~2x idle p95).

## Status LEDs — the scenario language (v1.2.0)

Three LEDs answer three questions: **green = how is the board talking to the
world**, **red = what is the room doing**, **pink = what just happened to the
board**. The design rule that killed the old "blank board" bug: an idle board
in the demo default (serial/USB mode) is **never dark** — green breathes and
red glows faintly. All patterns are `millis()`-based and non-blocking
(`src/led_controller.{h,cpp}`); green and pink ride PWM too, so a breath is a
real ramp.

### GREEN (GPIO 27) — connectivity

| State | Pattern |
| --- | --- |
| Wi-Fi linked AND CSI frames flowing (LAN mode healthy) | solid |
| Serial/USB mode (the demo default; the USB cable is the link, healthy even with Wi-Fi down) | slow breath, ~2 s period |
| Wi-Fi connecting, or linked but no frames yet | double-flash every ~3 s |
| Bluetooth Classic SPP mode (server up) | fast blink |
| No link at all (LAN mode, Wi-Fi down; BT mode, SPP failed) | off (pink shows the fault solid) |

### RED (GPIO 25, PWM) — the room

| State | Pattern |
| --- | --- |
| No CSI at all (no frames / no AP) | off |
| Watching — CSI alive, room quiet (classifier says still) | faint breath, ~6 s period (duty ~4-35) |
| Gentle / active / busy (activity class, below) | PWM glow: class floor duty ~60 / ~140 / ~220, instant motion level rides on top, IR detection holds a ~140 floor |
| Fall detected (confirmed, latched ~30 s) | solid full red after the acute phase |
| SOS ACTIVE — first ~10 s after a confirmed fall | fast strobe ~4.5 Hz (SOS beats everything on red; not dimmed at night) |

### PINK (GPIO 26, PWM) — events & system

| State | Pattern |
| --- | --- |
| Presence verdict change (motion starts, room goes quiet, link lost) | single short pulse (~110 ms) |
| New identity typed into the board (`hh`/`src`/`key` — the relay's pairing moment) | double pulse, snappy, full brightness; repeats within ~3 s coalesce into one |
| SOS triggered (confirmed fall) | triple pulse |
| Inactivity watchdog nudge (still=1, every 5 min) | soft double pulse (long, dim) — deliberately not the snappy identity pattern |
| Calibration (`cal`) running | slow sweep 0->100->0, ~2.4 s |
| Link/sensor fault — Wi-Fi dropped after having been up, or no frames for 5 s while linked past the 30 s startup grace | solid (beats every pulse; not dimmed at night) |

### Override rules (deterministic)

- Red: SOS strobe > fall solid > IR floor > activity-class floor > instant
  level > watching breath > off.
- Pink: fault solid > calibration sweep > pulses (SOS triple > identity
  double > watchdog soft double > presence single). A fault clears any pulse
  mid-flight and lasts until it clears itself.
- Night mode (quiet hours, `KH_QUIET_START/END_HOUR` = 22-06 to mirror the
  engine's QuietHours; board clock is UTC, so set the offset with `tzh` or
  `KH_TZ_OFFSET_HOURS`): everything dims to ~30% EXCEPT the red SOS
  strobe/solid and the pink fault solid — an alarm at night must still wake
  someone. Without NTP sync the board cannot know the hour, so no dimming.
- `ledtest` plays a scripted run of every scenario above (~2.5 s each,
  ~45 s total) and prints each name over serial; run it again to stop.

### Activity classifier (feeds red, status, presence meta)

The last 60 s of 1 Hz variance samples are classified against the room's OWN
baseline — the quietest second in the window (floored at 0.5 variance units):
ratio r = p90(window) / quietest-second; `r < 2.5` still, `< 6` gentle,
`< 15` active, else busy. Two calibrated anchors guard under-classing: p90
at/above `thr` is at least active, at 2x `thr` busy. The class is the red
LED floor, appears in `show`/`statusjson`/the per-second log line as
`act=`, rides every presence event as `meta.act`, and the CSI scope stream
as `meta.act`.

### Inactivity watchdog

Outside quiet hours, `stillmin` minutes (default 45; `stillmin 0` disables;
session-only) without a variance sample above the motion threshold sets
`still=1` in status/meta and pulses the soft pink double every 5 min. Any
motion resets it; entering quiet hours resets it too. Per-boot heuristic —
nothing persisted.

### Fall confidence gate

The state machine's spike-then-stillness verdict is only emitted when the
evidence corroborates: >= 2 spike samples (variance above threshold AND above
3x the room baseline, >= 400 ms apart) inside a 10 s window, plus one
independent witness — the IR beam, or a fast-window (~0.25 s) jump above the
threshold. The decision and its evidence counts are logged (`fall CONFIRMED:
confidence 2/2 (spikes=3 fast-jumps=4 ir=no)`). `falltest` bypasses the gate.

### New serial commands (grammar otherwise unchanged)

```
ledtest          play every LED scenario (~45 s, prints each name); again = stop
stillmin <0-720> inactivity watchdog minutes (0 off; default 45; session only)
tzh <-12..14>    UTC offset for quiet hours (default 0; session only)
```

`statusjson` gained (additively — the relay's parser still works):
`up` (uptime s), `heap`, `act`, `still`, `stillmin`, `fconf`, `night`,
`led` ("green=breath red=watching pink=off"). `show` prints the same plus
the classifier thresholds. Presence events gained
`"meta":{"act":"gentle","still":0,"stillmin":12,"fconf":0}` — the server's
`parseIngest` already sanitizes and passes the bag through.

## Hardware notes

- Board: **ESP32-WROOM-32** dev board (classic, micro-USB, CP2102 bridge —
  the one on this Mac is a CP2102, `10C4:EA60`).
- Wi-Fi: **2.4 GHz only**; the AP needs no internet. Placement: fixed,
  elevated, room-to-be-sensed **between** the AP and the board.
- If `/dev/cu.usbserial-0001` throws `tcsetattr` errors, the CP2102 DEXT is
  wedged — unplug/replug (details in `mac-setup.md` section 2a).

## What the engine does with presence

- `motion` counts as activity and resets escalation.
- A registered-but-quiet sensor during waking hours contributes up to 18
  points ("the room sensor has felt no movement for X").
- If no sensor is paired, confidence drops 15 % instead — no penalty.
- The engine's silence signal notices a missing sensor (no heartbeats).

## Calibration (in the actual demo room)

With the room empty: `cal` in the serial monitor -> note the suggested
threshold -> `thr <value>` -> verify with a walk test. Re-calibrate whenever
the sensor or AP moves; walls and furniture change the baseline. Full
walkthrough: `mac-setup.md` section 6, reference: `esp32-csi-sensor/README.md`.
