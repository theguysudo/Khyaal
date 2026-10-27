# macOS setup — Khayaal ESP32 room sensor

Everything below was executed and verified on this machine (Apple Silicon,
macOS Darwin 25.6.0) on 2026-10-23, except the steps that need your hands
(unplug/replug, standing in the room). Tool versions are the ones actually
installed here.

## 1. What is already on this Mac

| tool | version | how to invoke |
| --- | --- | --- |
| Python | 3.12.3 | `python3` (/usr/local/bin/python3) |
| esptool | 5.3.1 | `python3 -m esptool …` (module already installed) |
| PlatformIO Core | 6.2.0 | `~/Library/Python/3.12/bin/pio` |
| pyserial | 3.5 | used by the bridge |
| requests | 2.32.3 | used by the bridge |
| Command Line Tools | clang 17.0.0 | — |

Install/refresh commands if you ever need them (no sudo required):

```bash
pip3 install --user esptool      # CLI entry points (module already present)
pip3 install --user platformio   # -> ~/Library/Python/3.12/bin/pio
```

`pip3 --user` puts binaries in `~/Library/Python/3.12/bin` — add it to PATH
if `pio` is not found.

## 2. Identify the board

```bash
ls /dev/cu.*                     # -> /dev/cu.usbserial-0001 (plus BT/debug ports)
system_profiler SPUSBDataType | grep -A5 -i silabs
ioreg -p IOUSB -l -w 0 | grep -iE '"USB (Product|Vendor) Name"'
```

What this Mac actually has (verified):

- `/dev/cu.usbserial-0001` — **Silicon Labs CP2102 USB-UART bridge**
  (USB VID:PID `10C4:EA60`, serial number `0001`), i.e. the micro-USB
  ESP32-WROOM-32 dev board. The CP2102 driver is Apple's built-in DriverKit
  DEXT (`com.apple.DriverKit-AppleUSBSLCOM`) — no vendor driver needed.
- Sanity probe (read-only, never flashes):

  ```bash
  python3 -m esptool --port /dev/cu.usbserial-0001 chip-id
  # -> "Chip is ESP32-D0WD..." / "Crystal is 40MHz" / "MAC: ..."
  ```

  esptool v5 renamed commands to hyphens (`chip-id`, `erase-flash`,
  `write-flash`); the old underscore names still work but print deprecation
  warnings.

### 2a. If the port is wedged (this happened today)

Symptom seen on this Mac right now:

```
termios.error: (22, 'Invalid argument')   # any tcsetattr, at every baud rate
```

Diagnosis that pinned it down (all verified):

```bash
stty -f /dev/cu.usbserial-0001        # reads settings OK (speed 9600)
stty -f /dev/cu.usbserial-0001 9600   # tcsetattr: Invalid argument
lsof | grep usbserial                 # no process holds the port
ioreg -r -c IOUSBHostDevice -l -w 0 | grep -B2 -A8 usbserial
#   "IOUserClass" = "AppleUSBSLCOM"  (Apple's DriverKit serial DEXT)
```

Writes are accepted by the driver but no data flows back, and the chip never
answered a hand-rolled esptool sync — the DEXT instance is stuck. Fixes, in
order of preference:

1. **Unplug and replug the board** (10 s) — re-enumerates the USB device and
   restarts the DEXT cleanly.
2. No-sudo alternative: log out/in of macOS, or reboot.
3. With sudo: `sudo pkill -f AppleUSBSLCOM` — launchd restarts the DEXT
   immediately (this is the same thing a replug does, minus the replug).

Verify recovery with the pyserial one-liner:

```bash
python3 -c "import serial; s=serial.Serial('/dev/cu.usbserial-0001',115200); print('port OK'); s.close()"
```

## 3. Build the firmware (verified)

```bash
cd /Users/aditya/HIET/khayaal/firmware/esp32-csi-sensor
pio run
```

Verified result on this machine: **[SUCCESS]** with `espressif32 8.0.0`,
Arduino core 3.3.12 (ESP-IDF 5.5), toolchain xtensa-esp-elf 14.2.0. First
build downloads ~1 GB of toolchain (took ~17 min here); after that it is
~30 s. Artifacts: `.pio/build/esp32dev/firmware.bin` (~1.05 MB).

