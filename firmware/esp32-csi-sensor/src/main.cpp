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
 *          TRANSPORT_LAN   — HTTP POST to the backend ingest endpoint.
 *
 * Privacy: presence state only. Raw CSI never leaves the device.
 *
 * Serial CLI (115200 baud): help, show, cal, thr <f>, ssid <s>, pass <p>,
 * host <url>, hh <id>, src <id>, key <sk_...>, mode <lan|serial>, factory.
 */
#include <algorithm>

#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <time.h>

#include "config.h"
#include "config_store.h"
#include "csi_sensor.h"
#include "csi_traffic.h"
#include "ir_sensor.h"
#include "led_controller.h"
#include "presence.h"
#include "tunnel_crypto.h"

namespace {
constexpr const char *kFwVersion = "1.0.0";
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

// ------------------------------------------------------------------ logging
// Every log line starts with "[<ms>] " — deliberately not JSON, so the
// serial bridge can tell log output from presence events at a glance.
void klog(const char *fmt, ...) {
  char buf[256];
  va_list args;
  va_start(args, fmt);
  vsnprintf(buf, sizeof(buf), fmt, args);
  va_end(args);
  Serial.print('[');
  Serial.print(millis());
  Serial.print("] ");
  Serial.println(buf);
}

// --------------------------------------------------------------------- time
uint64_t epochMs() {
  struct timeval tv;
  gettimeofday(&tv, nullptr);
  return static_cast<uint64_t>(tv.tv_sec) * 1000ULL +
         static_cast<uint64_t>(tv.tv_usec) / 1000ULL;
}

// ------------------------------------------------------------------- events
void buildEventJson(char *out, size_t cap, const char *value) {
  if (timeSynced) {
    // NTP-synced: stamp here. Otherwise omit `ts` — the serial bridge fills
    // it in; the LAN path logs a warning once at boot instead.
    snprintf(out, cap, "{\"type\":\"presence\",\"value\":\"%s\",\"ts\":%llu}",
             value, static_cast<unsigned long long>(epochMs()));
  } else {
    snprintf(out, cap, "{\"type\":\"presence\",\"value\":\"%s\"}", value);
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
                   "\"pkt\":%.1f,\"state\":\"%s\",\"thr\":%.1f,\"ir\":%d,\"samples\":[",
                   slowVariance, mean, packetRate, state, cfg.threshold,
                   ir.state() == IrSensor::State::DETECTED ? 1 : 0);
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
  } else {
    Serial.println(json);
  }
}

// ------------------------------------------------------------------ lan tx
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
  if (cfg.transport != TRANSPORT_LAN || !wifiUp) return;
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
  klog("cal: logging variance for 60 s — leave the room EMPTY and still");
}

void finishCalibration() {
  cal.active = false;
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
    }
  }
  http.end();
}

// ------------------------------------------------------------------- cli
void printHelp() {
  Serial.println();
  Serial.println("Khayaal room sensor CLI");
  Serial.println("  help            this text");
  Serial.println("  show            effective config + sensor state");
  Serial.println("  cal             60 s variance log for threshold setting");
  Serial.println("  thr <float>     motion threshold (variance units), saved");
  Serial.println("  ssid <name>     Wi-Fi SSID (2.4 GHz), saved");
  Serial.println("  pass <pass>     Wi-Fi password, saved");
  Serial.println("  host <url>      LAN backend base URL, saved");
  Serial.println("  hh <id>         householdId (LAN mode), saved");
  Serial.println("  src <id>        sourceId (LAN mode), saved");
  Serial.println("  key <sk_...>    apiKey (LAN mode), saved");
  Serial.println("  mode <lan|serial>   transport, saved");
  Serial.println("  enc <on|off>    AES-256-GCM seal LAN ingest (on = default), saved");
  Serial.println("  scan            scan Wi-Fi networks, print JSON lines (relay)");
  Serial.println("  csi <on|off>    stream the live CSI scope readings (on = default)");
  Serial.println("  ping <on|off>   gateway ping traffic that feeds CSI frames (on = default)");
  Serial.println("  bssid <on|off>  CSI frame filter (auto-relaxes if the AP sends none)");
  Serial.println("  ir <on|off>     reflective IR beam channel on GPIO 23 (on = default)");
  Serial.println("  wififorget      clear stored Wi-Fi, disconnect");
  Serial.println("  statusjson      one-line machine-readable status (relay)");
  Serial.println("  factory         clear NVS, back to compiled defaults");
  Serial.println("  falltest        emit one 'fall' event (demo/test hook)");
}

