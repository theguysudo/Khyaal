/**
 * @file led_controller.cpp
 * @brief LED behaviour — the scenario table is documented in led_controller.h
 *        and firmware/README.md; this file is the rendering.
 *
 * The LEDs are active-HIGH through series resistors to common GND. All three
 * ride the LEDC PWM peripheral (a breath is a ramp — binary GPIO cannot draw
 * one); a pin whose ledcAttach() fails falls back to plain GPIO, where
 * patterns survive as on/off but ramps become steps.
 *
 * Rendering runs on a fixed ~20 ms cadence regardless of how fast loop()
 * spins, and the red level EMA steps on a fixed ~40 ms cadence inside that —
 * smoothing per loop() iteration would converge in under a millisecond (the
 * loop free-runs at tens of kHz) and every glow would read as a hard on/off.
 */
#include "led_controller.h"

#include <Arduino.h>

namespace {

constexpr int GREEN_LED_PIN = 27;
constexpr int PINK_LED_PIN = 26;
constexpr int RED_LED_PIN = 25;

constexpr int LED_PWM_FREQ_HZ = 5000;
constexpr int LED_PWM_RESOLUTION = 8;  // 0..255 duty

// Red duty at the moment motion shows up — a visible floor so "just
// detected" does not look like "off", before intensity takes over.
constexpr uint8_t RED_DUTY_FLOOR = 60;
// What an IR detection holds the red duty at: something is right there.
constexpr uint8_t RED_DUTY_IR_FLOOR = 140;
// Activity-class floors: the classifier (not the instant level) decides
// which of these the room sits at; the instant level can only raise it.
constexpr uint8_t CLASS_FLOOR_GENTLE = 60;
constexpr uint8_t CLASS_FLOOR_ACTIVE = 140;
constexpr uint8_t CLASS_FLOOR_BUSY = 220;

// Green: the serial-mode breath — the demo default must be OBVIOUSLY alive.
constexpr uint32_t GREEN_BREATH_PERIOD_MS = 2000;
constexpr uint8_t GREEN_BREATH_MIN_DUTY = 20;
// Green: the Wi-Fi-connecting double-flash, every ~3 s.
constexpr uint32_t GREEN_DOUBLE_PERIOD_MS = 3000;
constexpr uint16_t GREEN_DOUBLE_BLIP_MS = 120;
constexpr uint16_t GREEN_DOUBLE_GAP_MS = 180;
// Green: Bluetooth SPP fast blink.
constexpr uint16_t GREEN_FAST_PERIOD_MS = 360;

// Red: faint "watching" breath — CSI alive, room quiet, never blank.
constexpr uint32_t WATCHING_PERIOD_MS = 6000;
constexpr uint8_t WATCHING_MIN_DUTY = 4;
constexpr uint8_t WATCHING_MAX_DUTY = 35;
// Red: SOS strobe ~4.5 Hz (220 ms period, ~55% on).
constexpr uint16_t RED_STROBE_PERIOD_MS = 220;
constexpr uint16_t RED_STROBE_ON_MS = 120;

// Pink pulse shapes (see pulseDuty()).
constexpr uint16_t PULSE_ON_MS = 110;
constexpr uint16_t PULSE_GAP_MS = 100;
constexpr uint8_t PULSE_DUTY = 255;
constexpr uint16_t SOFT_ON_MS = 350;   // watchdog nudge: long and soft, so it is
constexpr uint16_t SOFT_GAP_MS = 250;  // unmistakably not the snappy identity pulse
constexpr uint8_t SOFT_DUTY = 90;
constexpr uint32_t PINK_SWEEP_PERIOD_MS = 2400;  // calibration sweep
// Identity double-pulses fired within this window coalesce into one — the
// relay types `hh`, `src`, `key` half a second apart, which is one moment,
// not three.
constexpr uint32_t IDENTITY_DEBOUNCE_MS = 3000;
// Test mode replays a pulse pattern on this beat so it is seen more than once.
constexpr uint32_t TEST_PULSE_REPEAT_MS = 1200;

// Fault detection: how long without frames counts as sensor silence, and how
// long the board may take to start producing after link-up.
constexpr uint32_t DATA_TIMEOUT_MS = 5000;
constexpr uint32_t STARTUP_GRACE_MS = 30000;

// SOS: the first SOS_ACUTE_MS after a confirmed fall strobes (the acute
// alarm); the rest of the latch shows solid; then the LED is handed back.
constexpr uint32_t SOS_ACUTE_MS = 10000;
constexpr uint32_t SOS_LATCH_MS = 30000;

// Night mode: quiet hours dim everything to ~30% — except the red SOS
// strobe/solid and the pink fault solid, which stay full (an alarm at night
// must still wake someone).
constexpr unsigned NIGHT_DIM_NUM = 77;  // 77/256 ~= 30%
constexpr unsigned NIGHT_DIM_DEN = 256;

// The render cadence; see the file comment for why this is NOT per-loop().
constexpr uint32_t RENDER_STEP_MS = 20;
constexpr uint32_t SMOOTH_STEP_MS = 40;
constexpr float LEVEL_SMOOTHING = 0.25f;

uint8_t dim8(uint8_t duty) {
  return static_cast<uint8_t>((static_cast<unsigned>(duty) * NIGHT_DIM_NUM) /
                              NIGHT_DIM_DEN);
}

// One full breath: a smooth cosine ramp between min and max duty.
uint8_t breathDuty(uint32_t nowMs, uint32_t periodMs, uint8_t minDuty,
                   uint8_t maxDuty) {
  const float phase =
      static_cast<float>(nowMs % periodMs) / static_cast<float>(periodMs);
  const float envelope = 0.5f - 0.5f * cosf(2.0f * static_cast<float>(M_PI) * phase);
  return static_cast<uint8_t>(static_cast<float>(minDuty) +
                              envelope * static_cast<float>(maxDuty - minDuty) +
                              0.5f);
}

// Pink pulse test-mode steps replay on this beat; see pulseDuty().
struct TestStep {
  const char *name;
  LedController::GreenMode g;
  LedController::RedMode r;
  LedController::PinkMode p;
  uint8_t redDuty;  // explicit duty for the R_LEVEL steps
  uint16_t ms;
};

constexpr TestStep kTestSteps[] = {
    {"green solid - Wi-Fi linked, CSI frames flowing", LedController::G_SOLID, LedController::R_OFF, LedController::P_OFF, 0, 2500},
    {"green breath - serial/USB mode (the demo default)", LedController::G_BREATH, LedController::R_OFF, LedController::P_OFF, 0, 2500},
    {"green double-flash - Wi-Fi connecting", LedController::G_DOUBLE, LedController::R_OFF, LedController::P_OFF, 0, 2500},
    {"green fast blink - Bluetooth SPP mode", LedController::G_FAST, LedController::R_OFF, LedController::P_OFF, 0, 2500},
    {"green off - no link at all", LedController::G_OFF, LedController::R_OFF, LedController::P_OFF, 0, 2500},
    {"red off - no CSI signal at all", LedController::G_OFF, LedController::R_OFF, LedController::P_OFF, 0, 2500},
    {"red watching - faint breath, CSI alive, room quiet", LedController::G_OFF, LedController::R_FAINT, LedController::P_OFF, 0, 2500},
    {"red gentle - activity class floor", LedController::G_OFF, LedController::R_LEVEL, LedController::P_OFF, CLASS_FLOOR_GENTLE, 2500},
    {"red busy - motion PWM", LedController::G_OFF, LedController::R_LEVEL, LedController::P_OFF, 230, 2500},
    {"red solid - fall detected (latched)", LedController::G_OFF, LedController::R_SOLID, LedController::P_OFF, 0, 2500},
    {"red strobe - SOS ACTIVE", LedController::G_OFF, LedController::R_STROBE, LedController::P_OFF, 0, 2500},
    {"pink single pulse - presence verdict change", LedController::G_OFF, LedController::R_OFF, LedController::P_SINGLE, 0, 2500},
    {"pink double pulse - identity typed (pairing)", LedController::G_OFF, LedController::R_OFF, LedController::P_DOUBLE, 0, 2500},
    {"pink triple pulse - SOS triggered", LedController::G_OFF, LedController::R_OFF, LedController::P_TRIPLE, 0, 2500},
    {"pink soft double - inactivity watchdog nudge", LedController::G_OFF, LedController::R_OFF, LedController::P_SOFT, 0, 2500},
    {"pink sweep - calibration running", LedController::G_OFF, LedController::R_OFF, LedController::P_SWEEP, 0, 2500},
    {"pink solid - link/sensor fault", LedController::G_OFF, LedController::R_OFF, LedController::P_SOLID, 0, 2500},
};
constexpr size_t kTestStepCount = sizeof(kTestSteps) / sizeof(kTestSteps[0]);

}  // namespace

