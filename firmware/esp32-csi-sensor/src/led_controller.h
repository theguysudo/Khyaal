/**
 * @file led_controller.h
 * @brief Three status LEDs with one job each.
 *
 *  GREEN (GPIO 27) — connectivity. Solid while the Wi-Fi link is up AND the
 *    sensor is actually receiving frames; a slow blink while the link is up
 *    but the room is still quiet (connecting); dark with no link.
 *  RED (GPIO 25) — movement, brightness following intensity. The duty cycle
 *    tracks how far the CSI variance is above the motion threshold (smoothed
 *    so it glows rather than flickers); full brightness, solid, when the
 *    presence machine flags a fall (SOS), latched for SOS_LATCH_MS.
 *  PINK (GPIO 26) — link/sensor fault. Solid when the link dropped after
 *    having been up, or frames went silent for DATA_TIMEOUT_MS while the
 *    link was up past the startup grace; clears itself when the fault ends.
 *
 * Red and pink are PWM channels (LEDC); everything is millis()-based and
 * non-blocking — begin() once, tick() every loop(), no delay().
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
  /** How far the variance is above the threshold, clamped 0..1. */
  void onMotionLevel(float level);
  /** Current Wi-Fi link state; the controller reacts to changes only. */
  void onWifi(bool up, uint32_t nowMs);

 private:
  void writeDuty(int pin, uint8_t duty);

  bool redPwm_ = false;  // false when LEDC could not attach; red then is on/off

  bool wifiUp_ = false;
  bool everWifiUp_ = false;
  uint32_t wifiUpSinceMs_ = 0;
  bool haveCsiSample_ = false;
  uint32_t lastCsiSampleMs_ = 0;

  // movement intensity, smoothed so the glow breathes instead of flickering
  float level_ = 0.0f;
  float targetLevel_ = 0.0f;
  bool sosLatch_ = false;
  uint32_t sosSinceMs_ = 0;
};
