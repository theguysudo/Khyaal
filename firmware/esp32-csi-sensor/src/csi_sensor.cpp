/**
 * @file csi_sensor.cpp
 * @brief CSI capture + rolling amplitude-variance, ported from esp-csi.
 *
 * Works on the Arduino-esp32 cores built on both IDF 4.x and IDF 5.x: only
 * the enable call differs (esp_wifi_set_csi_en vs esp_wifi_set_csi), and the
 * wifi_csi_info_t fields used here (mac, first_word_invalid, buf, len) exist
 * in both. The rolling window lives in file-static storage — one Wi-Fi
 * radio, one sensor.
 */
#include "csi_sensor.h"

#include <Arduino.h>
#include <cmath>
#include <cstring>

extern "C" {
#include <esp_idf_version.h>
#include <esp_wifi.h>
#include <esp_wifi_types.h>
}

#if ESP_IDF_VERSION_MAJOR >= 5
#define KH_CSI_ENABLE(en) esp_wifi_set_csi(en)
#else
#define KH_CSI_ENABLE(en) esp_wifi_set_csi_en(en)
#endif

namespace {

// ----------------------------------------------------------- rolling window
portMUX_TYPE s_mux = portMUX_INITIALIZER_UNLOCKED;
float s_window[KH_CSI_WINDOW];
volatile uint16_t s_count = 0;
volatile uint16_t s_head = 0;
volatile uint32_t s_total = 0;
uint32_t s_lastStatsTotal = 0;
uint32_t s_lastStatsMs = 0;
bool s_haveRateSample = false;
uint8_t s_bssid[6];
volatile bool s_bssidKnown = false;

void csiRxCallback(void *ctx, wifi_csi_info_t *info) {
  if (info == nullptr || info->buf == nullptr || info->len < 2) return;

  // Only frames from the associated AP: ties the statistic to the link that
  // crosses the room being sensed, and ignores phones/laptops on other links.
  if (s_bssidKnown && memcmp(info->mac, s_bssid, 6) != 0) return;

  const int start = info->first_word_invalid ? 2 : 0;  // invalid first word
  float sum = 0.0f;
  int subcarriers = 0;
  for (int i = start; i + 1 < info->len; i += 2) {
    const float iPart = static_cast<float>(info->buf[i]);
    const float qPart = static_cast<float>(info->buf[i + 1]);
    sum += sqrtf(iPart * iPart + qPart * qPart);
    subcarriers++;
  }
  if (subcarriers == 0) return;
  const float meanAmplitude = sum / static_cast<float>(subcarriers);

  portENTER_CRITICAL_ISR(&s_mux);
  s_window[s_head] = meanAmplitude;
  s_head = static_cast<uint16_t>((s_head + 1) % KH_CSI_WINDOW);
  if (s_count < KH_CSI_WINDOW) s_count = s_count + 1;
  s_total = s_total + 1;
  portEXIT_CRITICAL_ISR(&s_mux);
}

}  // namespace

// ---------------------------------------------------------------- public API

void CsiSensor::begin() {
  portENTER_CRITICAL(&s_mux);
  s_count = 0;
  s_head = 0;
  portEXIT_CRITICAL(&s_mux);
  s_total = 0;
  s_haveRateSample = false;
  s_bssidKnown = false;

  // Enable CSI on the Wi-Fi driver. LTF merge + channel filter mirror the
  // esp-csi defaults: cleaner subcarriers, stable length.
  wifi_csi_config_t csiConfig = {};
  csiConfig.ltf_merge_en = true;
  csiConfig.channel_filter_en = true;
  csiConfig.manu_scale = false;
  csiConfig.shift = 0;
  esp_wifi_set_csi_config(&csiConfig);
  esp_wifi_set_csi_rx_cb(&csiRxCallback, nullptr);
  KH_CSI_ENABLE(true);
}

void CsiSensor::onWifiConnected(const uint8_t bssid[6]) {
  memcpy(s_bssid, bssid, 6);
  s_bssidKnown = true;
}

void CsiSensor::onWifiDisconnected() { s_bssidKnown = false; }

bool CsiSensor::readStats(Stats *out) {
  const uint32_t now = millis();
  portENTER_CRITICAL(&s_mux);
  const uint16_t n = s_count;
  if (n < KH_CSI_MIN_SAMPLES) {
    portEXIT_CRITICAL(&s_mux);
    return false;
  }
  float sum = 0.0f, sumSq = 0.0f;
  for (uint16_t i = 0; i < n; i++) {
    const float v = s_window[i];
    sum += v;
    sumSq += v * v;
  }
  const uint32_t total = s_total;
  portEXIT_CRITICAL(&s_mux);

  const float mean = sum / static_cast<float>(n);
  const float variance = sumSq / static_cast<float>(n) - mean * mean;

  float rate = 0.0f;
  if (s_haveRateSample && now > s_lastStatsMs) {
    rate = static_cast<float>(total - s_lastStatsTotal) * 1000.0f /
           static_cast<float>(now - s_lastStatsMs);
  }
  s_lastStatsTotal = total;
  s_lastStatsMs = now;
  s_haveRateSample = true;

  out->variance = variance;
  out->mean = mean;
  out->samples = n;
  out->packetRate = rate;
  return true;
}
