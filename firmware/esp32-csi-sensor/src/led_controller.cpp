/**
 * @file led_controller.cpp
 * @brief LED status behaviour — see led_controller.h for the mapping.
 *
 * The LEDs are active-HIGH: the wires are GPIO → resistor → LED → GND, and
 * the temporary blink sketch (/tmp/khayaal-led-test) proved GPIO 27 lights
 * on digitalWrite(HIGH) before this controller existed.
 */
#include "led_controller.h"

#include <Arduino.h>

namespace {

constexpr int GREEN_LED_PIN = 27;
constexpr int PINK_LED_PIN = 26;
constexpr int RED_LED_PIN = 25;

// Green: a pulse is short, and pulses are rate-limited so a fast frame rate
// cannot weld the LED permanently on. 250 ms samples with a 180 ms floor
// means one visible pulse per accepted sample.
constexpr uint32_t GREEN_PULSE_MS = 45;
constexpr uint32_t GREEN_MIN_INTERVAL_MS = 180;

// Red: how long without frames counts as a sensor fault while the link is
// up, and how long after link-up the sensor is allowed to start producing.
constexpr uint32_t DATA_TIMEOUT_MS = 5000;
constexpr uint32_t STARTUP_GRACE_MS = 30000;

}  // namespace

void LedController::begin() {
  pinMode(GREEN_LED_PIN, OUTPUT);
  pinMode(PINK_LED_PIN, OUTPUT);
  pinMode(RED_LED_PIN, OUTPUT);
  write(GREEN_LED_PIN, false);
  write(PINK_LED_PIN, false);
  write(RED_LED_PIN, false);
}

void LedController::write(int pin, bool on) { digitalWrite(pin, on ? HIGH : LOW); }

void LedController::onCsiSample(uint32_t nowMs) {
  lastCsiSampleMs_ = nowMs;
  haveCsiSample_ = true;
  if (static_cast<int32_t>(nowMs - greenNextPulseMs_) >= 0) {
    greenOnUntilMs_ = nowMs + GREEN_PULSE_MS;
    greenNextPulseMs_ = nowMs + GREEN_MIN_INTERVAL_MS;
  }
}

void LedController::onPresence(const char *state) {
  // "motion" and "fall" are the state machine's confirmed-activity verdicts;
  // every other state is quiet. A fall also counts as movement — the alert
  // itself is the server's job, not an LED's.
  motionLatch_ = state != nullptr && (strcmp(state, "motion") == 0 || strcmp(state, "fall") == 0);
}

void LedController::onWifi(bool up, uint32_t nowMs) {
  if (up == wifiUp_) return;
  wifiUp_ = up;
  if (up) {
    everWifiUp_ = true;
    wifiUpSinceMs_ = nowMs;
  }
}

void LedController::tick(uint32_t nowMs) {
  const bool seeingFrames =
      haveCsiSample_ && (nowMs - lastCsiSampleMs_) <= DATA_TIMEOUT_MS;
  const bool linkStale =
      wifiUp_ && (nowMs - wifiUpSinceMs_) > STARTUP_GRACE_MS &&
      (!haveCsiSample_ || (nowMs - lastCsiSampleMs_) > DATA_TIMEOUT_MS);
  const bool fault = (everWifiUp_ && !wifiUp_) || linkStale;

  write(GREEN_LED_PIN, nowMs < greenOnUntilMs_ && seeingFrames);
  write(PINK_LED_PIN, motionLatch_);
  write(RED_LED_PIN, fault);
}
