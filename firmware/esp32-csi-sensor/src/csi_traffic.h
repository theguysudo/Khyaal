/**
 * @file csi_traffic.h
 * @brief Keeps frames flowing so the CSI sensor has something to measure.
 *
 * The CSI receiver only captures HT data frames from the associated AP. On a
 * quiet network — no downloads, no other clients talking to us — there is
 * nothing to measure and the state machine sits at "waiting for frames"
 * forever. The fix is the one Espressif's own esp-csi examples use: the
 * device pings its gateway ~10 times a second, and the gateway's replies
 * (which come from the AP itself, i.e. the BSSID the CSI filter wants) keep
 * a steady baseline of frames. A hand near the antenna perturbs that
 * baseline; the variance does the rest.
 */
#pragma once

#include <stdint.h>

class CsiTraffic {
 public:
  void begin();
  /** Feed the current Wi-Fi link state; reacts to changes only. */
  void onWifi(bool up);
  /** Retry a failed session start; call once per loop(). */
  void tick(uint32_t nowMs);
  void setEnabled(bool on) { enabled_ = on; }
  bool enabled() const { return enabled_; }

 private:
  void startSession();
  void stopSession();

  bool enabled_ = true;
  bool wifiUp_ = false;
  bool running_ = false;
  uint32_t lastAttemptMs_ = 0;
};
