/**
 * @file main.cpp
 * @brief Khayaal ESP32 Wi-Fi CSI room sensor.
 *
 * Sense:   rolling CSI amplitude variance (csi_sensor.cpp, ported from
 *          Espressif's esp-csi) -> presence state machine (presence.cpp):
 *          variance above threshold for >2 s -> "motion",
 *          quiet for >10 min -> "idle", Wi-Fi down -> "lost".
 * Report:  TRANSPORT_SERIAL — one JSON line per event over USB serial
 *          (the Mac-side tunnel in ../tunnel/ forwards it), or
 *          TRANSPORT_LAN   — HTTP POST to the backend ingest endpoint, or
 *          TRANSPORT_BT    — Bluetooth Classic SPP link (the fallback for
 *          "the network is there but the path to the backend is not").
 *
 * Privacy: presence state only. Raw CSI never leaves the device.
 *
 * Serial CLI (115200 baud): help, show, cal, thr <f>, ssid <s>, pass <p>,
 * host <url>, hh <id>, src <id>, key <sk_...>, mode <lan|serial|bt>,
 * btname <n>, btpin <p>, enc, scan, csi, ping, bssid, ir, wifi, wififorget,
 * statusjson, ledtest, stillmin <min>, tzh <offset>, factory. In BT mode the
 * same CLI is answered over the Bluetooth link, so the operator can
 * configure the board from the phone or the Mac with no USB cable in the way.
 */
#include <algorithm>

#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <time.h>

#include "bt_link.h"
#include "config.h"
#include "config_store.h"
#include "csi_sensor.h"
#include "csi_traffic.h"
#include "ir_sensor.h"
#include "led_controller.h"
#include "presence.h"
#include "tunnel_crypto.h"