The firmware uses the Arduino framework for Wi-Fi/HTTP/serial and calls the
ESP-IDF CSI API directly (`esp_wifi_set_csi*`) — the same pipeline as
Espressif's esp-csi, ported in `src/csi_sensor.cpp`. An ESP-IDF-only build
would work too but is not required (see `esp32-csi-sensor/README.md`).

## 4. Flash

Only flash a port you have identified (step 2) — `/dev/cu.usbserial-*`
should be the ESP32, never your other USB devices.

```bash
cd /Users/aditya/HIET/khayaal/firmware/esp32-csi-sensor

# policy: fully erase first on a fresh/unknown board
python3 -m esptool --port /dev/cu.usbserial-0001 erase-flash
# or: pio run -t erase

# flash (uses PlatformIO's bundled esptool 5.4 with the right offsets)
pio run -t upload

# watch it boot; type `help` in the monitor for the config CLI
pio device monitor            # 115200 baud
```

Pure-esptool alternative (offsets are the standard ESP32-Arduino layout):

```bash
cd .pio/build/esp32dev
python3 -m esptool --port /dev/cu.usbserial-0001 --baud 460800 write-flash \
  0x1000  bootloader.bin \
  0x8000  partitions.bin \
  0xe000  boot_app0.bin \
  0x10000 firmware.bin
```

Today's status: the port was wedged (2a), so flashing is documented but was
not performed. After a replug, `chip-id` → `erase-flash` → `upload` is the
whole flow.

## 5. Give the sensor a 2.4 GHz network

The radio must **associate to an AP** to receive CSI frames — even in serial
mode. The AP does **not** need internet (NTP is optional; without it the
firmware omits `ts` and the serial bridge stamps it). 5 GHz-only networks do
not work: CSI on ESP32 is 2.4 GHz.

Options, most demo-friendly first:

1. **Home router 2.4 GHz SSID** — most routers broadcast one (often named
   `…-2.4G`, or a guest network which is usually 2.4 GHz).
2. **iPhone hotspot** — Settings → Personal Hotspot → enable **Maximize
   Compatibility** (forces 2.4 GHz), then use the phone's name as SSID.
   Cellular data can stay off.
3. **macOS Internet Sharing** — System Settings → General → Sharing →
   Internet Sharing. Caveat on Apple Silicon: you cannot share Wi-Fi → Wi-Fi;
   the upstream must be Ethernet/USB-LAN (or an iPhone plugged into USB),
   shared *to* Wi-Fi, which then acts as a soft AP.

Configure the credentials from the serial monitor (persisted to NVS):

```
ssid <name>
pass <password>
```

## 6. Placement + threshold calibration (do this in the real demo room)

1. Mount the board: fixed position (tape/stand, not loose), 1–3 m from the
   AP with the **room to be sensed between the AP and the board**, elevated
   (shelf top), not touching metal, away from microwave/fridge/aquarium.
   The Wi-Fi link crosses the room — that link is the sensor.
2. Power over USB (Mac, charger, or power bank).
3. Open `pio device monitor`, wait for `wifi up … ap=…` and the 5 s status
   lines showing `pkt/s` well above 0.
4. Empty the room (and stay still yourself), then:

   ```
   cal
   ```

   The sensor logs variance every 250 ms for 60 s and prints
   `mean/min/max/p95` plus a **suggested threshold ≈ 2 × idle p95**.
5. Apply it: `thr <suggested>` (saved to NVS).
6. Verify: walk around the room — the status line's `var` should clearly
   exceed the threshold while you move; stop for a minute and watch it drop
   back. The device emits `motion` after 2 s above threshold and `idle`
   after 10 quiet minutes.
7. Walls, furniture and the AP itself all change the baseline — **repeat the
   calibration whenever the sensor or AP moves**.

## 7. The two transports

### a) USB serial bridge (default; zero network setup)

Device prints one JSON line per presence event; the Mac forwards it:

```bash
cd /Users/aditya/HIET/khayaal/firmware/tunnel
python3 khayaal_serial_bridge.py --dry-run      # inspect enriched payloads
python3 khayaal_serial_bridge.py                # auto-detects /dev/cu.usbserial-*
python3 khayaal_serial_bridge.py --port /dev/cu.usbserial-0001
```

Identity comes from `config.json` (regenerate with
`python3 register_source.py` — the demo server keeps state in memory, so a
server restart changes household/source ids). Robustness verified today:
auto-reconnect on disconnect, retries with backoff on network errors, no
retry on 4xx (logged instead), boot-banner/log lines passed through.