void LedController::begin() {
  pinMode(GREEN_LED_PIN, OUTPUT);
  pinMode(PINK_LED_PIN, OUTPUT);
  pinMode(RED_LED_PIN, OUTPUT);
  digitalWrite(GREEN_LED_PIN, LOW);
  digitalWrite(PINK_LED_PIN, LOW);
  pwmG_ = ledcAttach(GREEN_LED_PIN, LED_PWM_FREQ_HZ, LED_PWM_RESOLUTION);
  pwmP_ = ledcAttach(PINK_LED_PIN, LED_PWM_FREQ_HZ, LED_PWM_RESOLUTION);
  pwmR_ = ledcAttach(RED_LED_PIN, LED_PWM_FREQ_HZ, LED_PWM_RESOLUTION);
  if (!pwmG_) pinMode(GREEN_LED_PIN, OUTPUT);
  if (!pwmP_) pinMode(PINK_LED_PIN, OUTPUT);
  if (!pwmR_) pinMode(RED_LED_PIN, OUTPUT);
  Serial.printf("[%lu] leds: pwm green=%s pink=%s red=%s\n",
                static_cast<unsigned long>(millis()), pwmG_ ? "yes" : "GPIO",
                pwmP_ ? "yes" : "GPIO", pwmR_ ? "yes" : "GPIO");
  writeGreen(0);
  writePink(0);
  writeRed(0);
}