namespace {
constexpr const char *kFwVersion = "1.2.0";
constexpr uint32_t kSensePeriodMs = 250;   // state machine tick
constexpr uint32_t kStatusPeriodMs = 5000; // diagnostic log cadence
constexpr uint32_t kCalDurationMs = 60000;
constexpr size_t kCalMaxSamples = 240;     // 4 Hz * 60 s

KhConfig cfg;
ConfigStore store;
CsiSensor csi;
PresenceStateMachine::Params smParams;
PresenceStateMachine sm;
LedController leds;
IrSensor ir;
CsiTraffic traffic;
BtLink bt;

volatile bool wifiUp = false;
bool timeSynced = false;

// diagnostics snapshot for `show` / status lines
float lastVariance = 0.0f;
float lastMean = 0.0f;
float lastPacketRate = 0.0f;
float lastFastVariance = 0.0f;

// calibration session
struct Calibration {
  bool active = false;
  uint32_t startMs = 0;
  uint32_t lastSampleMs = 0;
  size_t samples = 0;
  float values[kCalMaxSamples];
} cal;

// LAN mode: pending events with exponential backoff. Presence and the CSI
// stream keep separate slots — a fall must never be dropped to make room for
// a scope reading.
//
// In BT mode the same slots are the hand-over point between the two
// reporting legs: the Bluetooth peer takes an event when one is connected,
// the board's own LAN POST takes it when nobody is listening over BT.
// Whoever delivers an event clears the slot, so it is never sent twice.
char pendingPresence[320] = "";
char pendingCsi[384] = "";
char pendingIr[192] = "";
uint32_t pendingAttempts = 0;
uint32_t nextLanAttemptMs = 0;

// encrypted envelope buffer (envelopes are larger than the plaintext event)
char sealedJson[1024] = "";

// One second of CSI readings, batched so the stream costs one request per
// second instead of one per reading. The slow window is what the presence
// rules compare against the threshold; the fast window is a ~0.25 s view
// that reacts to a hand wave without waiting for the slow window to roll.
float csiBatch[KH_CSI_BATCH];
float csiFastBatch[KH_CSI_BATCH];
size_t csiBatchCount = 0;
uint32_t lastCsiEmitMs = 0;
bool csiStreamOn = true;

uint32_t lastSenseMs = 0;
uint32_t lastStatusMs = 0;
uint32_t lastHeartbeatMs = 0;
uint32_t lastDevicePollMs = 0;
uint32_t wifiUpSinceMs = 0;
uint32_t lastFramesSeenMs = 0;
bool csiFilterOn = true;
float ledBaseline = 0.0f;  // the room's quiet, as an EMA of slow variance
float lastRedLevel = 0.0f;

// ------------------------------------------------------- activity classifier
// The room's last KH_ACT_WINDOW_S seconds of 1 Hz slow-window variance, run
// through tickClassifier() every second. Classes are relative to the room's
// own baseline (the quietest second in the window), never absolute numbers —
// see config.h for the ratios.
float actRing[KH_ACT_WINDOW_S];
size_t actCount = 0;
size_t actPos = 0;
uint32_t lastActSampleMs = 0;
uint8_t actClass = LedController::kStill;
float actRatio = 0.0f;

const char *activityName(uint8_t cls) {
  static const char *kNames[] = {"still", "gentle", "active", "busy"};
  const uint8_t safe = cls <= static_cast<uint8_t>(LedController::kBusy)
                           ? cls
                           : static_cast<uint8_t>(LedController::kStill);
  return kNames[safe];
}

// ------------------------------------------------------- inactivity watchdog
// Per-boot heuristic (nothing persisted): stillWatchMin minutes with no
// variance sample above the motion threshold, outside quiet hours, flags
// still=1 and pulses a soft pink double every 5 min. `stillmin` retunes it
// for the current boot.
uint32_t stillWatchMin = KH_STILL_WATCH_MIN_DEFAULT;
uint32_t lastMotionMs = 0;  // millis() of the last above-threshold sample
bool stillFlag = false;
uint32_t lastStillNudgeMs = 0;
uint32_t lastWatchTickMs = 0;

uint32_t stillMinutes(uint32_t nowMs) {
  if (lastMotionMs == 0) return 0;
  const uint32_t m = (nowMs - lastMotionMs) / 60000UL;
  return m > 999 ? 999 : m;
}

// ---------------------------------------------------------- fall confidence
// The presence machine's spike-then-stillness verdict is only emitted after
// corroboration: KH_FALL_CONFIRM_N spike samples (variance above threshold
// AND above the room baseline x the spike ratio) inside the confirmation
// window, plus one independent witness (IR beam or a fast-window jump).
// Evidence rolls in a small ring; it is evaluated when the verdict arrives.
uint32_t spikeMs[8];
size_t spikeLen = 0;
size_t spikePos = 0;
uint32_t lastSpikeMs = 0;  // spacing: one spike sample per KH_FALL_CONFIRM_SPACING_MS
uint32_t fastJumpMs[4];
size_t fastJumpLen = 0;
size_t fastJumpPos = 0;
uint32_t lastIrSeenMs = 0;
uint32_t lastFallConf = 0;  // last evaluated confidence, 0..KH_FALL_CONFIRM_N

// --------------------------------------------------------------- night mode
bool nightNow = false;         // quiet hours (only knowable once NTP-synced)
uint32_t lastNightCheckMs = 0;
int tzOffsetHours = KH_TZ_OFFSET_HOURS;  // `tzh` retunes it for this boot

const char *lastTestStepName = nullptr;  // ledtest step printing

// ------------------------------------------------------------------ logging
// Every log line starts with "[<ms>] " — deliberately not JSON, so the
// serial bridge can tell log output from presence events at a glance.
// The same line goes to the Bluetooth link when that link is up, so the
// peer sees the console it would see over USB.
void klog(const char *fmt, ...) {
  char buf[256];
  va_list args;
  va_start(args, fmt);
  vsnprintf(buf, sizeof(buf), fmt, args);
  va_end(args);
  char line[320];
  snprintf(line, sizeof(line), "[%lu] %s", static_cast<unsigned long>(millis()),
           buf);
  Serial.println(line);
  if (bt.active()) bt.writeLine(line);
}

// ------------------------------------------------------------------ console
// Command output goes to the USB serial port and, when the Bluetooth link
// is up, to the Bluetooth peer as well: `show` typed over BT answers on
// BT, and the USB monitor still sees everything.
void out(const char *s) {
  Serial.print(s);
  if (bt.active()) bt.write(s);
}

void outln(const char *s) {
  Serial.println(s);
  if (bt.active()) bt.writeLine(s);
}

void outf(const char *fmt, ...) {
  char buf[256];
  va_list args;
  va_start(args, fmt);
  vsnprintf(buf, sizeof(buf), fmt, args);
  va_end(args);
  out(buf);
}

// --------------------------------------------------------------------- time
uint64_t epochMs() {
  struct timeval tv;
  gettimeofday(&tv, nullptr);
  return static_cast<uint64_t>(tv.tv_sec) * 1000ULL +
         static_cast<uint64_t>(tv.tv_usec) / 1000ULL;
}

// Quiet hours in the board's local wall clock. configTime() runs the clock
// on UTC, so KH_TZ_OFFSET_HOURS (`tzh` command) shifts the hour before the
// comparison; the values mirror the engine's QuietHours (22:00-06:00).
bool inQuietHours() {
  const time_t t = time(nullptr);
  struct tm utc;
  gmtime_r(&t, &utc);
  const int hour = (utc.tm_hour + tzOffsetHours + 24) % 24;
  if (KH_QUIET_START_HOUR > KH_QUIET_END_HOUR) {
    return hour >= KH_QUIET_START_HOUR || hour < KH_QUIET_END_HOUR;
  }
  return hour >= KH_QUIET_START_HOUR && hour < KH_QUIET_END_HOUR;
}

// ------------------------------------------------------- activity classifier
// One variance sample per second into a KH_ACT_WINDOW_S ring, then classify
// the window against its own quietest second (the room's baseline), with
// the calibrated threshold as an under-classing guard. config.h documents
// the ratios. Runs on its own 1 s cadence inside the 4 Hz sense tick.
void tickClassifier(uint32_t nowMs, bool haveData) {
  if (!haveData || nowMs - lastActSampleMs < 1000) return;
  lastActSampleMs = nowMs;
  actRing[actPos] = lastVariance;
  actPos = (actPos + 1) % KH_ACT_WINDOW_S;
  if (actCount < KH_ACT_WINDOW_S) actCount++;

  uint8_t cls;
  if (actCount >= KH_ACT_MIN_SAMPLES) {
    float sorted[KH_ACT_WINDOW_S];
    for (size_t i = 0; i < actCount; i++) sorted[i] = actRing[i];
    std::sort(sorted, sorted + actCount);
    const float p90 = sorted[static_cast<size_t>(0.9f * (actCount - 1))];
    float floor = sorted[0];
    if (floor < KH_ACT_FLOOR_EPS) floor = KH_ACT_FLOOR_EPS;
    actRatio = p90 / floor;
    if (actRatio < KH_ACT_STILL_RATIO) {
      cls = LedController::kStill;
    } else if (actRatio < KH_ACT_GENTLE_RATIO) {
      cls = LedController::kGentle;
    } else if (actRatio < KH_ACT_ACTIVE_RATIO) {
      cls = LedController::kActive;
    } else {
      cls = LedController::kBusy;
    }
    // Calibrated anchors: `thr` was picked as ~2x the room's idle p95, so a
    // window at/above it is at least "active" no matter what the ratio says.
    if (p90 >= cfg.threshold && cls < LedController::kActive) {
      cls = LedController::kActive;
    }
    if (p90 >= 2.0f * cfg.threshold) cls = LedController::kBusy;
  } else {
    // Window still filling (the first ~20 s after boot): classify the
    // instant reading against the calibrated threshold instead.
    const float v = lastVariance;
    if (v < 0.5f * cfg.threshold) {
      cls = LedController::kStill;
    } else if (v < cfg.threshold) {
      cls = LedController::kGentle;
    } else if (v < 3.0f * cfg.threshold) {
      cls = LedController::kActive;
    } else {
      cls = LedController::kBusy;
    }
    actRatio = 0.0f;
  }
  actClass = cls;
  leds.onActivityClass(cls);
}

// ------------------------------------------------------- inactivity watchdog
// Still means: no variance sample above the motion threshold for
// stillWatchMin minutes, outside quiet hours (the elder is SUPPOSED to be
// still then — entering quiet hours resets the timer). Flagging is subtle:
// still=1 in status/meta plus a soft pink double-pulse every 5 min.
void tickWatchdog(uint32_t nowMs) {
  if (nowMs - lastWatchTickMs < 1000) return;
  lastWatchTickMs = nowMs;
  if (nightNow) {
    lastMotionMs = nowMs;  // suspend and reset for the night
    stillFlag = false;
    return;
  }
  if (lastMotionMs == 0) lastMotionMs = nowMs;
  if (stillWatchMin == 0) return;  // disabled via `stillmin 0`
  const uint32_t watchMs = stillWatchMin * 60000UL;
  if (nowMs - lastMotionMs < watchMs) return;
  if (!stillFlag) {
    stillFlag = true;
    lastStillNudgeMs = nowMs;
    leds.onStillNudge();
    klog("watchdog: no motion for %lu min — still=1 (soft nudge every 5 min)",
         static_cast<unsigned long>(stillWatchMin));
  } else if (nowMs - lastStillNudgeMs >= KH_STILL_NUDGE_PERIOD_MS) {
    lastStillNudgeMs = nowMs;
    leds.onStillNudge();
    klog("watchdog: still nudge (%lu min without motion)",
         static_cast<unsigned long>(stillMinutes(nowMs)));
  }
}

// ---------------------------------------------------------- fall confidence
// Rolling evidence for the confirmation gate, recorded on every sense tick
// while CSI flows. Spikes are the presence machine's own bar (variance above
// threshold AND above the room baseline x the spike ratio); corroboration is
// the IR beam or a fast-window (~0.25 s) jump above the threshold.
void recordFallEvidence(uint32_t nowMs) {
  if (lastVariance > cfg.threshold &&
      lastVariance > 3.0f * ledBaseline &&
      (lastSpikeMs == 0 || nowMs - lastSpikeMs >= KH_FALL_CONFIRM_SPACING_MS)) {
    spikeMs[spikePos] = nowMs;
    spikePos = (spikePos + 1) % (sizeof(spikeMs) / sizeof(spikeMs[0]));
    if (spikeLen < sizeof(spikeMs) / sizeof(spikeMs[0])) spikeLen++;
    lastSpikeMs = nowMs;
  }
  if (lastFastVariance > cfg.threshold) {
    fastJumpMs[fastJumpPos] = nowMs;
    fastJumpPos = (fastJumpPos + 1) % (sizeof(fastJumpMs) / sizeof(fastJumpMs[0]));
    if (fastJumpLen < sizeof(fastJumpMs) / sizeof(fastJumpMs[0])) fastJumpLen++;
  }
  if (ir.state() == IrSensor::State::DETECTED) lastIrSeenMs = nowMs;
}

// Evaluate the gate for a spike-then-stillness verdict the state machine has
// just produced. Returns true when the fall may be emitted; always explains
// itself in the log (the confidence progression the maintainer asked for).
bool confirmFall(uint32_t nowMs) {
  const uint32_t windowStart =
      nowMs > KH_FALL_CONFIRM_WINDOW_MS ? nowMs - KH_FALL_CONFIRM_WINDOW_MS : 0;
  size_t nSpike = 0;
  for (size_t i = 0; i < spikeLen; i++) {
    if (spikeMs[i] >= windowStart) nSpike++;
  }
  size_t nFast = 0;
  for (size_t i = 0; i < fastJumpLen; i++) {
    if (fastJumpMs[i] >= windowStart) nFast++;
  }
  const bool irWitness =
      lastIrSeenMs != 0 && lastIrSeenMs >= windowStart;
  lastFallConf = nSpike < KH_FALL_CONFIRM_N ? nSpike : KH_FALL_CONFIRM_N;
  const bool confirmed =
      nSpike >= KH_FALL_CONFIRM_N && (irWitness || nFast >= 1);
  klog("fall %s: confidence %u/%u (spikes=%u fast-jumps=%u ir=%s)",
       confirmed ? "CONFIRMED" : "candidate discarded",
       static_cast<unsigned>(lastFallConf), static_cast<unsigned>(KH_FALL_CONFIRM_N),
       static_cast<unsigned>(nSpike), static_cast<unsigned>(nFast),
       irWitness ? "yes" : "no");
  return confirmed;
}

// ------------------------------------------------------------------- events
// Meta rides along on every presence event — the server's parseIngest()
// sanitizes and passes a `meta` bag through for every signal type, so this
// stays the same event the engine already understands (no new event type):
// the activity class, the inactivity-watchdog state and the last evaluated
// fall confidence. Scalars only, keys match the server's [a-zA-Z0-9_] rule.
void buildEventJson(char *out, size_t cap, const char *value) {
  const unsigned long smin =
      static_cast<unsigned long>(stillMinutes(millis()));
  const unsigned fconf = static_cast<unsigned>(lastFallConf);
  if (timeSynced) {
    // NTP-synced: stamp here. Otherwise omit `ts` — the serial bridge fills
    // it in; the LAN path logs a warning once at boot instead.
    snprintf(out, cap,
             "{\"type\":\"presence\",\"value\":\"%s\",\"ts\":%llu,"
             "\"meta\":{\"act\":\"%s\",\"still\":%d,\"stillmin\":%lu,"
             "\"fconf\":%u}}",
             value, static_cast<unsigned long long>(epochMs()),
             activityName(actClass), stillFlag ? 1 : 0, smin, fconf);
  } else {
    snprintf(out, cap,
             "{\"type\":\"presence\",\"value\":\"%s\","
             "\"meta\":{\"act\":\"%s\",\"still\":%d,\"stillmin\":%lu,"
             "\"fconf\":%u}}",
             value, activityName(actClass), stillFlag ? 1 : 0, smin, fconf);
  }
}

void emitPresence(const char *value) {
  char json[sizeof(pendingPresence)];
  buildEventJson(json, sizeof(json), value);
  if (cfg.transport == TRANSPORT_LAN) {
    // Offline fallback: with no Wi-Fi the LAN path is dead, so also hand the
    // event to USB — the Mac-side relay forwards (and seals) it. When Wi-Fi
    // returns, flushLan may deliver it again; the engine treats a repeat as
    // confirmation, not a new alarm.
    if (!wifiUp) Serial.println(json);
    // Presence is level-based: coalescing to the newest event is correct.
    snprintf(pendingPresence, sizeof(pendingPresence), "%s", json);
    pendingAttempts = 0;
    nextLanAttemptMs = 0;
  } else if (cfg.transport == TRANSPORT_BT) {
    if (bt.connected()) {
      bt.writeLine(json);
    } else {
      // Nobody is listening yet: keep the newest event (presence is
      // level-based, so coalescing is correct) until a peer shows up or the
      // LAN leg takes it.
      snprintf(pendingPresence, sizeof(pendingPresence), "%s", json);
    }
  } else {
    Serial.println(json);
  }
}

/**
 * The machine-readable CSI reading. This is what the live scope draws: the
 * slow-window variance (the number the presence rules use) as `value`, plus a
 * batch of slow readings and a batch of fast readings in `meta`, so one
 * request carries a second of waveform in both time scales. Still scalars
 * only — no per-subcarrier data leaves the chip.
 */
void buildCsiJson(char *out, size_t cap, const float *slow, const float *fast,
                  size_t count, float slowVariance, float mean, float packetRate,
                  const char *state) {
  int n = snprintf(out, cap,
                   "{\"type\":\"csi\",\"value\":%.2f,\"meta\":{\"mean\":%.1f,"
                   "\"pkt\":%.1f,\"state\":\"%s\",\"thr\":%.1f,\"ir\":%d,"
                   "\"act\":\"%s\",\"samples\":[",
                   slowVariance, mean, packetRate, state, cfg.threshold,
                   ir.state() == IrSensor::State::DETECTED ? 1 : 0,
                   activityName(actClass));
  if (n < 0) { out[0] = '\0'; return; }
  size_t pos = static_cast<size_t>(n);
  if (pos >= cap) { out[0] = '\0'; return; }
  for (size_t i = 0; i < count; i++) {
    if (pos + 12 >= cap) break;
    n = snprintf(out + pos, cap - pos, "%s%.2f", i ? "," : "", slow[i]);
    if (n < 0) break;
    pos += static_cast<size_t>(n);
    if (pos >= cap) { out[0] = '\0'; return; }
  }
  if (pos + 12 >= cap) { out[0] = '\0'; return; }
  n = snprintf(out + pos, cap - pos, "],\"fast\":[");
  if (n < 0) { out[0] = '\0'; return; }
  pos += static_cast<size_t>(n);
  for (size_t i = 0; i < count; i++) {
    if (pos + 12 >= cap) break;
    n = snprintf(out + pos, cap - pos, "%s%.2f", i ? "," : "", fast[i]);
    if (n < 0) break;
    pos += static_cast<size_t>(n);
    if (pos >= cap) { out[0] = '\0'; return; }
  }
  if (timeSynced) {
    snprintf(out + pos, cap - pos, "]},\"ts\":%llu}",
             static_cast<unsigned long long>(epochMs()));
  } else {
    snprintf(out + pos, cap - pos, "]}}");
  }
}

/**
 * The IR beam's verdict as its own signal — kept distinct from CSI everywhere
 * downstream (a different SignalType), so the two channels are never fused
 * silently.
 */
void emitIr(const char *value) {
  char json[sizeof(pendingIr)];
  if (timeSynced) {
    snprintf(json, sizeof(json),
             "{\"type\":\"ir_reflective\",\"value\":\"%s\",\"ts\":%llu}",
             value, static_cast<unsigned long long>(epochMs()));
  } else {
    snprintf(json, sizeof(json),
             "{\"type\":\"ir_reflective\",\"value\":\"%s\"}", value);
  }
  if (cfg.transport == TRANSPORT_LAN) {
    snprintf(pendingIr, sizeof(pendingIr), "%s", json);
  } else if (cfg.transport == TRANSPORT_BT) {
    if (bt.connected()) {
      bt.writeLine(json);
    } else {
      snprintf(pendingIr, sizeof(pendingIr), "%s", json);
    }
  } else {
    Serial.println(json);
  }
}

void onIrEvent(IrSensor::State state, uint32_t nowMs) {
  (void)nowMs;
  const bool detected = state == IrSensor::State::DETECTED;
  leds.onIr(detected);
  klog("ir: %s", detected ? "object inside the beam" : "beam clear");
  emitIr(detected ? "detected" : "clear");
}

void emitCsi() {
  if (csiBatchCount == 0) return;
  char json[sizeof(pendingCsi)];
  buildCsiJson(json, sizeof(json), csiBatch, csiFastBatch, csiBatchCount,
               lastVariance, lastMean, lastPacketRate,
               presenceValue(sm.state()));
  csiBatchCount = 0;
  if (json[0] == '\0') return;
  if (cfg.transport == TRANSPORT_LAN) {
    // A scope reading is a sample, not a state: dropping an intermediate
    // batch is fine, so the newest batch replaces the old one.
    snprintf(pendingCsi, sizeof(pendingCsi), "%s", json);
  } else if (cfg.transport == TRANSPORT_BT) {
    if (bt.connected()) {
      bt.writeLine(json);
    } else {
      snprintf(pendingCsi, sizeof(pendingCsi), "%s", json);
    }
  } else {
    Serial.println(json);
  }
}

// ------------------------------------------------------------------ lan tx
// The board's own POST leg. It needs the backend identity in NVS.
bool lanConfigured() {
  return cfg.host[0] != '\0' && cfg.householdId[0] != '\0' &&
         cfg.sourceId[0] != '\0' && cfg.apiKey[0] != '\0';
}

bool postIngest(const char *json) {
  if (cfg.host[0] == '\0' || cfg.householdId[0] == '\0' ||
      cfg.sourceId[0] == '\0' || cfg.apiKey[0] == '\0') {
    static bool warned = false;
    if (!warned) {
      klog("LAN mode needs host/hh/src/key — set via serial CLI (see help)");
      warned = true;
    }
    return false;
  }
  String url = String(cfg.host) + "/api/v1/ingest";
  WiFiClient client;
  HTTPClient http;
  if (!http.begin(client, url)) return false;
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(KH_HTTP_TIMEOUT_MS);
  const int code = http.POST(json);
  http.end();
  return code == 200;
}

void flushLan(uint32_t nowMs) {
  if (cfg.transport == TRANSPORT_SERIAL || !wifiUp) return;
  if (cfg.transport == TRANSPORT_BT) {
    // In BT mode the Bluetooth peer owns the reporting leg while it is
    // connected; the board POSTs itself only when nobody is listening, and
    // only when it was ever given a backend identity to POST with.
    if (bt.connected()) return;
    if (!lanConfigured()) return;
  }
  const bool hasPresence = pendingPresence[0] != '\0';
  const bool hasCsi = pendingCsi[0] != '\0';
  const bool hasIr = pendingIr[0] != '\0';
  if (!hasPresence && !hasCsi && !hasIr) return;
  if (pendingAttempts > 0 &&
      static_cast<int32_t>(nowMs - nextLanAttemptMs) < 0) {
    return;  // backing off
  }

  // Presence wins, then the scope, then IR: a fall must not wait behind a
  // scope reading, and a scope reading must not wait behind an IR event.
  const char *plain = hasPresence ? pendingPresence : (hasCsi ? pendingCsi : pendingIr);
  const char *body = plain;
  if (cfg.encrypt && cfg.apiKey[0] && cfg.householdId[0] && cfg.sourceId[0]) {
    // Sealed per attempt, not per enqueue: a retry after a lost response
    // must carry a fresh IV, or the server would reject it as a replay.
    if (sealIngestEvent(cfg.apiKey, cfg.householdId, cfg.sourceId, plain,
                        sealedJson, sizeof(sealedJson))) {
      body = sealedJson;
    } else {
      klog("sealing failed — sending plaintext for this event");
    }
  }

  if (postIngest(body)) {
    if (hasPresence) {
      klog("ingest ok (%s)", presenceValue(sm.state()));
      pendingPresence[0] = '\0';
    } else if (hasCsi) {
      klog("csi batch accepted");
      pendingCsi[0] = '\0';
    } else {
      pendingIr[0] = '\0';
    }
    pendingAttempts = 0;
    nextLanAttemptMs = 0;
  } else {
    const uint32_t delayMs =
        pendingAttempts < 6 ? 1000UL << pendingAttempts : KH_HTTP_BACKOFF_MAX_MS;
    nextLanAttemptMs = nowMs + delayMs;
    pendingAttempts++;
    klog("ingest failed, retry in %lu ms", static_cast<unsigned long>(delayMs));
  }
}

// ------------------------------------------------------------------- bt tx
// A peer is connected (or has just connected): hand over whatever was
// queued while nobody was listening. The slots are shared with the LAN leg,
// so an event is delivered once — by whichever leg got there first.
void flushBt() {
  if (!bt.connected()) return;
  if (pendingPresence[0] != '\0') {
    bt.writeLine(pendingPresence);
    pendingPresence[0] = '\0';
  }
  if (pendingCsi[0] != '\0') {
    bt.writeLine(pendingCsi);
    pendingCsi[0] = '\0';
  }
  if (pendingIr[0] != '\0') {
    bt.writeLine(pendingIr);
    pendingIr[0] = '\0';
  }
  pendingAttempts = 0;
  nextLanAttemptMs = 0;
}

// -------------------------------------------------------------------- wifi
void onWifiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
  (void)info;
  switch (event) {
    case ARDUINO_EVENT_WIFI_STA_GOT_IP: {
      wifiUp = true;
      wifiUpSinceMs = millis();
      uint8_t bssid[6];
      memcpy(bssid, WiFi.BSSID(), sizeof(bssid));
      csi.onWifiConnected(bssid);
      configTime(0, 0, "pool.ntp.org", "time.nist.gov");
      klog("wifi up ip=%s rssi=%d ap=%02x:%02x:%02x:%02x:%02x:%02x",
           WiFi.localIP().toString().c_str(), WiFi.RSSI(), bssid[0], bssid[1],
           bssid[2], bssid[3], bssid[4], bssid[5]);
      break;
    }
    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
      if (wifiUp) klog("wifi down (will auto-reconnect)");
      wifiUp = false;
      csi.onWifiDisconnected();
      break;
    default:
      break;
  }
}

