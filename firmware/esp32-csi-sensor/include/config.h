/**
 * @file config.h
 * @brief Compiled-in defaults for the Khayaal room sensor.
 *
 * Every value here can be overridden at runtime and persisted to NVS (flash)
 * from the USB serial CLI:
 *
 *   ssid <name>       Wi-Fi SSID (2.4 GHz network)
 *   pass <password>   Wi-Fi password
 *   host <url>        LAN ingest base URL, e.g. http://192.168.1.20:3100
 *   hh <id>           householdId for LAN mode
 *   src <id>          sourceId for LAN mode
 *   key <sk_...>      apiKey for LAN mode
 *   mode <lan|serial|bt> transport selection
 *   btname <name>     Bluetooth Classic SPP device name (BT mode)
 *   btpin <pin>       Bluetooth pairing PIN (BT mode)
 *   thr <float>       motion threshold (CSI amplitude variance units)
 *
 * `show` prints the effective config (secrets masked), `factory` clears NVS
 * and re-applies these defaults.
 */
#pragma once

// ---------------------------------------------------------------- transport
// Which transport carries `presence` events off the device.
//   TRANSPORT_SERIAL: one JSON line per event on USB serial; the Mac-side
//                     tunnel (../tunnel/khayaal_serial_bridge.py) forwards it
//                     to the backend. Zero network setup.
//   TRANSPORT_LAN:    direct HTTP POST to the backend ingest endpoint.
//   TRANSPORT_BT:     Bluetooth Classic SPP (BR/EDR) link; the Mac-side
//                     tunnel (../tunnel/bt_bridge.py) forwards it. This is
//                     the fallback for "the network is there but the path to
//                     the backend is not": the board keeps sensing over
//                     Wi-Fi (CSI needs the 2.4 GHz AP) but reports over
//                     Bluetooth, with no router in the way.
#define TRANSPORT_SERIAL 0
#define TRANSPORT_LAN 1
#define TRANSPORT_BT 2

#define KH_TRANSPORT_DEFAULT TRANSPORT_SERIAL

// ------------------------------------------------------------------- wi-fi
// The ESP32 must associate to a 2.4 GHz AP to receive CSI frames — even in
// serial mode (the AP's traffic is the sensor's "illumination"). The AP does
// not need internet access; without it the firmware omits `ts` and the
// serial bridge stamps it.
#define KH_WIFI_SSID_DEFAULT ""
#define KH_WIFI_PASS_DEFAULT ""

// --------------------------------------------------------------- lan mode
// Base URL of the Khayaal backend (no trailing slash). Events are POSTed to
// <host>/api/v1/ingest. Replace with this Mac's LAN IP for a real demo.
#define KH_LAN_HOST_DEFAULT "http://192.168.1.20:3100"
#define KH_HOUSEHOLD_ID_DEFAULT ""
#define KH_SOURCE_ID_DEFAULT ""
#define KH_API_KEY_DEFAULT ""

// --------------------------------------------------------------- bluetooth
// Bluetooth Classic SPP (BR/EDR) fallback transport.
//
// The board is an original ESP32-WROOM-32: Bluetooth Classic only — there
// is NO BLE radio on it (BLE needs an ESP32-C3/S3/H2), so this is an SPP
// server (Arduino's BluetoothSerial), not a GATT server. The peer pairs
// with the device name below and reads the same JSON lines the USB bridge
// reads.
//
// Controller mode: the SPP server runs in dual (BTDM) mode by default,
// because Espressif documents BTDM as the mode that coexists with the
// Wi-Fi radio this sensor needs for CSI. Set KH_BT_CLASSIC_ONLY to 1 to
// release the BLE controller's RAM (~10 kB) instead: leaner, but it selects
// a different controller mode, which the ESP-IDF cannot switch at runtime.
//
// The pairing PIN is only used when the peer asks for one (legacy pairing).
// The SPP server itself is started without security, so a peer that does
// not pair can still connect — see docs/BLUETOOTH_FALLBACK.md.
#define KH_BT_NAME_DEFAULT "Khayaal-Sensor"
#define KH_BT_PIN_DEFAULT "1234"
#define KH_BT_CLASSIC_ONLY 0

// ---------------------------------------------------------------- sensing
// Motion threshold in amplitude-variance units (dimension depends on AP
// traffic and the room; run `cal` with the room empty to pick a value).
// Rule of thumb after calibration: threshold ~= 2 x the idle p95 variance.
#define KH_MOTION_THRESHOLD_DEFAULT 25.0f

// Variance above threshold for this long -> "motion".
#define KH_MOTION_CONFIRM_MS 2000u

// Variance below threshold for this long -> "idle".
#define KH_IDLE_AFTER_MS (10UL * 60UL * 1000UL)

// Heartbeat ("idle"/"motion" re-emission) interval.
#define KH_HEARTBEAT_MS 30000u

// How often the sensor asks the backend for dashboard-queued actions
// (e.g. 'falltest') in LAN mode. 5 s keeps the demo snappy.
#define KH_DEVICE_POLL_MS 5000u

