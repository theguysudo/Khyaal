# Khayaal ESP32 CSI room sensor (firmware)

Wi-Fi CSI presence sensor for the Khayaal eldercare monitor. The board
associates to a 2.4 GHz access point, measures how much the Wi-Fi channel
between the AP and itself is perturbed (amplitude variance of CSI
subcarriers), and reports a **presence** signal — never raw CSI.

- `motion` — variance above threshold for more than 2 s
- `idle`   — quiet for more than 10 min (heartbeated every 30 s)
- `lost`   — Wi-Fi link down

Two transports, selectable at runtime (`mode <lan|serial>`, persisted to NVS)
or at build time (`include/config.h`):

1. **SERIAL (default, the tunnel)** — one JSON line per event on USB serial:
   `{"type":"presence","value":"motion","ts":1730000000000}`.
   The Mac-side script `../tunnel/khayaal_serial_bridge.py` forwards it to the
   backend. Zero HTTP on the device, zero network setup.
2. **LAN** — HTTP POST to `<host>/api/v1/ingest` with household/source/apiKey
   (all settable over the serial CLI, stored in NVS). 5 s timeout, exponential
   backoff up to 60 s, newest event coalesced while retrying.

Hardware: original ESP32-WROOM-32 dev board (micro-USB, CP2102/CH340 bridge).

## Build & flash

```bash
# one-time: install PlatformIO (verified with Core 6.2.0, Python 3.12)
pip3 install --user platformio

pio run              # build (espressif32 platform, arduino framework)
pio run -t upload    # flash over USB
pio device monitor   # 115200 baud; type `help`
```

Prefer a full erase on a fresh/unknown board before uploading (see
`../mac-setup.md` for the esptool route and the exact commands used on this
Mac):

```bash
python3 -m esptool --port /dev/cu.usbserial-0001 erase-flash
pio run -t upload
```

## First bring-up (serial mode)

1. Flash, open `pio device monitor`.
2. `ssid <name>` and `pass <password>` — any 2.4 GHz AP works; it does **not**
   need internet (CSI frames from the AP are the sensor's signal source; the
   AP's traffic is what gets perturbed by people moving).
3. `cal` — leave the room empty and still for the 60 s run; note the
   suggested threshold (≈ 2 x the idle p95 variance).
4. `thr <suggested>` — then walk around; the 5 s status line's `var` should
   exceed the threshold while you move.
5. On the Mac: `python3 ../tunnel/khayaal_serial_bridge.py` (uses
   `../tunnel/config.json`; add `--dry-run` to inspect first).

## LAN mode

```
host http://192.168.1.20:3100     # this Mac's LAN IP, port 3100
hh hh_xxxxxxxx-xxxxxxxx
src src_xxxxxxxx-xxxxxxxx
key sk_xxxxxxxx-xxxxxxxxxxxxxx-xxxxxxxx
mode lan
```

Get the ids + key with `python3 ../tunnel/register_source.py` (the key is
shown once). In LAN mode without NTP the payload omits `ts`; the backend
stores the arrival time. With NTP (internet on the AP) the firmware stamps
epoch ms itself.

## Serial CLI reference

| command | effect |
| --- | --- |
| `help` | list commands |
| `show` | effective config (secrets masked) + sensor state |
| `cal` | 60 s variance log with threshold suggestion |
| `thr <f>` | set motion threshold (NVS) |
| `ssid <s>` / `pass <p>` | Wi-Fi credentials (NVS), reconnects |
| `host <url>` | LAN backend base URL (NVS) |
| `hh <id>` / `src <id>` / `key <sk>` | ingest identity (NVS) |
| `mode <lan\|serial>` | transport (NVS) |
| `csi <on\|off>` | live scope stream (default on) |
| `factory` | wipe NVS, restore compiled defaults |

Log lines are `[<ms>] ...`; event lines are raw JSON — that is how the bridge
tells them apart.

## Status LEDs

Three LEDs on the dev kit's GPIO headers, active-HIGH through series
resistors to common GND (`led_controller.{h,cpp}`, all `millis()`-based and
non-blocking):

| LED | pin | driven by | meaning |
| --- | --- | --- | --- |
| Green | GPIO 27 | `readStats()` returning true | fresh CSI data is flowing — one short pulse per accepted sample, rate-limited; dark = no frames |
| Pink | GPIO 26 | the presence state machine | confirmed Motion (or Fall) — not per-frame activity |
| Red | GPIO 25 | fault logic in `tick()` | Wi-Fi dropped after having been up, or no frames for 5 s while the link is up past a 30 s startup grace; clears itself when the condition ends |

## How the CSI pipeline works

Ported minimally from Espressif's [esp-csi](https://github.com/espressif/esp-csi)
(the reference implementation, ESP-IDF based):

- `esp_wifi_set_csi_*` makes the Wi-Fi driver deliver per-frame Channel State
  Information: per-subcarrier I/Q amplitudes of the long training field.
- Each frame collapses to one number: the mean subcarrier amplitude
  (`src/csi_sensor.cpp`, skipping the invalid first word when flagged).
- A rolling window of the last 100 frame-means feeds a variance estimate;
  at typical AP traffic the window spans roughly 0.5–2 s.
- People moving between the AP and the sensor perturb subcarrier phases and
  hence amplitudes faster than an empty room — variance rises above the
  (calibrated) threshold.

Frames are filtered to the associated AP's BSSID by default
(`KH_CSI_FILTER_AP_BSSID` in `include/config.h`), so laptops and phones on
other links do not pollute the baseline.

Privacy: derived scalars only — the presence state and the batched
variance readings the live scope draws; `buf`/raw CSI (per-subcarrier I/Q)
stays on-chip. The only strings ever transmitted are the JSON presence and
`csi` events shown above.

## Layout

```
esp32-csi-sensor/
  platformio.ini        # espressif32 + arduino, esp32dev
  include/config.h      # compiled-in defaults (documented knobs)
  src/main.cpp          # setup/loop, Wi-Fi, serial CLI, both transports
  src/csi_sensor.[ch]   # CSI capture + amplitude variance (esp-csi port)
  src/presence.[ch]     # motion/idle/lost state machine
  src/config_store.[ch] # NVS-backed runtime config (Preferences)
```
