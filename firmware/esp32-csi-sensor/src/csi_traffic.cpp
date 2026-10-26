/**
 * @file csi_traffic.cpp
 * @brief Gateway ping session — see csi_traffic.h for why this exists.
 */
#include "csi_traffic.h"

#include <Arduino.h>
#include <WiFi.h>

extern "C" {
#include "lwip/ip_addr.h"
#include "ping/ping_sock.h"
}

namespace {

// 10 pings/s is the esp-csi example cadence: enough frames for the 100-packet
// window without heating the radio or the network.
constexpr uint32_t PING_INTERVAL_MS = 100;
constexpr uint32_t PING_TIMEOUT_MS = 90;  // stay under the interval
constexpr uint32_t RETRY_MS = 2000;

esp_ping_handle_t s_ping = nullptr;

// Matches main.cpp's log style; a local copy because klog lives in its
// anonymous namespace.
void tlog(const char *fmt, ...) {
  char buf[160];
  va_list args;
  va_start(args, fmt);
  vsnprintf(buf, sizeof(buf), fmt, args);
  va_end(args);
  Serial.print('[');
  Serial.print(millis());
  Serial.print("] ");
  Serial.println(buf);
}

}  // namespace

void CsiTraffic::begin() {}

void CsiTraffic::startSession() {
  if (s_ping != nullptr || !enabled_ || !wifiUp_) return;
  const IPAddress gw = WiFi.gatewayIP();
  if (gw == IPAddress(0, 0, 0, 0)) return;  // DHCP not done yet; tick() retries

  esp_ping_config_t cfg = ESP_PING_DEFAULT_CONFIG();
  cfg.count = ESP_PING_COUNT_INFINITE;
  cfg.interval_ms = PING_INTERVAL_MS;
  cfg.timeout_ms = PING_TIMEOUT_MS;
  ip_addr_t target;
  ip_addr_set_ip4_u32(&target, static_cast<uint32_t>(gw));
  cfg.target_addr = target;

  esp_ping_handle_t hdl = nullptr;
  if (esp_ping_new_session(&cfg, nullptr, &hdl) == ESP_OK && hdl != nullptr) {
    esp_ping_start(hdl);
    s_ping = hdl;
    tlog("traffic: pinging gateway %u.%u.%u.%u ~10/s to keep CSI frames flowing",
         gw[0], gw[1], gw[2], gw[3]);
  } else {
    tlog("traffic: ping session failed — CSI may stay quiet on an idle AP");
  }
}

void CsiTraffic::stopSession() {
  if (s_ping == nullptr) return;
  esp_ping_stop(s_ping);
  esp_ping_delete_session(s_ping);
  s_ping = nullptr;
}

void CsiTraffic::onWifi(bool up) {
  if (up == wifiUp_) return;
  wifiUp_ = up;
  if (up) {
    startSession();
  } else {
    stopSession();
  }
}

void CsiTraffic::tick(uint32_t nowMs) {
  if (!enabled_ && s_ping != nullptr) {
    stopSession();
    return;
  }
  if (s_ping == nullptr && wifiUp_ && enabled_ &&
      static_cast<int32_t>(nowMs - lastAttemptMs_) >= 0) {
    lastAttemptMs_ = nowMs + RETRY_MS;
    startSession();
  }
}
