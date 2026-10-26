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
 *
 * Single instance per device (the ESP32 has one Wi-Fi radio); the rolling
 * window lives in csi_sensor.cpp.
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
    /**
     * Variance over the most recent packets only (~0.25 s at 100 fps). The
     * slow window is deliberately long so a fall spike cannot be averaged
     * away, but it lags a hand wave by a full window; this short view is
     * what the live scope draws.
     */
    float fastVariance;
    uint32_t fastSamples;
  };

  void begin();
  /** Call once the STA is associated: locks the BSSID filter onto the AP. */
  void onWifiConnected(const uint8_t bssid[6]);
  void onWifiDisconnected();
  /** Refresh stats; false when there is not enough data yet. */
  bool readStats(Stats *out);
};
