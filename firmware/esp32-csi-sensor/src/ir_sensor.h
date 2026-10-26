/**
 * @file ir_sensor.h
 * @brief Near-field reflective IR presence — an auxiliary channel, never a
 *        substitute for CSI.
 *
 * The module (ApTechDeals reflective photoelectric sensor, OUT → GPIO 23)
 * raises its output when enough reflected IR returns. Most LM393-based
 * modules pull the output LOW on detection and are powered at 3.3 V here, so
 * the pin uses a pull-up and LOW means DETECTED — verified against the
 * module's own on-board LED at bring-up, with the polarity behind a single
 * constant if a different module says otherwise.
 *
 * Honesty rules:
 *  - This says "an object is within the beam, roughly centimetres away".
 *    It does not measure distance, identify anyone, or see the room.
 *  - A static digital output cannot prove the sensor is unplugged, so there
 *    is no FAULT state — CLEAR means "no reflection", nothing more.
 *  - IR never overrides the CSI presence verdict; it is reported alongside
 *    it (and on the dashboard as a distinct `ir_reflective` signal).
 *
 * Debounced with millis(): a state must hold DEBOUNCE_MS, and a release
 * must hold RELEASE_MS, before the state (and its event) change.
 */
#pragma once

#include <stdint.h>

class IrSensor {
 public:
  enum class State : uint8_t { CLEAR, DETECTED };

  void begin();
  /** Poll the pin; call once per loop(). Emits events through the callback. */
  void tick(uint32_t nowMs);
  void setEnabled(bool on) { enabled_ = on; }
  bool enabled() const { return enabled_; }
  State state() const { return state_; }
  uint32_t lastChangeMs() const { return lastChangeMs_; }
  /** Registered once; called from loop context on every debounced transition. */
  void onEvent(void (*cb)(State state, uint32_t nowMs)) { callback_ = cb; }

 private:
  void setState(State s, uint32_t nowMs);

  bool enabled_ = true;
  State state_ = State::CLEAR;
  State rawState_ = State::CLEAR;
  uint32_t rawSinceMs_ = 0;
  uint32_t lastChangeMs_ = 0;
  bool haveReading_ = false;
  void (*callback_)(State, uint32_t) = nullptr;
};