void LedController::writeGreen(uint8_t duty) {
  if (pwmG_) {
    ledcWrite(GREEN_LED_PIN, duty);
  } else {
    digitalWrite(GREEN_LED_PIN, duty > 127 ? HIGH : LOW);
  }
}

void LedController::writeRed(uint8_t duty) {
  if (pwmR_) {
    ledcWrite(RED_LED_PIN, duty);
  } else {
    digitalWrite(RED_LED_PIN, duty > 127 ? HIGH : LOW);
  }
}

void LedController::writePink(uint8_t duty) {
  if (pwmP_) {
    ledcWrite(PINK_LED_PIN, duty);
  } else {
    digitalWrite(PINK_LED_PIN, duty > 127 ? HIGH : LOW);
  }
}

// ------------------------------------------------------------------ inputs

void LedController::onCsiSample(uint32_t nowMs) {
  lastCsiSampleMs_ = nowMs;
  haveCsiSample_ = true;
}

void LedController::onPresence(const char *state) {
  if (state != nullptr && strcmp(state, "fall") == 0) {
    sosLatch_ = true;
    sosSinceMs_ = millis();
    play(P_TRIPLE, 4);  // SOS triggered — beats any pending pulse
  } else {
    play(P_SINGLE, 1);
  }
}

void LedController::onIdentity() {
  const uint32_t now = millis();
  if (lastIdentityMs_ != 0 && now - lastIdentityMs_ < IDENTITY_DEBOUNCE_MS) {
    return;  // the relay types hh/src/key half a second apart: one moment
  }
  lastIdentityMs_ = now;
  play(P_DOUBLE, 3);
}

