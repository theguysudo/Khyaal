/**
 * @file led_controller.h
 * @brief Three status LEDs, three questions: link, room, events.
 *
 * The language is scenario-driven: an observer names the scenario at a
 * glance, in every state the board can be in. The full state -> pattern
 * table lives in firmware/README.md (and docs/FIRMWARE_LEDS.md); the short
 * version:
 *
 *  GREEN (GPIO 27) — "how is this board talking to the world?"
 *    solid        Wi-Fi linked and CSI frames flowing (LAN mode healthy)
 *    slow breath  serial/USB mode (the demo default — must be OBVIOUSLY
 *                 alive, even with Wi-Fi up: the USB cable is the link)
 *    double-flash Wi-Fi connecting / linked but no frames yet
 *    fast blink   Bluetooth Classic SPP mode
 *    off          no link at all (LAN mode with Wi-Fi down, BT mode with
 *                 no SPP server)
 *
 *  RED (GPIO 25, PWM) — "what is the room doing?"
 *    off          no CSI at all (no frames, no AP)
 *    faint breath watching — CSI alive, room quiet (an idle board is never
 *                 blank; this is the fix for the old "all dark" bug)
 *    PWM glow     motion: the activity class sets a floor (gentle/active/
 *                 busy), the smoothed instant level rides on top; an IR
 *                 detection holds a floor
 *    solid        fall detected (latched ~30 s)
 *    fast strobe  SOS ACTIVE — the first ~10 s after a confirmed fall
 *
 *  PINK (GPIO 26, PWM) — "what just happened to the board?"
 *    single pulse presence verdict change (motion starts, room goes quiet,
 *                 link lost)
 *    double pulse a new identity was typed into the board (hh/src/key) —
 *                 the plug-and-play pairing moment
 *    triple pulse SOS triggered (confirmed fall)
 *    soft double  inactivity watchdog nudge (every 5 min while still=1)
 *    slow sweep   calibration (`cal`) running
 *    solid        link/sensor fault — Wi-Fi dropped after having been up,
 *                 or no frames for 5 s while the link is up past the
 *                 startup grace; beats every pulse until it clears
 *
 *  Night mode (quiet hours, config.h): everything dims to ~30% EXCEPT the
 *  red SOS strobe/solid and the pink fault solid — an alarm at night must
 *  still wake someone. A breath is a smooth ramp, so green and pink ride
 *  LEDC PWM like red does.
 *
 * Everything is millis()-based and non-blocking — begin() once, tick()
 * every loop(), no delay(). Rendering runs on a fixed ~20 ms cadence (the
 * loop free-runs far faster than that; per-iteration smoothing would
 * converge in under a millisecond and turn glows into hard on/off — the
 * classic bug this repo has hit before).
 */
#pragma once

#include <stdint.h>

#include <stddef.h>

class LedController {
 public:
  // Mirror of config.h TRANSPORT_* (kept independent so this header stays
  // dependency-free).
  enum Transport : uint8_t { kSerial = 0, kLan = 1, kBt = 2 };
  // Room activity classes (the activity classifier in main.cpp feeds these).
  enum ActivityClass : uint8_t { kStill = 0, kGentle = 1, kActive = 2, kBusy = 3 };

  void begin();
  /** Drive the LEDs; call once per loop(). Renders on a ~20 ms cadence. */
  void tick(uint32_t nowMs);

  /** A fresh, valid CSI sample arrived (readStats() returned true). */
  void onCsiSample(uint32_t nowMs);
  /** The presence state machine's verdict: "idle"|"motion"|"lost"|"fall". */
  void onPresence(const char *state);
  /** A new identity was typed into the board (hh/src/key) — pink double-pulse.
   *  The relay fires this three times half a second apart; pulses within
   *  ~3 s coalesce into one. */
  void onIdentity();
  /** How far the variance rises above the room baseline, clamped 0..1. */
  void onMotionLevel(float level);
  /** Reflective IR: an object is within the beam. Holds a red floor. */
  void onIr(bool detected);
  /** Current Wi-Fi link state; the controller reacts to changes only. */
  void onWifi(bool up, uint32_t nowMs);
  /** Reporting transport (LedController::kSerial/kLan/kBt). */
  void onTransport(uint8_t transport);
  /** Bluetooth Classic SPP server is up (peer may or may not be connected). */
  void onBt(bool sppUp);
  /** Calibration (`cal`) started/stopped — pink slow sweep while active. */
  void onCalibration(bool active);
  /** Activity classifier verdict (LedController::kStill..kBusy). */
  void onActivityClass(uint8_t cls);
  /** Inactivity watchdog nudge — soft pink double-pulse (main owns the 5 min timer). */
  void onStillNudge();
  /** Quiet hours entered/left — dim to ~30% (except SOS and fault). */
  void onNight(bool night);

