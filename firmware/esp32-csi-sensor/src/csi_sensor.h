/**
 * @file csi_sensor.h
 * @brief Wi-Fi CSI (Channel State Information) receiver and amplitude
 *        variance estimator.
 *
 * Minimal port of the sensing pipeline of Espressif's esp-csi
 * (github.com/espressif/esp-csi): each received frame carries per-subcarrier
 * I/Q samples in its long training field; we collapse them to one mean
 * amplitude per frame and keep a rolling window of those means. Human motion
 * perturbs the channel faster than a still room, so the variance of the
 * window rises. Privacy: only this one scalar ever leaves the device — raw
 * CSI never does.
 */
#pragma once

#include <stdint.h>

#include "config.h"

class CsiSensor {
 public:
  struct Stats {
    float variance;     // variance of mean subcarrier amplitude over window
    float mean;         // mean subcarrier amplitude
    uint32_t samples;   // packets in the window
    float packetRate;   // CSI frames per second
  };

  void begin();
  /** Call once the STA is associated: locks the BSSID filter onto the AP. */
  void onWifiConnected(const uint8_t bssid[6]);
  void onWifiDisconnected();
  /** Refresh stats; false when there is not enough data yet. */
  bool readStats(Stats *out);

 private:
  static void rxCallback(void *ctx, void *info);  // wifi_csi_info_t*, opaque

  float window_[KH_CSI_WINDOW];
  uint32_t mux_;                    // portMUX_TYPE, kept opaque for the header
  volatile uint16_t count_ = 0;
  volatile uint16_t head_ = 0;
  volatile uint32_t totalPackets_ = 0;
  uint32_t lastStatsTotal_ = 0;
  uint32_t lastStatsMs_ = 0;
  bool haveRateSample_ = false;
  uint8_t bssid_[6];
  bool bssidKnown_ = false;
};