### b) LAN mode (device POSTs HTTP itself)

On the Mac, get your LAN IP and make sure the server accepts LAN traffic:

```bash
ipconfig getifaddr en0          # e.g. 192.168.1.20
```

If macOS's firewall blocks incoming port 3100, allow it in System Settings →
Network → Firewall (or disable for the demo).

On the device (`pio device monitor`):

```
host http://192.168.1.20:3100   # <your Mac's LAN IP>
hh hh_xxxxxxxx-xxxxxxxx
src src_xxxxxxxx-xxxxxxxx
key sk_xxxxxxxx-…-xxxxxxxx
mode lan
```

(Identity from `register_source.py` output / `tunnel/config.json`.) The
device POSTs to `/api/v1/ingest` with a 5 s timeout and exponential backoff
(1 s → 2 s → … → 60 s) while Wi-Fi is up; events coalesce to the newest when
the server is unreachable.

## 8. End-to-end validation checklist

Verified today (2026-10-23) against the live server on this Mac:

- [x] `POST /api/v1/pair {"action":"demo"}` → household returned
- [x] `POST /api/v1/household/<id>/sources {"type":"esp32",…}` → ids + apiKey
- [x] `POST /api/v1/ingest` correct key → `{"ok":true}` (200);
      wrong key → `{"error":"Bad source key"}` (403)
- [x] `firmware build` → `[SUCCESS]` (espressif32 8.0.0, esp32dev)
- [x] bridge end-to-end: synthetic sensor on a PTY → 4 presence events
      (idle / motion / idle / lost) enriched + ts-stamped → all accepted by
      the server; `GET /api/v1/household/<id>/state` showed the ESP32 source
      with `lastSeenTs` updated
- [ ] flashing — blocked only by the wedged CP2102 port; after a replug:
      `chip-id` → `erase-flash` → `pio run -t upload` → `pio device monitor`
      (expect the `Khayaal CSI room sensor v1.0.0` banner, then `wifi up …`)

---

## PERSONAL HOTSPOT DEMO (phone hotspot → ESP32 → laptop)

The recommended demo topology: **the parent's phone is the hotspot**; the ESP32
and the laptop both join it; the sensor posts straight to the laptop's
Khayaal server. Nothing external is needed.

### One-time prep (on the current Wi-Fi, before switching)

1. Flash the firmware (§4) and open the serial monitor.
2. Register a source on the server you'll run during the demo:
   `curl -X POST http://localhost:3100/api/v1/household/<id>/sources -H 'Content-Type: application/json' -d '{"type":"esp32"}'`
   — keep the returned `id` + `apiKey`.
3. In the serial CLI, set everything EXCEPT the final host (you won't know the
   hotspot IP yet):
   ```
   set ssid <PHONE-HOTSPOT-NAME>
   set pass <PHONE-HOTSPOT-PASSWORD>
   set hh hh_...
   set src src_...
   set key sk_...
   ```

### On demo day

1. Phone: Settings → Personal Hotspot → **ON**, "Maximize Compatibility" ON
   (forces 2.4 GHz — the ESP32 cannot see 5 GHz), WPA2 password set.
2. Laptop: join the phone's hotspot. Find your new address:
   `ipconfig getifaddr en0` (e.g. `172.20.10.5` on iPhone hotspots).
3. Run the server on that interface (it listens on all of them):
   `npm run dev` or `npm start` from the repo root.
4. Tell the ESP32 the new host over serial:
   ```
   set host 172.20.10.5
   restart
   ```
5. Watch the monitor: `Wi-Fi connected` → `presence motion|idle` heartbeats.
   On the laptop: `curl http://localhost:3100/api/v1/household/<id>/state`
   — the ESP32 source's `lastSeenTs` should keep updating.

### Fallback: USB bridge mode (no Wi-Fi at all)

Leave Wi-Fi unset; the firmware prints JSON lines over USB; the bridge posts them:
`python3 tunnel/khayaal_serial_bridge.py --port /dev/cu.usbserial-0001`
(config in tunnel/config.json — refresh identity with tunnel/register_source.py
whenever the demo server restarted).

### If the serial port refuses to open (tcsetattr EINVAL)

The CP2102 driver instance is wedged. Unplug the board, count to five, replug.
If it persists: `sudo pkill -f AppleUSBSLCOM` (needs your password) and replug.