// ------------------------------------------------------------ calibration
void startCalibration() {
  cal.active = true;
  cal.startMs = millis();
  cal.lastSampleMs = 0;
  cal.samples = 0;
  leds.onCalibration(true);  // pink slow sweep while it runs
  klog("cal: logging variance for 60 s — leave the room EMPTY and still");
}

void finishCalibration() {
  cal.active = false;
  leds.onCalibration(false);
  if (cal.samples < 10) {
    klog("cal: only %u samples — not enough CSI traffic; check the AP link",
         static_cast<unsigned>(cal.samples));
    return;
  }
  float sorted[kCalMaxSamples];
  float sum = 0.0f;
  for (size_t i = 0; i < cal.samples; i++) {
    sorted[i] = cal.values[i];
    sum += cal.values[i];
  }
  std::sort(sorted, sorted + cal.samples);
  const float p95 = sorted[static_cast<size_t>(0.95 * (cal.samples - 1))];
  const float mean = sum / static_cast<float>(cal.samples);
  const float suggestion = p95 * 2.0f;
  klog("cal done: n=%u mean=%.2f min=%.2f max=%.2f p95=%.2f",
       static_cast<unsigned>(cal.samples), mean, sorted[0],
       sorted[cal.samples - 1], p95);
  klog("suggested threshold: %.1f   (apply with:  thr %.1f)", suggestion,
       suggestion);
  klog("then verify: walk in the room; status var should exceed it.");
}

