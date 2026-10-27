/**
 * @file csi_sensor.cpp
 * @brief CSI capture + rolling amplitude-variance, ported from esp-csi.
 *
 * ESP32 classic (IDF 4.4, what the Arduino espressif32 platform ships today):
 * each CSI record's buf[] holds interleaved int8 I/Q pairs, optionally with
 * the first word invalid (first_word_invalid). The IDF 5.x struct gained
 * extra fields but the ones we use are unchanged, so the same code builds on
 * both — only the enable call differs.
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

// portMUX_TYPE expands to a struct; hide that from the header by overlaying
// a uint32_t of the same size (single word spinlock on Xtensa).
static_assert(sizeof(portMUX_TYPE) == sizeof(uint32_t),
              "assumed single-word portMUX on ESP32");

void CsiSensor::begin() {
  count_ = head_ = 0;
  totalPackets_ = 0;
  haveRateSample_ = false;
  bssidKnown_ = false;

  // Enable CSI on the Wi-Fi driver. LTF merge + channel filter mirror the
  // esp-csi defaults: cleaner subcarriers, stable length.
  wifi_csi_config_t csiConfig = {};
  csiConfig.ltf_merge_en = true;
  csiConfig.channel_filter_en = true;
  csiConfig.manu_scale = false;
  csiConfig.shift = 0;
  esp_wifi_set_csi_config(&csiConfig);
  esp_wifi_set_csi_rx_cb(&CsiSensor::rxCallback, this);
  KH_CSI_ENABLE(true);
}

void CsiSensor::onWifiConnected(const uint8_t bssid[6]) {
  memcpy(bssid_, bssid, 6);
  bssidKnown_ = true;
}

void CsiSensor::onWifiDisconnected() { bssidKnown_ = false; }

void CsiSensor::rxCallback(void *ctx, void *opaque) {
  wifi_csi_info_t *info = static_cast<wifi_csi_info_t *>(opaque);
  CsiSensor *self = static_cast<CsiSensor *>(ctx);
  if (info == nullptr || info->buf == nullptr || info->len < 2) return;

#if KH_CSI_FILTER_AP_BSSID
  // Only frames from the associated AP: ties the statistic to the link that
  // crosses the room being sensed, and ignores phones/laptops on other links.
  if (self->bssidKnown_ && memcmp(info->mac, self->bssid_, 6) != 0) return;
#endif

  int start = info->first_word_invalid ? 2 : 0;  // skip the invalid first word
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

  portENTER_CRITICAL_ISR(reinterpret_cast<portMUX_TYPE *>(&self->mux_));
  self->window_[self->head_] = meanAmplitude;
  self->head_ = (self->head_ + 1) % KH_CSI_WINDOW;
  if (self->count_ < KH_CSI_WINDOW) self->count_++;
  self->totalPackets_++;
  portEXIT_CRITICAL_ISR(reinterpret_cast<portMUX_TYPE *>(&self->mux_));
}

bool CsiSensor::readStats(Stats *out) {
  uint32_t now = millis();
  portENTER_CRITICAL(reinterpret_cast<portMUX_TYPE *>(&mux_));
  const size_t n = count_;
  if (n < KH_CSI_MIN_SAMPLES) {
    portEXIT_CRITICAL(reinterpret_cast<portMUX_TYPE *>(&mux_));
    return false;
  }
  float sum = 0.0f, sumSq = 0.0f;
  for (size_t i = 0; i < n; i++) {
    const float v = window_[i];
    sum += v;
    sumSq += v * v;
  }
  const uint32_t total = totalPackets_;
  portEXIT_CRITICAL(reinterpret_cast<portMUX_TYPE *>(&mux_));

  const float mean = sum / static_cast<float>(n);
  const float variance = sumSq / static_cast<float>(n) - mean * mean;

  float rate = 0.0f;
  if (haveRateSample_ && now > lastStatsMs_) {
    rate = static_cast<float>(total - lastStatsTotal_) * 1000.0f /
           static_cast<float>(now - lastStatsMs_);
  }
  lastStatsTotal_ = total;
  lastStatsMs_ = now;
  haveRateSample_ = true;

  out->variance = variance;
  out->mean = mean;
  out->samples = n;
  out->packetRate = rate;
  return true;
}
