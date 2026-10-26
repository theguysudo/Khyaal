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
 *   mode <lan|serial> transport selection
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
#define TRANSPORT_SERIAL 0
#define TRANSPORT_LAN 1

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
// Only accept CSI frames transmitted by the associated AP (stable baseline).
// Set to 0 to accept frames from any transmitter (busy rooms with mesh APs).
#define KH_CSI_FILTER_AP_BSSID 1

// ------------------------------------------------------------------- http
// LAN mode timeouts / retry backoff (ms): 1s, 2s, 4s ... capped here.
#define KH_HTTP_TIMEOUT_MS 5000u
#define KH_HTTP_BACKOFF_MAX_MS 60000u
