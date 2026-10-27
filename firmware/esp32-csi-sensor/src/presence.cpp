/**
 * @file presence.cpp
 * @brief See presence.h for the contract; this file is the rules, verbatim.
 */
#include "presence.h"

const char *presenceValue(Presence p) {
  switch (p) {
    case Presence::Motion:
      return "motion";
    case Presence::Lost:
      return "lost";
    case Presence::Idle:
    case Presence::Init:
      return "idle";
  }
  return "idle";
}

Presence PresenceStateMachine::update(bool wifiUp, bool haveData,
                                      float variance, uint32_t nowMs) {
  // Wi-Fi down overrides everything: without a link we cannot sense.
  if (!wifiUp) {
    aboveSinceMs_ = belowSinceMs_ = 0;
    if (state_ != Presence::Lost) {
      state_ = Presence::Lost;
      return state_;
    }
    return state_;
  }

  // No data yet (Wi-Fi just came up, CSI window still filling): hold state.
  if (!haveData) {
    return state_;
  }

  // Init -> Idle once real data flows; recover from Lost the same way.
  if (state_ == Presence::Init || state_ == Presence::Lost) {
    state_ = Presence::Idle;
    aboveSinceMs_ = belowSinceMs_ = 0;
    return state_;
  }

  const bool above = variance > params_.threshold;

  if (state_ == Presence::Idle) {
    if (above) {
      if (aboveSinceMs_ == 0) aboveSinceMs_ = nowMs;
      if (nowMs - aboveSinceMs_ >= params_.motionConfirmMs) {
        state_ = Presence::Motion;
        belowSinceMs_ = 0;
        aboveSinceMs_ = 0;
        return state_;
      }
    } else {
      aboveSinceMs_ = 0;
    }
    return state_;
  }

  // state_ == Motion: stay until the room has been quiet for idleAfterMs.
  if (!above) {
    if (belowSinceMs_ == 0) belowSinceMs_ = nowMs;
    if (nowMs - belowSinceMs_ >= params_.idleAfterMs) {
      state_ = Presence::Idle;
      belowSinceMs_ = 0;
      aboveSinceMs_ = 0;
      return state_;
    }
  } else {
    belowSinceMs_ = 0;
  }
  return state_;
}