void LedController::onMotionLevel(float level) {
  targetLevel_ = level < 0.0f ? 0.0f : (level > 1.0f ? 1.0f : level);
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

void LedController::onTransport(uint8_t transport) {
  if (transport <= kBt) transport_ = transport;
}

void LedController::onBt(bool sppUp) { btUp_ = sppUp; }

void LedController::onCalibration(bool active) { calActive_ = active; }

void LedController::onActivityClass(uint8_t cls) {
  if (cls <= kBusy) actClass_ = cls;
}

void LedController::onStillNudge() { play(P_SOFT, 2); }

void LedController::onNight(bool night) { night_ = night; }

// ------------------------------------------------------------------ pulses

void LedController::play(PinkMode mode, uint8_t priority) {
  // Equal or higher priority preempts; a lower one is ignored while a pulse
  // is playing. SOS(4) > identity(3) > still-nudge(2) > presence(1).
  if (pulse_ != P_OFF && priority < pulsePriority_) return;
  pulse_ = mode;
  pulsePriority_ = priority;
  pulseStartMs_ = millis();
}

uint8_t LedController::pulseDuty(uint32_t nowMs, bool *done) const {
  // Shapes: P_SINGLE 1 blip, P_DOUBLE 2 (identity), P_TRIPLE 3 (SOS),
  // P_SOFT 2 long soft blips (watchdog nudge).
  uint8_t count = 1;
  uint16_t onMs = PULSE_ON_MS;
  uint16_t gapMs = PULSE_GAP_MS;
  uint8_t duty = PULSE_DUTY;
  if (pulse_ == P_DOUBLE) {
    count = 2;
  } else if (pulse_ == P_TRIPLE) {
    count = 3;
  } else if (pulse_ == P_SOFT) {
    count = 2;
    onMs = SOFT_ON_MS;
    gapMs = SOFT_GAP_MS;
    duty = SOFT_DUTY;
  }
  uint32_t elapsed = nowMs - pulseStartMs_;
  const uint32_t total = static_cast<uint32_t>(count) * onMs +
                         static_cast<uint32_t>(count - 1) * gapMs;
  if (pulseRepeat_) {
    elapsed %= total + TEST_PULSE_REPEAT_MS;
  } else if (elapsed >= total) {
    if (done != nullptr) *done = true;
    return 0;
  }
  for (uint8_t i = 0; i < count; i++) {
    if (elapsed < onMs) return duty;
    elapsed -= onMs;
    if (i + 1 < count) {
      if (elapsed < gapMs) return 0;
      elapsed -= gapMs;
    }
  }
  return 0;
}

// --------------------------------------------------------------- test mode

void LedController::beginTest() {
  testActive_ = true;
  testStep_ = 0;
  testStepStartMs_ = millis();
  pulse_ = P_OFF;
  pulsePriority_ = 0;
  pulseRepeat_ = false;
}

void LedController::endTest() {
  testActive_ = false;
  pulse_ = P_OFF;
  pulsePriority_ = 0;
  pulseRepeat_ = false;
}

const char *LedController::testStepName() const {
  return kTestSteps[testStep_].name;
}

// ------------------------------------------------------------------ render

uint8_t LedController::greenModeDuty(GreenMode mode, uint32_t nowMs,
                                     bool seeingFrames) const {
  (void)seeingFrames;
  switch (mode) {
    case G_SOLID:
      return 255;
    case G_BREATH:
      return breathDuty(nowMs, GREEN_BREATH_PERIOD_MS, GREEN_BREATH_MIN_DUTY,
                        255);
    case G_DOUBLE: {
      const uint32_t t = nowMs % GREEN_DOUBLE_PERIOD_MS;
      const uint32_t blip2Start =
          static_cast<uint32_t>(GREEN_DOUBLE_BLIP_MS) + GREEN_DOUBLE_GAP_MS;
      const uint32_t blip2End =
          2 * static_cast<uint32_t>(GREEN_DOUBLE_BLIP_MS) + GREEN_DOUBLE_GAP_MS;
      const bool on = t < GREEN_DOUBLE_BLIP_MS ||
                      (t >= blip2Start && t < blip2End);
      return on ? 255 : 0;
    }
    case G_FAST:
      return (nowMs % GREEN_FAST_PERIOD_MS) < (GREEN_FAST_PERIOD_MS / 2) ? 255
                                                                          : 0;
    case G_OFF:
    default:
      return 0;
  }
}

uint8_t LedController::redModeDuty(RedMode mode, uint32_t nowMs) const {
  switch (mode) {
    case R_SOLID:
      return 255;
    case R_STROBE:
      return (nowMs % RED_STROBE_PERIOD_MS) < RED_STROBE_ON_MS ? 255 : 0;
    case R_FAINT:
      return breathDuty(nowMs, WATCHING_PERIOD_MS, WATCHING_MIN_DUTY,
                        WATCHING_MAX_DUTY);
    case R_LEVEL: {
      // The room, in three layers, brightest wins:
      //   1. the faint "watching" breath while the class says still — an
      //      idle board is never blank;
      //   2. the activity class sets a floor (gentle/active/busy);
      //   3. the smoothed instant level rides on top; IR holds its floor.
      uint8_t duty = 0;
      if (actClass_ == kStill) {
        duty = breathDuty(nowMs, WATCHING_PERIOD_MS, WATCHING_MIN_DUTY,
                          WATCHING_MAX_DUTY);
      }
      if (actClass_ == kGentle && duty < CLASS_FLOOR_GENTLE) {
        duty = CLASS_FLOOR_GENTLE;
      }
      if (actClass_ == kActive && duty < CLASS_FLOOR_ACTIVE) {
        duty = CLASS_FLOOR_ACTIVE;
      }
      if (actClass_ == kBusy && duty < CLASS_FLOOR_BUSY) {
        duty = CLASS_FLOOR_BUSY;
      }
      if (level_ > 0.02f) {
        const float scaled =
            RED_DUTY_FLOOR + (255.0f - RED_DUTY_FLOOR) * level_;
        const uint8_t ld = static_cast<uint8_t>(scaled + 0.5f);
        if (ld > duty) duty = ld;
      }
      if (irDetected_ && duty < RED_DUTY_IR_FLOOR) duty = RED_DUTY_IR_FLOOR;
      return duty;
    }
    case R_OFF:
    default:
      return 0;
  }
}

void LedController::render(uint32_t nowMs) {
  // ---- test mode: play the script; live inputs and night dim are ignored --
  if (testActive_) {
    if (nowMs - testStepStartMs_ >= kTestSteps[testStep_].ms) {
      testStepStartMs_ = nowMs;
      testStep_++;
      if (testStep_ >= kTestStepCount) {
        endTest();  // script over: fall through to live rendering below
      }
    }
    if (testActive_) {
      const TestStep &step = kTestSteps[testStep_];
      writeGreen(greenModeDuty(step.g, nowMs, true));
      uint8_t rd = 0;
      if (step.r == R_LEVEL) {
        rd = step.redDuty;
      } else if (step.r != R_OFF) {
        rd = redModeDuty(step.r, nowMs);
      }
      writeRed(rd);
      uint8_t pd = 0;
      pulseRepeat_ = false;
      if (step.p == P_SWEEP) {
        const uint32_t t = nowMs % PINK_SWEEP_PERIOD_MS;
        const uint32_t tri =
            t < PINK_SWEEP_PERIOD_MS / 2 ? t : PINK_SWEEP_PERIOD_MS - t;
        pd = static_cast<uint8_t>(255UL * tri / (PINK_SWEEP_PERIOD_MS / 2));
      } else if (step.p == P_SOLID) {
        pd = 255;
      } else if (step.p != P_OFF) {
        // Replay the pulse on a fixed beat so the bench sees it more than
        // once inside the step. Restart the pattern when the step changes,
        // otherwise the phase is whatever the previous step left behind.
        if (pulse_ != step.p) {
          pulse_ = step.p;
          pulseStartMs_ = nowMs;
        }
        pulsePriority_ = 255;
        pulseRepeat_ = true;
        pd = pulseDuty(nowMs, nullptr);
      }
      writePink(pd);
      return;
    }
  }

  // ---- resolve live scenarios ---------------------------------------------
  const bool seeingFrames =
      haveCsiSample_ && (nowMs - lastCsiSampleMs_) <= DATA_TIMEOUT_MS;
  lastSeeingFrames_ = seeingFrames;

  // GREEN: connectivity, by reporting transport. The USB cable is a link —
  // serial mode breathes even with Wi-Fi down (this is the fix for the old
  // "all LEDs dark in serial mode" bug).
  GreenMode green = G_OFF;
  if (transport_ == kBt) {
    green = btUp_ ? G_FAST : G_OFF;
  } else if (transport_ == kSerial) {
    green = G_BREATH;
  } else if (wifiUp_) {
    green = seeingFrames ? G_SOLID : G_DOUBLE;
  }

  // RED: the room. SOS strobe > fall solid > IR/level/class.
  if (sosLatch_ && (nowMs - sosSinceMs_) > SOS_LATCH_MS) sosLatch_ = false;
  RedMode red = R_OFF;
  if (sosLatch_) {
    red = (nowMs - sosSinceMs_) < SOS_ACUTE_MS ? R_STROBE : R_SOLID;
  } else if (irDetected_ || seeingFrames) {
    red = R_LEVEL;
  }

  // PINK: fault > calibration sweep > pulses.
  const bool linkStale =
      wifiUp_ && (nowMs - wifiUpSinceMs_) > STARTUP_GRACE_MS &&
      (!haveCsiSample_ || (nowMs - lastCsiSampleMs_) > DATA_TIMEOUT_MS);
  const bool fault = (everWifiUp_ && !wifiUp_) || linkStale;

  uint8_t pinkDuty = 0;
  bool pulseDone = false;
  if (fault) {
    pinkDuty = 255;
    pulse_ = P_OFF;  // a fault outranks any pulse that was mid-flight
    pulsePriority_ = 0;
  } else if (calActive_) {
    const uint32_t t = nowMs % PINK_SWEEP_PERIOD_MS;
    const uint32_t tri =
        t < PINK_SWEEP_PERIOD_MS / 2 ? t : PINK_SWEEP_PERIOD_MS - t;
    pinkDuty = static_cast<uint8_t>(255UL * tri / (PINK_SWEEP_PERIOD_MS / 2));
  } else if (pulse_ != P_OFF) {
    pinkDuty = pulseDuty(nowMs, &pulseDone);
    if (pulseDone) {
      pulse_ = P_OFF;
      pulsePriority_ = 0;
      pinkDuty = 0;
    }
  }

  // ---- night dimming: ~30%, except alarms ---------------------------------
  uint8_t greenDuty = greenModeDuty(green, nowMs, seeingFrames);
  if (night_) greenDuty = dim8(greenDuty);

  uint8_t redDuty = redModeDuty(red, nowMs);
  if (night_ && red != R_STROBE && red != R_SOLID) redDuty = dim8(redDuty);

  if (night_ && !fault) pinkDuty = dim8(pinkDuty);

  writeGreen(greenDuty);
  writeRed(redDuty);
  writePink(pinkDuty);
}

void LedController::tick(uint32_t nowMs) {
  if (lastRenderMs_ != 0 && nowMs - lastRenderMs_ < RENDER_STEP_MS) return;
  lastRenderMs_ = nowMs;
  // The level chases its target on the fixed ~40 ms cadence (inside the
  // render cadence), so the glow breathes with the room instead of strobing
  // with every variance sample.
  if (nowMs - lastSmoothMs_ >= SMOOTH_STEP_MS) {
    lastSmoothMs_ = nowMs;
    level_ += LEVEL_SMOOTHING * (targetLevel_ - level_);
  }
  render(nowMs);
}

void LedController::scenarioName(char *out, size_t cap) const {
  if (!out || cap == 0) return;
  const char *g = "off";
  if (transport_ == kBt) {
    g = btUp_ ? "fast-blink" : "off";
  } else if (transport_ == kSerial) {
    g = "breath";
  } else if (wifiUp_) {
    g = lastSeeingFrames_ ? "solid" : "double-flash";
  }
  const char *r = "off";
  if (sosLatch_) {
    r = (millis() - sosSinceMs_) < SOS_ACUTE_MS ? "sos" : "fall";
  } else if (lastSeeingFrames_ || irDetected_) {
    r = (actClass_ == kStill && !irDetected_) ? "watching" : "motion";
  }
  const char *p = "off";
  // The fault rule must match render(): Wi-Fi dropped after having been up,
  // or frames silent while the link is up past the startup grace.
  const bool linkStale =
      wifiUp_ && (millis() - wifiUpSinceMs_) > STARTUP_GRACE_MS &&
      (!haveCsiSample_ || (millis() - lastCsiSampleMs_) > DATA_TIMEOUT_MS);
  const bool fault = (everWifiUp_ && !wifiUp_) || linkStale;
  if (fault) {
    p = "fault";
  } else if (calActive_) {
    p = "calibration";
  } else if (pulse_ == P_SINGLE) {
    p = "presence";
  } else if (pulse_ == P_DOUBLE) {
    p = "identity";
  } else if (pulse_ == P_TRIPLE) {
    p = "sos";
  } else if (pulse_ == P_SOFT) {
    p = "still-nudge";
  }
  snprintf(out, cap, "green=%s red=%s pink=%s", g, r, p);
}