  /** "green=breath red=watching pink=off" — for show/statusjson. */
  void scenarioName(char *out, size_t cap) const;

  // ---- bench verification -------------------------------------------------
  /** Play every scenario for ~2.5 s each (~40 s total); run `ledtest` again
   *  to stop early. Live inputs are ignored while a test runs. */
  void beginTest();
  void endTest();
  bool testActive() const { return testActive_; }
  /** Name of the scenario currently playing (static string). */
  const char *testStepName() const;

  // Render modes, public so the bench-test script table (led_controller.cpp)
  // can name them.
  enum GreenMode : uint8_t { G_OFF, G_SOLID, G_BREATH, G_DOUBLE, G_FAST };
  enum RedMode : uint8_t { R_OFF, R_FAINT, R_LEVEL, R_SOLID, R_STROBE };
  enum PinkMode : uint8_t { P_OFF, P_SINGLE, P_DOUBLE, P_TRIPLE, P_SOFT, P_SWEEP, P_SOLID };

 private:

  void render(uint32_t nowMs);
  void writeGreen(uint8_t duty);
  void writeRed(uint8_t duty);
  void writePink(uint8_t duty);
  /** Queue a pink pulse; equal/higher priority preempts a playing one. */
  void play(PinkMode mode, uint8_t priority);
  /** Duty of the queued pulse right now; *done when it finished. */
  uint8_t pulseDuty(uint32_t nowMs, bool *done) const;
  uint8_t greenModeDuty(GreenMode mode, uint32_t nowMs, bool seeingFrames) const;
  uint8_t redModeDuty(RedMode mode, uint32_t nowMs) const;

  // PWM attached per pin; a pin whose ledcAttach() failed falls back to
  // plain GPIO (duty > 127 == on) — patterns survive, ramps do not.
  bool pwmG_ = false;
  bool pwmR_ = false;
  bool pwmP_ = false;

  // ---- inputs -------------------------------------------------------------
  uint8_t transport_ = kSerial;
  bool btUp_ = false;
  bool wifiUp_ = false;
  bool everWifiUp_ = false;
  uint32_t wifiUpSinceMs_ = 0;
  bool haveCsiSample_ = false;
  uint32_t lastCsiSampleMs_ = 0;
  float level_ = 0.0f;
  float targetLevel_ = 0.0f;
  uint32_t lastSmoothMs_ = 0;
  bool irDetected_ = false;
  uint8_t actClass_ = kStill;
  bool calActive_ = false;
  bool night_ = false;

  // ---- red SOS/fall latch -------------------------------------------------
  bool sosLatch_ = false;
  uint32_t sosSinceMs_ = 0;

  // ---- pink pulse player --------------------------------------------------
  // One slot, priority-ordered: a playing pulse is preempted only by a
  // pulse of equal or higher priority (deterministic, no queue to drain).
  PinkMode pulse_ = P_OFF;
  uint32_t pulseStartMs_ = 0;
  uint8_t pulsePriority_ = 0;
  bool pulseRepeat_ = false;  // test mode: re-fire the pulse every ~1.2 s

  // ---- test mode ----------------------------------------------------------
  bool testActive_ = false;
  uint32_t testStepStartMs_ = 0;
  uint8_t testStep_ = 0;

  // ---- render bookkeeping -------------------------------------------------
  uint32_t lastRenderMs_ = 0;
  bool lastSeeingFrames_ = false;  // cached for scenarioName()
  uint32_t lastIdentityMs_ = 0;    // identity double-pulse debounce
};
