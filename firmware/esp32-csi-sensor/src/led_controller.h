/**
 * @file led_controller.h
 * @brief Three status LEDs, one job each.
 *
 *  GREEN (GPIO 27) — connectivity. Solid while the Wi-Fi link is up AND the
 *    sensor is actually receiving frames; a slow blink while the link is up
 *    but the room is still quiet (connecting); dark with no link.
 *  RED (GPIO 25) — movement, brightness following intensity. The duty cycle
 *    tracks how far the CSI variance rises above the room's own quiet
 *    baseline (smoothed so it glows rather than flickers); a detected IR
 *    object holds a visible floor; a fall (SOS) latches full solid red.
 *  PINK (GPIO 26) — genuine presence transitions: a short pulse every time
 *    the presence state machine changes verdict (motion starts, the room
 *    goes quiet, a fall, the link is lost). A link/sensor fault overrides
 *    the pulses with a solid light until the fault clears.
 *
 * Red is a PWM channel (LEDC); everything is millis()-based and
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
  /** How far the variance rises above the room baseline, clamped 0..1. */
  void onMotionLevel(float level);
  /** Reflective IR: an object is within the beam. Holds a red floor. */
  void onIr(bool detected);
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

  float level_ = 0.0f;
  float targetLevel_ = 0.0f;
  uint32_t lastSmoothMs_ = 0;
  bool irDetected_ = false;
  bool sosLatch_ = false;
  uint32_t sosSinceMs_ = 0;
  uint32_t pinkPulseUntilMs_ = 0;
};