void runCalibration(uint32_t nowMs) {
  if (nowMs - cal.lastSampleMs < kSensePeriodMs) return;
  cal.lastSampleMs = nowMs;
  CsiSensor::Stats st;
  if (csi.readStats(&st)) {
    if (cal.samples < kCalMaxSamples) cal.values[cal.samples] = st.variance;
    if (cal.samples < kCalMaxSamples) cal.samples++;
    klog("cal t=%.1fs var=%.2f mean=%.1f pkt/s=%.1f",
         (nowMs - cal.startMs) / 1000.0f, st.variance, st.mean,
         st.packetRate);
  } else {
    klog("cal t=%.1fs waiting for CSI frames...", (nowMs - cal.startMs) / 1000.0f);
  }
  if (nowMs - cal.startMs >= kCalDurationMs) finishCalibration();
}

// ---------------------------------------------------------------- dashboard
// LAN mode: poll the backend every KH_DEVICE_POLL_MS for dashboard-queued
// actions (x-kh-household/x-kh-source/x-kh-key — the same credentials as
// ingest). Response {"actions":["falltest", ...]} — the list is drained by
// the server, so each action runs once. GET only; any failure just skips a
// poll cycle, and the 3 s timeout keeps the loop breathing.
void pollDeviceActions(uint32_t nowMs) {
  if (cfg.transport != TRANSPORT_LAN || !wifiUp ||
      cfg.host[0] == '\0' || cfg.householdId[0] == '\0' ||
      cfg.sourceId[0] == '\0' || cfg.apiKey[0] == '\0') {
    return;
  }
  if (nowMs - lastDevicePollMs < KH_DEVICE_POLL_MS) return;
  lastDevicePollMs = nowMs;

  String url = String(cfg.host) + "/api/v1/device/actions";
  WiFiClient client;
  HTTPClient http;
  if (!http.begin(client, url)) return;
  http.addHeader("x-kh-household", cfg.householdId);
  http.addHeader("x-kh-source", cfg.sourceId);
  http.addHeader("x-kh-key", cfg.apiKey);
  http.setTimeout(3000);
  const int code = http.GET();
  if (code == 200) {
    const String body = http.getString();
    if (body.indexOf("falltest") >= 0) {
      klog("dashboard requested falltest");
      emitPresence("fall");
      leds.onPresence("fall");  // same feedback as the CLI demo hook
    }
  }
  http.end();
}

