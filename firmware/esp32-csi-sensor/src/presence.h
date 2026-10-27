/**
 * @file presence.h
 * @brief Presence state machine: CSI amplitude variance -> fall/motion/idle/lost.
 *
 * Exactly the rules the Khayaal engine expects (and nothing more — the
 * intelligence lives server-side, by design):
 *   - sharp variance spike (> KH_FALL_SPIKE_RATIO x rolling mean) followed by
 *     KH_FALL_STILL_MS of stillness                        -> "fall" (one-shot)
 *   - variance above threshold for > KH_MOTION_CONFIRM_MS  -> "motion"
 *   - variance below threshold for > KH_IDLE_AFTER_MS      -> "idle"
 *   - Wi-Fi down                                           -> "lost"
 */
#pragma once

#include <stdint.h>

#include "config.h"

enum class Presence : uint8_t { Init, Idle, Motion, Lost, Fall };

const char *presenceValue(Presence p);  // "idle" | "motion" | "lost" | "fall"

class PresenceStateMachine {
 public:
  struct Params {
    float threshold = KH_MOTION_THRESHOLD_DEFAULT;
    uint32_t motionConfirmMs = KH_MOTION_CONFIRM_MS;
    uint32_t idleAfterMs = KH_IDLE_AFTER_MS;
    float fallSpikeRatio = KH_FALL_SPIKE_RATIO;
    uint32_t fallSpikeMs = KH_FALL_SPIKE_MS;
    uint32_t fallStillMs = KH_FALL_STILL_MS;
  };

  void begin(const Params &params) { params_ = params; }

  /**
   * Feed one observation. Returns the new state when it changed (a transition
   * the caller should report), or the unchanged state otherwise.
   *   wifiUp     — STA associated and has IP
   *   haveData   — variance is valid (enough CSI packets in the window)
   *   variance   — current amplitude variance (ignored when !haveData)
   * "Fall" is a one-shot: it is reported once and the machine settles to
   * Idle (the person is on the floor, still) until normal motion resumes.
   */
  Presence update(bool wifiUp, bool haveData, float variance, uint32_t nowMs);

  Presence state() const { return state_; }

 private:
  Params params_;
  Presence state_ = Presence::Init;
  uint32_t aboveSinceMs_ = 0;   // 0 = not currently above
  uint32_t belowSinceMs_ = 0;   // 0 = not currently below
  // fall detector
  float rollingMean_ = 0.0f;    // slow EMA of variance (the "calm" baseline)
  uint32_t spikeSinceMs_ = 0;   // 0 = no spike in progress
  float spikePeak_ = 0.0f;      // strongest variance seen in this spike
  uint32_t stillSinceMs_ = 0;   // 0 = not currently still after a spike
};