void printShow() {
  Serial.println("config:");
  Serial.printf("  transport: %s\n",
               cfg.transport == TRANSPORT_LAN ? "lan" : "serial");
  Serial.printf("  ssid: %s  pass: %s\n", cfg.ssid,
                cfg.password[0] ? "********" : "(none)");
  Serial.printf("  host: %s\n", cfg.host);
  Serial.printf("  hh: %s  src: %s\n", cfg.householdId, cfg.sourceId);
  if (cfg.apiKey[0]) {
    char masked[12];
    snprintf(masked, sizeof(masked), "%.6s...", cfg.apiKey);
    Serial.printf("  key: %s\n", masked);
  } else {
    Serial.println("  key: (none)");
  }
  Serial.printf("  threshold: %.2f\n", cfg.threshold);
  Serial.printf("  encrypt: %s\n", cfg.encrypt ? "on (AES-256-GCM)" : "off (PLAINTEXT)");
  Serial.printf("state: %s  var=%.2f mean=%.1f pkt/s=%.1f wifi=%s time=%s\n",
                presenceValue(sm.state()), lastVariance, lastMean,
                lastPacketRate, wifiUp ? "up" : "down",
                timeSynced ? "synced" : "unsynced");
}

void applyThreshold(float thr) {
  store.saveThreshold(&cfg, thr);
  smParams.threshold = thr;
  sm.begin(smParams);
  klog("threshold set to %.2f (saved)", thr);
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
    klog("householdId saved");
  } else if (strcmp(line, "src") == 0) {
    store.saveSourceId(&cfg, arg);
    klog("sourceId saved");
  } else if (strcmp(line, "key") == 0) {
    store.saveApiKey(&cfg, arg);
    klog("apiKey saved");
  } else if (strcmp(line, "mode") == 0) {
    if (strcmp(arg, "lan") == 0) {
      store.saveTransport(&cfg, TRANSPORT_LAN);
      klog("transport = lan");
    } else if (strcmp(arg, "serial") == 0) {
      store.saveTransport(&cfg, TRANSPORT_SERIAL);
      klog("transport = serial");
    } else {
      klog("usage: mode <lan|serial>");
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
        Serial.printf("{\"scan\":true,\"ssid\":\"%s\",\"rssi\":%d,\"secure\":%s}\n",
                      ssid.c_str(), WiFi.RSSI(i),
                      WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "false" : "true");
      }
      Serial.printf("{\"scanDone\":true,\"count\":%d}\n", n);
    } else {
      // Say so plainly — "no networks here" and "the scan failed" are very
      // different problems for whoever is debugging.
      Serial.printf("{\"scanDone\":true,\"count\":0,\"error\":\"%s\"}\n",
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
    if (wifiUp) {
      Serial.printf("{\"status\":true,\"connected\":true,\"ssid\":\"%s\","
                    "\"rssi\":%d,\"ip\":\"%s\",\"fw\":\"%s\"}\n",
                    cfg.ssid, WiFi.RSSI(), WiFi.localIP().toString().c_str(),
                    kFwVersion);
    } else {
      Serial.printf("{\"status\":true,\"connected\":false,\"ssid\":\"%s\","
                    "\"fw\":\"%s\"}\n", cfg.ssid, kFwVersion);
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
  while (Serial.available()) {
    const char c = static_cast<char>(Serial.read());
    if (c == '\r') continue;
    if (c == '\n') {
      line[len] = '\0';
      dispatchCli(line);
      len = 0;
    } else if (len < sizeof(line) - 1) {
      line[len++] = c;
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
  printShow();
}

void loop() {
  const uint32_t nowMs = millis();
  handleCli();

  // The Wi-Fi flag is written from the event handler; the LEDs read it here,
  // in loop context, so no LED work ever happens off the main task.
  leds.onWifi(wifiUp, nowMs);
  traffic.onWifi(wifiUp);

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
      emitPresence(presenceValue(after));
      leds.onPresence(presenceValue(after));
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
      float level = (lastFastVariance - 1.6f * ledBaseline) / (ref + 1e-6f);
      level = level < 0.0f ? 0.0f : (level > 1.0f ? 1.0f : level);
      leds.onMotionLevel(level);
      lastRedLevel = level;
    } else {
      leds.onMotionLevel(0.0f);
      lastRedLevel = 0.0f;
    }
    if (nowMs - lastStatusMs >= kStatusPeriodMs) {
      lastStatusMs = nowMs;
      if (haveData) {
        klog("csi var=%.2f mean=%.1f pkt/s=%.1f thr=%.1f state=%s red=%d%% ir=%s",
             lastVariance, lastMean, lastPacketRate, cfg.threshold,
             presenceValue(sm.state()),
             static_cast<int>(lastRedLevel * 100.0f),
             ir.state() == IrSensor::State::DETECTED ? "near" : "clear");
      } else {
        klog("csi waiting for frames (wifi=%s) state=%s",
             wifiUp ? "up" : "down", presenceValue(sm.state()));
      }
    }
  }

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
  flushLan(nowMs);
  leds.tick(nowMs);
  traffic.tick(nowMs);
}