// ------------------------------------------------------------------- cli
void printHelp() {
  outln("");
  outln("Khayaal room sensor CLI");
  outln("  help            this text");
  outln("  show            effective config + sensor state");
  outln("  cal             60 s variance log for threshold setting");
  outln("  thr <float>     motion threshold (variance units), saved");
  outln("  ssid <name>     Wi-Fi SSID (2.4 GHz), saved");
  outln("  pass <pass>     Wi-Fi password, saved");
  outln("  host <url>      LAN backend base URL, saved");
  outln("  hh <id>         householdId (LAN mode), saved");
  outln("  src <id>        sourceId (LAN mode), saved");
  outln("  key <sk_...>    apiKey (LAN mode), saved");
  outln("  mode <lan|serial|bt>   transport, saved");
  outln("  bt              Bluetooth Classic link status");
  outln("  btname <name>   Bluetooth device name (paired by the peer), saved");
  outln("  btpin <pin>     Bluetooth pairing PIN (legacy pairing), saved");
  outln("  enc <on|off>    AES-256-GCM seal LAN ingest (on = default), saved");
  outln("  scan            scan Wi-Fi networks, print JSON lines (relay)");
  outln("  csi <on|off>    stream the live CSI scope readings (on = default)");
  outln("  ping <on|off>   gateway ping traffic that feeds CSI frames (on = default)");
  outln("  bssid <on|off>  CSI frame filter (auto-relaxes if the AP sends none)");
  outln("  ir <on|off>     reflective IR beam channel on GPIO 23 (on = default)");
  outln("  wifi <on|off>   Wi-Fi radio (off frees RAM but stops CSI sensing)");
  outln("  wififorget      clear stored Wi-Fi, disconnect");
  outln("  statusjson      one-line machine-readable status (relay)");
  outln("  ledtest         play every LED scenario (~45 s, prints each name)");
  outln("  stillmin <min>  inactivity watchdog minutes (0 off; default 45; session)");
  outln("  tzh <-12..14>   UTC offset for quiet hours (default 0; session)");
  outln("  factory         clear NVS, back to compiled defaults");
  outln("  falltest        emit one 'fall' event (demo/test hook)");
}

const char *transportName() {
  switch (cfg.transport) {
    case TRANSPORT_LAN: return "lan";
    case TRANSPORT_BT: return "bt";
    default: return "serial";
  }
}

void printShow() {
  outln("config:");
  outf("  transport: %s\n", transportName());
  outf("  ssid: %s  pass: %s\n", cfg.ssid,
       cfg.password[0] ? "********" : "(none)");
  outf("  host: %s\n", cfg.host);
  outf("  hh: %s  src: %s\n", cfg.householdId, cfg.sourceId);
  if (cfg.apiKey[0]) {
    char masked[12];
    snprintf(masked, sizeof(masked), "%.6s...", cfg.apiKey);
    outf("  key: %s\n", masked);
  } else {
    outln("  key: (none)");
  }
  outf("  bluetooth: %s  pin: %s  link: %s\n", cfg.btName, cfg.btPin,
       !bt.active() ? "off" : (bt.connected() ? "peer connected" : "waiting for peer"));
  outf("  threshold: %.2f\n", cfg.threshold);
  outf("  encrypt: %s\n", cfg.encrypt ? "on (AES-256-GCM)" : "off (PLAINTEXT)");
  outf("state: %s  var=%.2f mean=%.1f pkt/s=%.1f wifi=%s time=%s\n",
       presenceValue(sm.state()), lastVariance, lastMean,
       lastPacketRate, wifiUp ? "up" : "down",
       timeSynced ? "synced" : "unsynced");
  // --- enrichment: the board's own picture of itself ------------------------
  const uint32_t up = millis() / 1000UL;
  char ledName[64];
  leds.scenarioName(ledName, sizeof(ledName));
  outf("  activity: %s (ratio %.1f)  — still<%.1f gentle<%.1f active<%.1f busy\n",
       activityName(actClass), static_cast<double>(actRatio),
       static_cast<double>(KH_ACT_STILL_RATIO),
       static_cast<double>(KH_ACT_GENTLE_RATIO),
       static_cast<double>(KH_ACT_ACTIVE_RATIO));
  outf("  watchdog: %lu min without motion (limit %lu min%s), still=%d\n",
       static_cast<unsigned long>(stillMinutes(millis())),
       static_cast<unsigned long>(stillWatchMin),
       stillWatchMin == 0 ? ", disabled" : "",
       stillFlag ? 1 : 0);
  outf("  fall confidence: last %u/%u (gate arms on a spike-then-stillness verdict)\n",
       static_cast<unsigned>(lastFallConf),
       static_cast<unsigned>(KH_FALL_CONFIRM_N));
  outf("  uptime %lu:%02lu:%02lu  heap %u  rssi %s%d  night=%d quiet=%d\n",
       static_cast<unsigned long>(up / 3600UL),
       static_cast<unsigned long>((up / 60UL) % 60UL),
       static_cast<unsigned long>(up % 60UL),
       static_cast<unsigned>(ESP.getFreeHeap()),
       wifiUp ? "" : "(down) ", wifiUp ? WiFi.RSSI() : 0,
       nightNow ? 1 : 0,
       timeSynced && inQuietHours() ? 1 : 0);
  outf("  leds: %s\n", ledName);
}

void applyThreshold(float thr) {
  store.saveThreshold(&cfg, thr);
  smParams.threshold = thr;
  sm.begin(smParams);
  klog("threshold set to %.2f (saved)", thr);
}

// Bring the Bluetooth Classic SPP server up. The controller can only be
// enabled once per boot (the ESP-IDF cannot switch the controller mode
// afterwards), so the server stays up even if the operator switches back to
// another transport — the other transports just stop using it.
void startBtLink() {
  if (bt.active()) {
    klog("bluetooth already up as \"%s\"", cfg.btName);
    return;
  }
  if (bt.begin(cfg.btName, cfg.btPin)) {
    klog("bluetooth classic SPP up as \"%s\" (pin %s)", cfg.btName,
         cfg.btPin[0] ? cfg.btPin : "none");
    klog("pair the peer with that name, then run:");
    klog("  python3 firmware/tunnel/bt_bridge.py");
  } else {
    klog("bluetooth failed to start — no Bluetooth Classic radio on this board?");
  }
}

