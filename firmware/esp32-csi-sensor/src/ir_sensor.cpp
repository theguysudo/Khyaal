/**
 * @file ir_sensor.cpp
 * @brief Debounced reflective-IR detection — see ir_sensor.h for the rules.
 */
#include "ir_sensor.h"

#include <Arduino.h>

namespace {

constexpr int IR_SENSOR_PIN = 23;

// The module's comparator output: LOW when the beam reflects off something
// close. INPUT_PULLUP suits both open-collector and push-pull outputs.
constexpr bool ACTIVE_LOW = true;

// A candidate state must hold this long before it becomes the state, and a
// release must hold this long before the state lets go — hand waves are
// fast, sensor noise is faster.
constexpr uint32_t DEBOUNCE_MS = 60;
constexpr uint32_t RELEASE_MS = 400;

}  // namespace

void IrSensor::begin() {
  pinMode(IR_SENSOR_PIN, INPUT_PULLUP);
  state_ = State::CLEAR;
  rawState_ = State::CLEAR;
  haveReading_ = false;
  lastChangeMs_ = millis();
}

void IrSensor::setState(State s, uint32_t nowMs) {
  state_ = s;
  lastChangeMs_ = nowMs;
  if (callback_ != nullptr) callback_(s, nowMs);
}

void IrSensor::tick(uint32_t nowMs) {
  if (!enabled_) {
    if (state_ == State::DETECTED) setState(State::CLEAR, nowMs);
    haveReading_ = false;
    return;
  }

  const bool rawLow = digitalRead(IR_SENSOR_PIN) == LOW;
  const State raw = (rawLow == ACTIVE_LOW) ? State::DETECTED : State::CLEAR;

  if (!haveReading_ || raw != rawState_) {
    rawState_ = raw;
    rawSinceMs_ = nowMs;
    haveReading_ = true;
  }

  // A candidate becomes the truth once it has held long enough; releases are
  // held to a longer bar so a wavering reflection does not strobe events.
  const uint32_t held = nowMs - rawSinceMs_;
  if (raw != state_ && held >= (raw == State::DETECTED ? DEBOUNCE_MS : RELEASE_MS)) {
    setState(raw, nowMs);
  }
}
