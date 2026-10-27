/**
 * @file presence.h
 * @brief Presence state machine: CSI amplitude variance -> motion/idle/lost.
 *
 * Exactly the rules the Khayaal engine expects (and nothing more — the
 * intelligence lives server-side, by design):
 *   - variance above threshold for > KH_MOTION_CONFIRM_MS  -> "motion"
 *   - variance below threshold for > KH_IDLE_AFTER_MS      -> "idle"
 *   - Wi-Fi down                                            -> "lost"
 */
#pragma once

#include <stdint.h>

#include "config.h"

enum class Presence : uint8_t { Init, Idle, Motion, Lost };

const char *presenceValue(Presence p);  // "idle" | "motion" | "lost"

class PresenceStateMachine {
 public:
  struct Params {
    float threshold = KH_MOTION_THRESHOLD_DEFAULT;
    uint32_t motionConfirmMs = KH_MOTION_CONFIRM_MS;
    uint32_t idleAfterMs = KH_IDLE_AFTER_MS;
  };

  void begin(const Params &params) { params_ = params; }

  /**
   * Feed one observation. Returns the new state when it changed (a transition
   * the caller should report), or the unchanged state otherwise.
   *   wifiUp     — STA associated and has IP
   *   haveData   — variance is valid (enough CSI packets in the window)
   *   variance   — current amplitude variance (ignored when !haveData)
   */
  Presence update(bool wifiUp, bool haveData, float variance, uint32_t nowMs);

  Presence state() const { return state_; }

 private:
  Params params_;
  Presence state_ = Presence::Init;
  uint32_t aboveSinceMs_ = 0;  // 0 = not currently above
  uint32_t belowSinceMs_ = 0;  // 0 = not currently below
};