void dispatchCli(char *line) {
  while (*line == ' ') line++;
  char *space = strchr(line, ' ');
  const char *arg = "";
  if (space) {
    *space = '\0';
    arg = space + 1;
    while (*arg == ' ') arg++;
  }
  if (strcmp(line, "help") == 0) {
    printHelp();
  } else if (strcmp(line, "show") == 0) {
    printShow();
  } else if (strcmp(line, "cal") == 0) {
    startCalibration();
  } else if (strcmp(line, "thr") == 0) {
    const float thr = atof(arg);
    if (thr <= 0) {
      klog("usage: thr <positive float>  e.g. thr 25");
    } else {
      applyThreshold(thr);
    }
  } else if (strcmp(line, "ssid") == 0) {
    if (!arg[0]) { klog("usage: ssid <name>"); return; }
    store.saveSsid(&cfg, arg);
    klog("ssid saved, connecting...");
    WiFi.begin(cfg.ssid, cfg.password);
  } else if (strcmp(line, "pass") == 0) {
    if (!arg[0]) { klog("usage: pass <password>"); return; }
    store.savePassword(&cfg, arg);
    klog("password saved, connecting...");
    WiFi.begin(cfg.ssid, cfg.password);
  } else if (strcmp(line, "host") == 0) {
    if (!arg[0]) { klog("usage: host <base url, e.g. http://192.168.1.20:3100>"); return; }
    store.saveHost(&cfg, arg);
    klog("host saved");
  } else if (strcmp(line, "hh") == 0) {
    store.saveHouseholdId(&cfg, arg);
    leds.onIdentity();  // pink double-pulse: a new identity just arrived
    klog("householdId saved");
  } else if (strcmp(line, "src") == 0) {
    store.saveSourceId(&cfg, arg);
    leds.onIdentity();
    klog("sourceId saved");
  } else if (strcmp(line, "key") == 0) {
    store.saveApiKey(&cfg, arg);
    leds.onIdentity();
    klog("apiKey saved");
  } else if (strcmp(line, "mode") == 0) {
    if (strcmp(arg, "lan") == 0) {
      store.saveTransport(&cfg, TRANSPORT_LAN);
      klog("transport = lan");
    } else if (strcmp(arg, "serial") == 0) {
      store.saveTransport(&cfg, TRANSPORT_SERIAL);
      klog("transport = serial");
    } else if (strcmp(arg, "bt") == 0) {
      store.saveTransport(&cfg, TRANSPORT_BT);
      klog("transport = bt");
      startBtLink();
    } else {
      klog("usage: mode <lan|serial|bt>");
    }
  } else if (strcmp(line, "bt") == 0) {
    if (!bt.active()) {
      klog("bluetooth: off (transport is %s) — start it with: mode bt",
           transportName());
    } else {
      klog("bluetooth: up, name \"%s\", pin %s, peer %s", cfg.btName,
           cfg.btPin[0] ? cfg.btPin : "none",
           bt.connected() ? "connected" : "not connected");
    }
  } else if (strcmp(line, "btname") == 0) {
    if (!arg[0]) { klog("usage: btname <name>"); return; }
    if (strlen(arg) > sizeof(cfg.btName) - 1) {
      klog("usage: btname <name, max %u chars>", sizeof(cfg.btName) - 1);
      return;
    }
    store.saveBtName(&cfg, arg);
    klog("bluetooth name saved (%s) — the advertised name changes on reboot",
         cfg.btName);
  } else if (strcmp(line, "btpin") == 0) {
    if (!arg[0]) { klog("usage: btpin <pin>"); return; }
    if (strlen(arg) > sizeof(cfg.btPin) - 1) {
      klog("usage: btpin <pin, max %u chars>", sizeof(cfg.btPin) - 1);
      return;
    }
    store.saveBtPin(&cfg, arg);
    klog("bluetooth pin saved (takes effect on the next mode bt / reboot)");
  } else if (strcmp(line, "wifi") == 0) {
    if (strcmp(arg, "off") == 0) {
      // Freeing the Wi-Fi driver is the "pure Bluetooth" mode — but CSI is
      // Wi-Fi traffic, so sensing stops with it. Say so plainly.
      WiFi.disconnect(false, false);
      WiFi.mode(WIFI_OFF);
      klog("Wi-Fi radio off — CSI stops (no AP, no CSI); Bluetooth keeps reporting");
    } else if (strcmp(arg, "on") == 0) {
      WiFi.mode(WIFI_STA);
      WiFi.setAutoReconnect(true);
      WiFi.setSleep(false);
      // CSI must be configured after the Wi-Fi driver starts, or the sensor
      // silently never sees a frame.
      csi.begin();
      if (cfg.ssid[0]) {
        klog("connecting to \"%s\" ...", cfg.ssid);
        WiFi.begin(cfg.ssid, cfg.password);
      }
      klog("Wi-Fi radio on");
    } else {
      klog("usage: wifi <on|off>  (currently %s)", wifiUp ? "up" : "down");
    }
  } else if (strcmp(line, "enc") == 0) {
    if (strcmp(arg, "on") == 0) {
      store.saveEncrypt(&cfg, true);
      klog("LAN ingest sealed with AES-256-GCM (saved)");
    } else if (strcmp(arg, "off") == 0) {
      store.saveEncrypt(&cfg, false);
      klog("LAN ingest PLAINTEXT (debugging only)");
    } else {
      klog("usage: enc <on|off>");
    }
  } else if (strcmp(line, "falltest") == 0) {
    klog("falltest: emitting one 'fall' presence event");
    emitPresence("fall");
    // The demo hook bypasses the confidence gate (it is an explicit
    // request), but the board must still show it: solid/strobe red, triple
    // pink pulse.
    leds.onPresence("fall");
  } else if (strcmp(line, "ir") == 0) {
    if (strcmp(arg, "off") == 0) {
      ir.setEnabled(false);
      klog("ir beam channel off");
    } else if (strcmp(arg, "on") == 0) {
      ir.setEnabled(true);
      klog("ir beam channel on");
    } else {
      klog("usage: ir <on|off>  (currently %s, %s)",
           ir.enabled() ? "on" : "off",
           ir.state() == IrSensor::State::DETECTED ? "object detected" : "clear");
    }
  } else if (strcmp(line, "bssid") == 0) {
    if (strcmp(arg, "off") == 0) {
      csi.setBssidFilter(false);
      csiFilterOn = false;
      klog("bssid filter off — CSI accepts every transmitter");
    } else if (strcmp(arg, "on") == 0) {
      csi.setBssidFilter(true);
      csiFilterOn = true;
      lastFramesSeenMs = 0;
      klog("bssid filter on — CSI accepts only the AP's radio frames");
    } else {
      klog("usage: bssid <on|off>  (currently %s)", csiFilterOn ? "on" : "off");
    }
  } else if (strcmp(line, "ping") == 0) {
    if (strcmp(arg, "off") == 0) {
      traffic.setEnabled(false);
      klog("gateway ping traffic off (CSI goes quiet on an idle AP)");
    } else if (strcmp(arg, "on") == 0) {
      traffic.setEnabled(true);
      klog("gateway ping traffic on");
    } else {
      klog("usage: ping <on|off>  (currently %s)", traffic.enabled() ? "on" : "off");
    }
  } else if (strcmp(line, "csi") == 0) {
    if (strcmp(arg, "off") == 0) {
      csiStreamOn = false;
      csiBatchCount = 0;
      klog("csi scope stream off");
    } else if (strcmp(arg, "on") == 0) {
      csiStreamOn = true;
      klog("csi scope stream on");
    } else {
      klog("usage: csi <on|off>  (currently %s)", csiStreamOn ? "on" : "off");
    }
  } else if (strcmp(line, "scan") == 0) {
    klog("scanning Wi-Fi networks (blocking, up to ~15 s)...");
    // Bounded scan: the Mac-side relay waits for the scanDone marker, so the
    // device must not hang here forever.
    WiFi.setScanTimeout(15000);
    const int n = WiFi.scanNetworks(false /* blocking */);
    if (n > 0) {
      for (int i = 0; i < n; i++) {
        String ssid = WiFi.SSID(i);
        ssid.replace("\\", "\\\\");
        ssid.replace("\"", "\\\"");
        // one JSON line per network — the Mac-side relay collects these
        outf("{\"scan\":true,\"ssid\":\"%s\",\"rssi\":%d,\"secure\":%s}\n",
             ssid.c_str(), WiFi.RSSI(i),
             WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "false" : "true");
      }
      outf("{\"scanDone\":true,\"count\":%d}\n", n);
    } else {
      // Say so plainly — "no networks here" and "the scan failed" are very
      // different problems for whoever is debugging.
      outf("{\"scanDone\":true,\"count\":0,\"error\":\"%s\"}\n",
           n == 0 ? "no networks found" : "scan failed");
      klog("scan finished with no networks (n=%d)", n);
    }
    WiFi.scanDelete();
  } else if (strcmp(line, "wififorget") == 0) {
    store.saveSsid(&cfg, "");
    store.savePassword(&cfg, "");
    WiFi.disconnect(true, true);  // erase AP credentials too
    klog("Wi-Fi forgotten — set a new network with ssid/pass");
    printShow();
  } else if (strcmp(line, "statusjson") == 0) {
    const char *btState = !bt.active() ? "off"
                                         : (bt.connected() ? "connected" : "up");
    // Enrichment for the relay/dashboard: uptime, free heap, the activity
    // class, the inactivity-watchdog state, the fall-confidence gate, night
    // mode and the current LED scenario — added fields only, so an older
    // reader that only knows status/connected keeps working.
    const unsigned long up = static_cast<unsigned long>(millis() / 1000UL);
    char ledName[64];
    leds.scenarioName(ledName, sizeof(ledName));
    if (wifiUp) {
      outf("{\"status\":true,\"connected\":true,\"ssid\":\"%s\","
           "\"rssi\":%d,\"ip\":\"%s\",\"fw\":\"%s\",\"bt\":\"%s\","
           "\"up\":%lu,\"heap\":%u,\"act\":\"%s\",\"still\":%d,"
           "\"stillmin\":%lu,\"fconf\":%u,\"night\":%d,\"led\":\"%s\"}\n",
           cfg.ssid, WiFi.RSSI(), WiFi.localIP().toString().c_str(),
           kFwVersion, btState, up,
           static_cast<unsigned>(ESP.getFreeHeap()), activityName(actClass),
           stillFlag ? 1 : 0,
           static_cast<unsigned long>(stillMinutes(millis())),
           static_cast<unsigned>(lastFallConf), nightNow ? 1 : 0, ledName);
    } else {
      outf("{\"status\":true,\"connected\":false,\"ssid\":\"%s\","
           "\"fw\":\"%s\",\"bt\":\"%s\","
           "\"up\":%lu,\"heap\":%u,\"act\":\"%s\",\"still\":%d,"
           "\"stillmin\":%lu,\"fconf\":%u,\"night\":%d,\"led\":\"%s\"}\n",
           cfg.ssid, kFwVersion, btState, up,
           static_cast<unsigned>(ESP.getFreeHeap()), activityName(actClass),
           stillFlag ? 1 : 0,
           static_cast<unsigned long>(stillMinutes(millis())),
           static_cast<unsigned>(lastFallConf), nightNow ? 1 : 0, ledName);
    }
  } else if (strcmp(line, "ledtest") == 0) {
    if (leds.testActive()) {
      leds.endTest();
      klog("ledtest: stopped — live LED rendering resumed");
    } else {
      leds.beginTest();
      klog("ledtest: playing every LED scenario, ~2.5 s each (~45 s total);");
      klog("ledtest: the name of each scenario prints as it plays. Run");
      klog("ledtest: 'ledtest' again to stop early.");
    }
  } else if (strcmp(line, "stillmin") == 0) {
    const long m = atol(arg);
    if (m < 0 || m > 720) {
      klog("usage: stillmin <0-720 minutes> (0 disables; current %lu, session only)",
           static_cast<unsigned long>(stillWatchMin));
    } else {
      stillWatchMin = static_cast<uint32_t>(m);
      stillFlag = false;
      lastMotionMs = millis();  // restart the clock on a retune
      klog("inactivity watchdog: %lu min without motion flags still=1 (session only)",
           static_cast<unsigned long>(stillWatchMin));
    }
  } else if (strcmp(line, "tzh") == 0) {
    const long h = atol(arg);
    if (h < -12 || h > 14) {
      klog("usage: tzh <-12..14> UTC offset for quiet hours (current %d, session only)",
           tzOffsetHours);
    } else {
      tzOffsetHours = static_cast<int>(h);
      klog("UTC offset %+d — quiet hours %02d:00-%02d:00 local (session only)",
           tzOffsetHours, KH_QUIET_START_HOUR, KH_QUIET_END_HOUR);
    }
  } else if (strcmp(line, "factory") == 0) {
    store.factoryReset(&cfg);
    klog("NVS cleared; compiled defaults restored");
    printShow();
  } else if (line[0]) {
    klog("unknown command '%s' — try 'help'", line);
  }
}

