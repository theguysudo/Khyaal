/**
 * @file led_controller.h
 * @brief Three status LEDs driven by the room sensor's real signals.
 *
 *  GREEN (GPIO 27) — fresh CSI data: a short pulse for every accepted sample
 *    (a readStats() that returned true), rate-limited to a visible cadence.
 *    Dark means the sensor is not receiving frames.
 *  PINK  (GPIO 26) — confirmed motion: on while the presence state machine
 *    says Motion or Fall. It is NOT a per-frame indicator — a received frame
 *    is not movement, and the state machine is what decides that.
 *  RED   (GPIO 25) — fault: the Wi-Fi link dropped after having been up, or
 *    no CSI frames for DATA_TIMEOUT_MS while the link is up and past the
 *    startup grace period. It clears by itself when the condition ends, and
 *    never fires during normal startup or a brief reconnect.
 *
 * Everything is millis()-based and non-blocking: begin() once, then tick()
 * every loop() iteration. No delay() calls, no ISR work, no interference
 * with Wi-Fi, CSI capture, the presence machine, the CLI or the transports.
 */
#pragma once

#include <stdint.h>

class LedController {
 public:
  void begin();
  /** Drive the LEDs; call once per loop(). */
  void tick(uint32_t nowMs);
  /** A fresh, valid CSI sample arrived (readStats() returned true). */
  void onCsiSample(uint32_t nowMs);
  /** The presence state machine's verdict: "idle"|"motion"|"lost"|"fall". */
  void onPresence(const char *state);
  /** Current Wi-Fi link state; the controller reacts to changes only. */
  void onWifi(bool up, uint32_t nowMs);

 private:
  void write(int pin, bool on);

  bool wifiUp_ = false;
  bool everWifiUp_ = false;
  uint32_t wifiUpSinceMs_ = 0;
  bool haveCsiSample_ = false;
  uint32_t lastCsiSampleMs_ = 0;

  uint32_t greenOnUntilMs_ = 0;
  uint32_t greenNextPulseMs_ = 0;

  bool motionLatch_ = false;
};
