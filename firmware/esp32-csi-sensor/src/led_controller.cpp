/**
 * @file led_controller.cpp
 * @brief LED behaviour — see led_controller.h for the mapping.
 *
 * The LEDs are active-HIGH through series resistors to common GND; the
 * temporary blink sketch proved GPIO 27 lights on digitalWrite(HIGH) before
 * this controller existed. Red's brightness uses the LEDC PWM peripheral.
 */
#include "led_controller.h"

#include <Arduino.h>

namespace {

constexpr int GREEN_LED_PIN = 27;
constexpr int PINK_LED_PIN = 26;
constexpr int RED_LED_PIN = 25;

// Red: PWM so brightness can follow movement intensity.
constexpr int RED_PWM_FREQ_HZ = 5000;
constexpr int RED_PWM_RESOLUTION = 8;  // 0..255 duty

// Red duty at the moment motion shows up — a visible floor so "just
// detected" does not look like "off", before intensity takes over.
constexpr uint8_t RED_DUTY_FLOOR = 60;
// What an IR detection holds the red duty at: something is right there.
constexpr uint8_t RED_DUTY_IR_FLOOR = 140;

// Green: the "connecting" blink while the link is up but frames are silent.
constexpr uint32_t GREEN_BLINK_PERIOD_MS = 1200;

// Pink: how long one presence-transition pulse lasts.
constexpr uint32_t PINK_PULSE_MS = 600;

// Fault detection: how long without frames counts as sensor silence, and how
// long the board may take to start producing after link-up.
constexpr uint32_t DATA_TIMEOUT_MS = 5000;
constexpr uint32_t STARTUP_GRACE_MS = 30000;

// SOS: the fall verdict latches full-red for this long, then hands the LED
// back to the intensity view.
constexpr uint32_t SOS_LATCH_MS = 30000;

// How fast the smoothed level chases the target (per tick fraction).
constexpr float LEVEL_SMOOTHING = 0.12f;

}  // namespace

void LedController::begin() {
  pinMode(GREEN_LED_PIN, OUTPUT);
  pinMode(PINK_LED_PIN, OUTPUT);
  pinMode(RED_LED_PIN, OUTPUT);
  digitalWrite(GREEN_LED_PIN, LOW);
  digitalWrite(PINK_LED_PIN, LOW);
  // Red rides LEDC; attach returns true when the channel is available.
  redPwm_ = ledcAttach(RED_LED_PIN, RED_PWM_FREQ_HZ, RED_PWM_RESOLUTION);
  if (!redPwm_) {
    // Fall back to plain GPIO — intensity is lost, on/off still works.
    pinMode(RED_LED_PIN, OUTPUT);
  }
  writeDuty(RED_LED_PIN, 0);
}

void LedController::writeDuty(int pin, uint8_t duty) {
  if (redPwm_) {
    ledcWrite(pin, duty);
  } else {
    digitalWrite(pin, duty > 127 ? HIGH : LOW);
  }
}

void LedController::onCsiSample(uint32_t nowMs) {
  lastCsiSampleMs_ = nowMs;
  haveCsiSample_ = true;
}

void LedController::onPresence(const char *state) {
  // Every genuine verdict change gets a pulse — movement starting, the room
  // going quiet, a fall, the link being lost. A fall also latches red.
  pinkPulseUntilMs_ = millis() + PINK_PULSE_MS;
  if (state != nullptr && strcmp(state, "fall") == 0) {
    sosLatch_ = true;
    sosSinceMs_ = millis();
  }
}

void LedController::onMotionLevel(float level) {
  if (!sosLatch_) {
    targetLevel_ = level < 0.0f ? 0.0f : (level > 1.0f ? 1.0f : level);
  }
}

void LedController::onIr(bool detected) { irDetected_ = detected; }

void LedController::onWifi(bool up, uint32_t nowMs) {
  if (up == wifiUp_) return;
  wifiUp_ = up;
  if (up) {
    everWifiUp_ = true;
    wifiUpSinceMs_ = nowMs;
  }
}

void LedController::tick(uint32_t nowMs) {
  // ---- green: connectivity ------------------------------------------------
  const bool seeingFrames = haveCsiSample_ && (nowMs - lastCsiSampleMs_) <= DATA_TIMEOUT_MS;
  bool greenOn;
  if (!wifiUp_) {
    greenOn = false;
  } else if (seeingFrames) {
    greenOn = true;
  } else {
    greenOn = (nowMs % GREEN_BLINK_PERIOD_MS) < (GREEN_BLINK_PERIOD_MS / 2);
  }
  digitalWrite(GREEN_LED_PIN, greenOn ? HIGH : LOW);

  // ---- pink: presence-transition pulses, solid on fault -------------------
  const bool linkStale =
      wifiUp_ && (nowMs - wifiUpSinceMs_) > STARTUP_GRACE_MS &&
      (!haveCsiSample_ || (nowMs - lastCsiSampleMs_) > DATA_TIMEOUT_MS);
  const bool fault = (everWifiUp_ && !wifiUp_) || linkStale;
  const bool pinkOn = fault || nowMs < pinkPulseUntilMs_;
  digitalWrite(PINK_LED_PIN, pinkOn ? HIGH : LOW);

  // ---- red: movement intensity, IR floor, solid on SOS --------------------
  if (sosLatch_ && (nowMs - sosSinceMs_) > SOS_LATCH_MS) {
    sosLatch_ = false;
  }
  // Smooth toward the target so the glow breathes with the room instead of
  // strobing with every variance sample.
  level_ += LEVEL_SMOOTHING * (targetLevel_ - level_);
  uint8_t duty = 0;
  if (sosLatch_) {
    duty = 255;
  } else if (irDetected_) {
    duty = RED_DUTY_IR_FLOOR;
  } else if (level_ > 0.02f) {
    const float scaled = RED_DUTY_FLOOR + (255.0f - RED_DUTY_FLOOR) * level_;
    duty = static_cast<uint8_t>(scaled + 0.5f);
  }
  writeDuty(RED_LED_PIN, duty);
}