void handleCli() {
  static char line[128];
  static size_t len = 0;
  // Commands arrive on the USB serial port and on the Bluetooth link: the
  // operator may be at the terminal or at the phone, and the same grammar
  // (thr, cal, falltest, mode, ...) has to work on both.
  while (true) {
    int c = -1;
    if (Serial.available()) {
      c = Serial.read();
    } else if (bt.active() && bt.available() > 0) {
      c = bt.read();
    }
    if (c < 0) break;
    if (c == '\r') continue;
    if (c == '\n') {
      line[len] = '\0';
      dispatchCli(line);
      len = 0;
    } else if (len < sizeof(line) - 1) {
      line[len++] = static_cast<char>(c);
    } else {
      len = 0;  // overlong input: drop the line
    }
  }
}

// ------------------------------------------------------------------- setup
void printBanner() {
  Serial.println();
  Serial.println("==============================================");
  Serial.printf("Khayaal CSI room sensor v%s (%s %s)\n", kFwVersion,
                __DATE__, __TIME__);
  Serial.println("presence + variance scalars only — raw CSI never leaves");
  Serial.println("==============================================");
  if (!timeSynced && cfg.transport == TRANSPORT_LAN) {
    klog("note: without NTP the LAN path cannot stamp ts; sync once online");
  }
  if (!timeSynced && cfg.transport == TRANSPORT_BT) {
    klog("note: without NTP the BT path omits ts; the relay stamps it");
  }
}

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(200);
  printBanner();

  leds.begin();

  store.load(&cfg);
  smParams.threshold = cfg.threshold;
  sm.begin(smParams);
  leds.onTransport(cfg.transport);  // green's scenario follows the transport

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  // CSI needs the radio listening continuously: in the default modem power
  // save the radio dozes between DTIM beacons and captures nothing, so every
  // esp-csi example turns power save off. This is the difference between
  // "waiting for frames" forever and a live waveform.
  WiFi.setSleep(false);
  WiFi.onEvent(onWifiEvent);
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");

  // CSI must be configured AFTER the Wi-Fi driver is started: before
  // WiFi.mode() the esp_wifi_set_csi* calls fail on an uninitialized driver
  // and the sensor silently never sees a frame.
  csi.begin();
  ir.begin();
  ir.onEvent(onIrEvent);

  if (cfg.ssid[0]) {
    klog("connecting to \"%s\" ...", cfg.ssid);
    WiFi.begin(cfg.ssid, cfg.password);
  } else {
    klog("no Wi-Fi configured — CSI needs a 2.4 GHz AP even in serial mode");
    klog("set one from this monitor:  ssid <name>  then  pass <password>");
  }

  // The Bluetooth stack is started only in BT mode: a serial or LAN install
  // pays neither its RAM nor its RF coexistence cost (the Wi-Fi radio and
  // the BT radio share one 2.4 GHz front end, and that costs CSI quality).
  if (cfg.transport == TRANSPORT_BT) {
    startBtLink();
  }
  printShow();
}