// ---------------------------------------------------------------- quiet hours
// The elder sleeps next to this board. Between the quiet hours all three
// LEDs dim to ~30% (alarms excepted — see led_controller.h). The values
// mirror the engine's QuietHours (packages/engine/src/fixtures.ts:
// { start: 22, end: 6 }). The hours are read from the board's own clock,
// which configTime() runs on UTC: KH_TZ_OFFSET_HOURS shifts the UTC hour to
// local before comparing. Set it to this room's UTC offset (+1 for Central
// European Time, for example) — the `tzh <offset>` CLI command changes it
// for the current boot (not persisted). Without NTP sync the firmware
// cannot know the hour, so night dimming and the inactivity watchdog stay
// off until `time synced via NTP` appears in the log.
#define KH_QUIET_START_HOUR 22
#define KH_QUIET_END_HOUR 6
#define KH_TZ_OFFSET_HOURS 0

// -------------------------------------------------------- inactivity watchdog
// Outside quiet hours, this many minutes with no variance sample above the
// motion threshold flags still=1 in status/meta and pulses a soft pink
// double every KH_STILL_NUDGE_PERIOD_MS (subtle, not alarming). 0 disables.
// Per-boot heuristic: nothing is persisted, and entering quiet hours resets
// it (the elder is supposed to be still then). `stillmin <minutes>` changes
// it for the current boot.
#define KH_STILL_WATCH_MIN_DEFAULT 45u
#define KH_STILL_NUDGE_PERIOD_MS (5UL * 60UL * 1000UL)

// ----------------------------------------------------------- fall confidence
// The presence machine's spike-then-stillness verdict is only latched as a
// fall when the evidence is corroborated: at least KH_FALL_CONFIRM_N spike
// samples (variance above threshold AND above KH_FALL_SPIKE_RATIO x the
// room baseline — the same bar the state machine uses), spaced at least
// KH_FALL_CONFIRM_SPACING_MS apart inside KH_FALL_CONFIRM_WINDOW_MS, AND at
// least one independent corroboration in the same window: the reflective IR
// beam seeing the person, or a fast-window (~0.25 s) jump above the
// threshold. `falltest` bypasses the gate (it is an explicit demo request).
#define KH_FALL_CONFIRM_N 2u
#define KH_FALL_CONFIRM_WINDOW_MS 10000u
#define KH_FALL_CONFIRM_SPACING_MS 400u

// ------------------------------------------------------- activity classifier
// The room's last 60 s of 1 Hz slow-window variance samples are classified
// against the room's OWN baseline — the quietest second in the window
// (floored at KH_ACT_FLOOR_EPS, the absolute variance noise floor) — never
// against absolute numbers, which depend on the AP and the room:
//   ratio r = p90(window) / quietest-second
//   r <  KH_ACT_STILL_RATIO   -> still
//   r <  KH_ACT_GENTLE_RATIO  -> gentle
//   r <  KH_ACT_ACTIVE_RATIO  -> active
//   else                      -> busy
// Two calibrated anchors override under-classing: p90 at/above the motion
// threshold is at least "active", at 2x the threshold it is "busy".
#define KH_ACT_WINDOW_S 60u
#define KH_ACT_MIN_SAMPLES 20u
#define KH_ACT_FLOOR_EPS 0.5f
#define KH_ACT_STILL_RATIO 2.5f
#define KH_ACT_GENTLE_RATIO 6.0f
#define KH_ACT_ACTIVE_RATIO 15.0f

// -------------------------------------------------------------------- fall
// Fall heuristic on the same variance stream (no extra hardware):
//   1. a sharp spike — variance >= KH_FALL_SPIKE_RATIO x the rolling mean
//      and above the motion threshold — lasting >= KH_FALL_SPIKE_MS
//      (a fall is one big disturbance, not a walk);
//   2. followed by stillness — variance below threshold — for
//      >= KH_FALL_STILL_MS (the person did not get up).
// Emits one "fall" event, then resumes the normal motion/idle machine.
#define KH_FALL_SPIKE_RATIO 3.0f
#define KH_FALL_SPIKE_MS 400u
#define KH_FALL_STILL_MS (2UL * 1000UL)

// ------------------------------------------------------------ csi pipeline
// Rolling window of per-packet mean amplitudes used for the variance.
#define KH_CSI_WINDOW 100
// Minimum packets in the window before variance is trusted.
#define KH_CSI_MIN_SAMPLES 20
// Packets in the short "fast" window (~0.25 s) used by the live scope, so a
// hand wave shows up immediately instead of after a full slow window.
#define KH_CSI_FAST_SAMPLES 24
// How many variance readings one "csi" event carries. The device samples at
// 4 Hz and batches one second of readings into a single event, so the stream
// costs one request per second instead of four.
#define KH_CSI_BATCH 4
// How often the batched csi event is emitted (ms).
#define KH_CSI_EMIT_MS 1000u
// When Wi-Fi is up but no CSI frames pass the BSSID filter for this long
// (the router answers pings from a different MAC), the filter relaxes.
#define KH_CSI_FILTER_RELAX_MS 10000u
// Only accept CSI frames transmitted by the associated AP (stable baseline).
// Set to 0 to accept frames from any transmitter (busy rooms with mesh APs).
#define KH_CSI_FILTER_AP_BSSID 1

// ------------------------------------------------------------------- http
// LAN mode timeouts / retry backoff (ms): 1s, 2s, 4s ... capped here.
#define KH_HTTP_TIMEOUT_MS 5000u
#define KH_HTTP_BACKOFF_MAX_MS 60000u
