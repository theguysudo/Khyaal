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