void loop() {
  const uint32_t nowMs = millis();
  handleCli();

  // The Wi-Fi flag is written from the event handler; the LEDs read it here,
  // in loop context, so no LED work ever happens off the main task. The
  // transport and SPP state feed green's scenario the same way.
  leds.onWifi(wifiUp, nowMs);
  leds.onTransport(cfg.transport);
  leds.onBt(bt.active());
  traffic.onWifi(wifiUp);

  // Night mode (quiet hours) on a 1 s cadence — the LEDs dim to ~30% when
  // the elder should be asleep. Needs NTP: without it the board cannot know
  // the hour, so no dimming (and the inactivity watchdog stays off too).
  if (nowMs - lastNightCheckMs >= 1000) {
    lastNightCheckMs = nowMs;
    const bool quiet = timeSynced && inQuietHours();
    if (quiet != nightNow) {
      nightNow = quiet;
      klog("night mode %s (LEDs at ~30%%, alarms exempt)",
           quiet ? "on" : "off");
    }
    leds.onNight(nightNow);
  }

  // Bench check: `ledtest` plays a scripted scenario every ~2.5 s and names
  // it here, so the whole LED language can be verified in under a minute.
  if (leds.testActive()) {
    const char *step = leds.testStepName();
    if (step != lastTestStepName) {
      lastTestStepName = step;
      klog("ledtest: %s", step);
    }
  } else {
    lastTestStepName = nullptr;
  }

  if (cal.active) {
    runCalibration(nowMs);
    leds.tick(nowMs);
    traffic.tick(nowMs);
    return;
  }

  if (!timeSynced && time(nullptr) > 1700000000L) {
    timeSynced = true;
    klog("time synced via NTP");
  }

  if (nowMs - lastSenseMs >= kSensePeriodMs) {
    lastSenseMs = nowMs;
    CsiSensor::Stats st;
    const bool haveData = csi.readStats(&st);
    if (haveData) {
      lastVariance = st.variance;
      lastMean = st.mean;
      lastPacketRate = st.packetRate;
      lastFastVariance = st.fastVariance;
      if (csiStreamOn && csiBatchCount < KH_CSI_BATCH) {
        csiBatch[csiBatchCount] = st.variance;
        csiFastBatch[csiBatchCount] = st.fastVariance;
        csiBatchCount++;
      }
    }
    const Presence before = sm.state();
    const Presence after =
        sm.update(wifiUp, haveData, lastVariance, nowMs);
    if (after != before) {
      if (after == Presence::Lost) klog("presence lost (no Wi-Fi link)");
      if (after == Presence::Fall) klog("FALL pattern detected (spike then stillness)");
      if (after == Presence::Fall) {
        // Confidence gate: the state machine's verdict is one-shot and it
        // has already settled back to Idle — the event only goes out (and
        // the red/pink SOS feedback only fires) when the evidence backs it.
        if (confirmFall(nowMs)) {
          emitPresence(presenceValue(after));
          leds.onPresence(presenceValue(after));
        }
      } else {
        emitPresence(presenceValue(after));
        leds.onPresence(presenceValue(after));
      }
    }
    if (haveData) {
      leds.onCsiSample(nowMs);
      lastFramesSeenMs = nowMs;
      // Red's brightness: how far the reading rises above the room's own
      // quiet, not just the motion threshold. The threshold is a verdict
      // (motion needs 2 s above it) — the LED is an instrument, so it uses
      // the fast window against an EMA of the slow one and reacts to a hand
      // that would never survive the verdict's 2 s bar.
      ledBaseline = ledBaseline == 0.0f
                        ? lastVariance
                        : 0.97f * ledBaseline + 0.03f * lastVariance;
      const float ref = cfg.threshold > 4.0f * ledBaseline
                            ? cfg.threshold
                            : 4.0f * ledBaseline;
      float level = (lastFastVariance - 1.6f * ledBaseline) / (2.0f * ref + 1e-6f);
      level = level < 0.0f ? 0.0f : (level > 1.0f ? 1.0f : level);
      leds.onMotionLevel(level);
      lastRedLevel = level;
      // Inactivity watchdog reset: the same bar the motion verdict uses.
      if (lastVariance >= cfg.threshold) {
        lastMotionMs = nowMs;
        if (stillFlag) {
          stillFlag = false;
          klog("watchdog: motion — still cleared");
        }
      }
      recordFallEvidence(nowMs);  // spike/fast-jump/IR evidence for the fall gate
    } else {
      leds.onMotionLevel(0.0f);
      lastRedLevel = 0.0f;
    }
    tickClassifier(nowMs, haveData);  // 1 Hz inside this 4 Hz tick
    if (nowMs - lastStatusMs >= kStatusPeriodMs) {
      lastStatusMs = nowMs;
      if (haveData) {
        klog("csi var=%.2f mean=%.1f pkt/s=%.1f thr=%.1f state=%s act=%s red=%d%% ir=%s",
             lastVariance, lastMean, lastPacketRate, cfg.threshold,
             presenceValue(sm.state()), activityName(actClass),
             static_cast<int>(lastRedLevel * 100.0f),
             ir.state() == IrSensor::State::DETECTED ? "near" : "clear");
      } else {
        klog("csi waiting for frames (wifi=%s) state=%s act=%s",
             wifiUp ? "up" : "down", presenceValue(sm.state()),
             activityName(actClass));
      }
    }
  }

  tickWatchdog(nowMs);  // 1 s cadence, outside the sense gate (runs with no data)

  // One batched CSI event per second. The scope on the dashboard draws these
  // as a live waveform; the presence state above still decides everything
  // that matters.
  if (csiStreamOn && csiBatchCount > 0 &&
      nowMs - lastCsiEmitMs >= KH_CSI_EMIT_MS) {
    lastCsiEmitMs = nowMs;
    emitCsi();
  }

  if (wifiUp && (sm.state() == Presence::Idle || sm.state() == Presence::Motion) &&
      nowMs - lastHeartbeatMs >= KH_HEARTBEAT_MS) {
    lastHeartbeatMs = nowMs;
    emitPresence(presenceValue(sm.state()));
  }

  // The BSSID filter can silence the sensor completely: a router answers
  // pings from its LAN MAC, not the radio BSSID. If the link is up and no
  // frame has passed the filter for a while, relax it rather than go blind.
  if (wifiUp && csiFilterOn &&
      nowMs - (lastFramesSeenMs != 0 ? lastFramesSeenMs : wifiUpSinceMs) >
          KH_CSI_FILTER_RELAX_MS) {
    csi.setBssidFilter(false);
    csiFilterOn = false;
    klog("csi: no frames matched the AP filter — accepting all transmitters");
    klog("     (restore with: bssid on)");
  }

  ir.tick(nowMs);
  pollDeviceActions(nowMs);
  // The Bluetooth peer gets first refusal on a queued event; the LAN leg
  // takes it when nobody is listening over BT.
  flushBt();
  flushLan(nowMs);
  leds.tick(nowMs);
  traffic.tick(nowMs);
}
