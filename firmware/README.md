# Khayaal room sensor — ESP32 Wi-Fi CSI (stub)

The room sensor is **optional**. Khayaal degrades gracefully to phone-only;
adding the ESP32 raises confidence (and adds a `presence` signal the engine
already understands).

## The contract

The firmware is just another source: it POSTs to the same endpoint the web
demo's `SimulatedCsiSensor` uses, with the same shape — nothing in the engine
or API changes when the real sensor replaces the simulator.

```bash
curl -X POST http://<khayaal-host>:3100/api/v1/ingest \
  -H 'Content-Type: application/json' \
  -d '{
    "householdId": "hh_...",
    "sourceId": "src_...",
    "apiKey": "sk_...",          // from Settings → Sources (shown once)
    "type": "presence",
    "value": "motion",            // "motion" | "idle" | "lost"
    "ts": 1730000000000
  }'
```

Register the source in the web app (**Settings → Sources → Register an
ESP32 room sensor**) and copy the key into the firmware config.

## Bring-up

- Board: **ESP32-WROOM-32** (classic, micro-USB).
- Framework: **ESP-IDF** (the CSI pipeline needs it; Arduino builds are flaky
  for CSI). Use Espressif's **esp-csi** — `github.com/espressif/esp-csi` — as
  the base example.
- Wi-Fi: **2.4 GHz only** (the phone hotspot works for demos; the router
  transmits, the ESP32 receives).
- Placement: fixed position, within a few metres of the router, elevated,
  not behind metal. The room being sensed sits **between** router and ESP32.
- Calibration: with the room empty, log CSI amplitude variance for a minute;
  set the motion threshold just above the idle band. Re-calibrate in the
  actual demo room — walls and furniture change the baseline.
- Power: USB power bank or cable; post `presence: idle` heartbeats every
  30 s and `motion` on detection. If the sensor itself dies, the engine's
  silence signal notices the missing heartbeats.

## What the engine does with presence

- `motion` counts as activity and resets escalation.
- A registered-but-quiet sensor during waking hours contributes up to 18
  points ("the room sensor has felt no movement for X").
- If no sensor is paired, confidence drops 15 % instead — no penalty to the
  score.

## Firmware layout (drop-in later)

```
firmware/
  esp32-csi-sensor/
    main/
      main.c            # wifi + csi init, threshold state machine
      csi_process.c     # amplitude variance -> motion/idle decision
    sdkconfig           # esp-csi defaults
    README.md           # this file's calibration notes
```

Build with PlatformIO (`espressif32` platform, ESP-IDF framework) or
`idf.py`. Keep the state machine dumb: variance above threshold for > 2 s →
`motion`; quiet for > 10 min → `idle`; Wi-Fi lost → `lost`. The intelligence
lives server-side, by design.
