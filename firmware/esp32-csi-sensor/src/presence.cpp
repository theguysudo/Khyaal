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
    case Presence::Fall:
      return "fall";
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
    spikeSinceMs_ = stillSinceMs_ = 0;
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
    spikeSinceMs_ = stillSinceMs_ = 0;
    spikePeak_ = 0;
    rollingMean_ = variance;
    return state_;
  }

  const bool above = variance > params_.threshold;

  // --- fall detector ------------------------------------------------------
  // A fall is one large, brief disturbance followed by continued stillness —
  // unlike walking (sustained medium disturbance) or dropping an object
  // (small disturbance). Baseline is a slow EMA, so a single event barely
  // moves it. After a confirmed fall the baseline resets to the still level
  // so the same event cannot fire twice.
  const bool spiking =
      variance > params_.threshold &&
      variance > params_.fallSpikeRatio * rollingMean_;
  if (spiking) {
    if (spikeSinceMs_ == 0) {
      spikeSinceMs_ = nowMs;
      spikePeak_ = variance;
    } else if (variance > spikePeak_) {
      spikePeak_ = variance;
    }
    stillSinceMs_ = 0;
  } else if (spikeSinceMs_ != 0) {
    if (!above) {
      if (stillSinceMs_ == 0) stillSinceMs_ = nowMs;
      const bool spikeLongEnough = (nowMs - spikeSinceMs_) >= params_.fallSpikeMs;
      const bool spikeStrongEnough = spikePeak_ > params_.threshold;
      if (spikeLongEnough && spikeStrongEnough &&
          (nowMs - stillSinceMs_) >= params_.fallStillMs) {
        spikeSinceMs_ = stillSinceMs_ = 0;
        spikePeak_ = 0;
        rollingMean_ = variance;
        state_ = Presence::Idle;
        return Presence::Fall;
      }
    } else {
      // Movement resumed right after the spike — that is a person walking,
      // not someone lying on the floor. Stand the fall detector down.
      stillSinceMs_ = 0;
      spikeSinceMs_ = 0;
      spikePeak_ = 0;
    }
    // A spike that never settles (sustained activity) is not a fall.
    if (spikeSinceMs_ != 0 && (nowMs - spikeSinceMs_) > 10 * params_.fallSpikeMs) {
      spikeSinceMs_ = 0;
      spikePeak_ = 0;
    }
  }
  rollingMean_ = 0.97f * rollingMean_ + 0.03f * variance;

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
