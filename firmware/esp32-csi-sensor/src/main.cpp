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
#include "presence.h"

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

volatile bool wifiUp = false;
bool timeSynced = false;

// diagnostics snapshot for `show` / status lines
float lastVariance = 0.0f;
float lastMean = 0.0f;
float lastPacketRate = 0.0f;

// calibration session
struct Calibration {
  bool active = false;
  uint32_t startMs = 0;
  uint32_t lastSampleMs = 0;
  size_t samples = 0;
  float values[kCalMaxSamples];
} cal;

// LAN mode: single-slot pending event with exponential backoff
char pendingJson[224] = "";
uint32_t pendingAttempts = 0;
uint32_t nextLanAttemptMs = 0;

uint32_t lastSenseMs = 0;
uint32_t lastStatusMs = 0;
uint32_t lastHeartbeatMs = 0;

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
  char json[sizeof(pendingJson)];
  buildEventJson(json, sizeof(json), value);
  if (cfg.transport == TRANSPORT_LAN) {
    // Presence is level-based: coalescing to the newest event is correct.
    snprintf(pendingJson, sizeof(pendingJson), "%s", json);
    pendingAttempts = 0;
    nextLanAttemptMs = 0;
    klog("event queued for LAN: %s", json);
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
  if (cfg.transport != TRANSPORT_LAN || pendingJson[0] == '\0' || !wifiUp) {
    return;
  }
  if (pendingAttempts > 0 &&
      static_cast<int32_t>(nowMs - nextLanAttemptMs) < 0) {
    return;  // backing off
  }
  if (postIngest(pendingJson)) {
    klog("ingest ok (%s)", presenceValue(sm.state()));
    pendingJson[0] = '\0';
    pendingAttempts = 0;
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
  } else if (strcmp(line, "falltest") == 0) {
    klog("falltest: emitting one 'fall' presence event");
    emitPresence("fall");
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
  Serial.println("presence only — raw CSI never leaves this device");
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

  store.load(&cfg);
  smParams.threshold = cfg.threshold;
  sm.begin(smParams);
  csi.begin();

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.onEvent(onWifiEvent);
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");

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

  if (cal.active) {
    runCalibration(nowMs);
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
    }
    const Presence before = sm.state();
    const Presence after =
        sm.update(wifiUp, haveData, lastVariance, nowMs);
    if (after != before) {
      if (after == Presence::Lost) klog("presence lost (no Wi-Fi link)");
      if (after == Presence::Fall) klog("FALL pattern detected (spike then stillness)");
      emitPresence(presenceValue(after));
    }
    if (nowMs - lastStatusMs >= kStatusPeriodMs) {
      lastStatusMs = nowMs;
      if (haveData) {
        klog("csi var=%.2f mean=%.1f pkt/s=%.1f thr=%.1f state=%s",
             lastVariance, lastMean, lastPacketRate, cfg.threshold,
             presenceValue(sm.state()));
      } else {
        klog("csi waiting for frames (wifi=%s) state=%s",
             wifiUp ? "up" : "down", presenceValue(sm.state()));
      }
    }
  }

  if (wifiUp && (sm.state() == Presence::Idle || sm.state() == Presence::Motion) &&
      nowMs - lastHeartbeatMs >= KH_HEARTBEAT_MS) {
    lastHeartbeatMs = nowMs;
    emitPresence(presenceValue(sm.state()));
  }

  flushLan(nowMs);
}
