import { describe, expect, it } from 'vitest';
import type { Signal } from '@khayaal/shared';
import {
  advanceState,
  computeRisk,
  dayAt,
  dayOfSignals,
  DEFAULT_BASELINE,
  emptyState,
  learnBaseline,
  makeHousehold,
  makeSources,
  presenceLost,
  seededBaseline,
  BASE,
  HOUR,
  MIN,
} from '../src';

const hh = () => makeHousehold();
const srcWithEsp = () => makeSources({ esp32: true });
const srcNoEsp = () => makeSources({ esp32: false });

function risk(signals: Signal[], nowTs: number, opts: { esp32?: boolean; baseline?: ReturnType<typeof seededBaseline> } = {}) {
  return computeRisk({
    signals,
    baseline: opts.baseline ?? seededBaseline(),
    sources: opts.esp32 === false ? srcNoEsp() : srcWithEsp(),
    household: hh(),
    nowTs,
  });
}

// ---------------------------------------------------------------------------
// Scenarios required by the spec
// ---------------------------------------------------------------------------

describe('risk scenarios', () => {
  it('normal day: everything fine, low score, tier 0', () => {
    const now = dayAt(0, 12);
    const signals = [
      ...dayOfSignals(-3),
      ...dayOfSignals(-2),
      ...dayOfSignals(-1),
      ...dayOfSignals(0, { motionUntilHour: 11.8 }),
    ];
    const r = risk(signals, now);
    expect(r.learning).toBe(false);
    expect(r.score).not.toBeNull();
    expect(r.score!).toBeLessThan(35);
    expect(r.tier).toBe(0);
    expect(r.confidence).toBe(1);
  });

  it('late wake-up: no unlock but motion continues -> gentle, tier 1 at most', () => {
    const now = dayAt(0, 12.2);
    const signals = [
      ...dayOfSignals(-2),
      ...dayOfSignals(-1),
      // today: motion around the house but no unlock yet
      ...dayOfSignals(0, { wakeHour: 7.2, motionUntilHour: 12, signalsEndHour: 12.5 }),
    ].filter((s) => !(s.type === 'screen_event' && s.ts >= dayAt(0, 0)));
    const r = risk(signals, now);
    expect(r.score).toBeGreaterThanOrEqual(35 - 12); // unlock contribution ramping
    expect(r.score).toBeLessThan(55);
    expect(r.tier).toBeLessThanOrEqual(1);
    const unlock = r.contributions.find((c) => c.signal === 'screen_event');
    expect(unlock).toBeDefined();
    expect(unlock!.reason).toContain('usually up by');
  });

  it('no movement for 6 hours (daytime, home) -> strong movement contribution', () => {
    const now = dayAt(0, 15);
    const signals = [
      ...dayOfSignals(-2),
      ...dayOfSignals(-1),
      ...dayOfSignals(0, { motionUntilHour: 8.5, signalsEndHour: 9 }),
      // unlock happened, then silence of movement
      { sourceId: 'src_phone', type: 'screen_event', value: 'unlock', ts: dayAt(0, 7.1) },
    ] satisfies Signal[];
    const r = risk(signals, now);
    const motion = r.contributions.find((c) => c.signal === 'motion');
    expect(motion).toBeDefined();
    expect(motion!.effect).toBeGreaterThan(10);
  });

  it('phone dead: no charge overnight and total silence -> alert-level score', () => {
    const now = dayAt(0, 11.5);
    const signals = [
      ...dayOfSignals(-3),
      ...dayOfSignals(-2),
      // everything stops the evening before: no charge, no unlock, no motion
      ...dayOfSignals(-1, { chargeTonight: false, motionUntilHour: 20 }),
    ];
    const r = risk(signals, now);
    expect(r.score).toBeGreaterThanOrEqual(72);
    expect(r.tier).toBe(3);
    const reasons = r.contributions.map((c) => c.reason).join(' ');
    expect(reasons).toContain('charge');
    expect(reasons).toContain('No signal of any kind');
  });

  it('parent away: being out explains the quiet house', () => {
    const now = dayAt(0, 13);
    const signals = [
      ...dayOfSignals(-2),
      ...dayOfSignals(-1),
      ...dayOfSignals(0, { motionUntilHour: 9 }),
      { sourceId: 'src_phone', type: 'screen_event', value: 'unlock', ts: dayAt(0, 7.1) },
      { sourceId: 'src_phone', type: 'location_zone', value: 'away', ts: dayAt(0, 10) },
    ] satisfies Signal[];
    const r = risk(signals, now);
    const explanation = r.contributions.find((c) => c.signal === 'location_zone');
    expect(explanation).toBeDefined();
    const movement = r.contributions.find((c) => c.signal === 'motion');
    if (movement) expect(movement.effect).toBeLessThan(10);
    expect(r.score).toBeLessThan(55);
  });

  it('ESP32 presence lost: contributes when a sensor exists, not when it does not', () => {
    const now = dayAt(0, 16);
    const signals = [
      ...dayOfSignals(-2),
      ...dayOfSignals(-1),
      ...dayOfSignals(0, { motionUntilHour: 9, signalsEndHour: 9.5 }),
      ...presenceLost(0, 9),
    ];
    const withSensor = risk(signals, now);
    expect(withSensor.contributions.find((c) => c.signal === 'presence')).toBeDefined();

    const withoutSensor = risk(signals, now, { esp32: false });
    expect(withoutSensor.contributions.find((c) => c.signal === 'presence')).toBeUndefined();
    expect(withoutSensor.confidence).toBeLessThan(1);
    expect(withoutSensor.score).toBeLessThan(withSensor.score!);
  });

  it('an unpaired source never elevates the score by itself', () => {
    const now = dayAt(0, 12);
    const signals = [...dayOfSignals(-1), ...dayOfSignals(0, { motionUntilHour: 11.8 })];
    const r = risk(signals, now, { esp32: false, baseline: { ...seededBaseline(), sampleDays: 0 } });
    expect(r.contributions.find((c) => c.signal === 'presence')).toBeUndefined();
    expect(r.confidence).toBeLessThan(1);
    expect(r.tier).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Baseline learning
// ---------------------------------------------------------------------------

describe('baseline', () => {
  it('learns a wake time from three ordinary days', () => {
    let b = { ...DEFAULT_BASELINE };
    const allDays = [...dayOfSignals(-3, { wakeHour: 6.9 }), ...dayOfSignals(-2, { wakeHour: 6.9 }), ...dayOfSignals(-1, { wakeHour: 6.9 })];
    b = learnBaseline(b, allDays, dayAt(0, 12));
    expect(b.sampleDays).toBeGreaterThanOrEqual(3);
    expect(b.wakeHour).toBeCloseTo(6.9, 1);
    expect(b.chargingStartHour).toBeCloseTo(22.5, 1);
  });

  it('learning window: scores nothing and stays tier 0', () => {
    const household = makeHousehold({ learningUntilTs: dayAt(0, 18) });
    const now = dayAt(0, 12);
    const r = computeRisk({
      signals: dayOfSignals(-1),
      baseline: seededBaseline(),
      sources: srcWithEsp(),
      household,
      nowTs: now,
    });
    expect(r.learning).toBe(true);
    expect(r.score).toBeNull();
    const out = advanceState({ state: emptyState(now), risk: r, household, signals: [], nowTs: now });
    expect(out.state.tier).toBe(0);
    expect(out.state.learning).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Escalation state machine
// ---------------------------------------------------------------------------

function emergencySignals(): Signal[] {
  const now = dayAt(0, 11.5);
  return [...dayOfSignals(-3), ...dayOfSignals(-2), ...dayOfSignals(-1, { chargeTonight: false, motionUntilHour: 20 })].filter(
    (s) => s.ts <= now,
  );
}

describe('escalation', () => {
  it('escalates one step at a time, respecting dwell timers', () => {
    const now = dayAt(0, 11.5);
    const signals = emergencySignals();
    const r = risk(signals, now);
    expect(r.tier).toBe(3);

    let state = emptyState(now);
    // t0: fresh state, tier 0 — dwell timer has not elapsed
    let out = advanceState({ state, risk: r, household: hh(), signals, nowTs: now });
    expect(out.state.tier).toBe(0);

    // +10 min: nudge fires
    const t1 = now + 10 * MIN + 1000;
    out = advanceState({ state: out.state, risk: r, household: hh(), signals, nowTs: t1 });
    expect(out.state.tier).toBe(1);
    expect(out.events.some((e) => e.type === 'tier_change' && e.to === 1)).toBe(true);

    // +10 min: check-in prompt
    const t2 = t1 + 10 * MIN + 1000;
    out = advanceState({ state: out.state, risk: r, household: hh(), signals, nowTs: t2 });
    expect(out.state.tier).toBe(2);

    // +15 min: family alerted
    const t3 = t2 + 15 * MIN + 1000;
    out = advanceState({ state: out.state, risk: r, household: hh(), signals, nowTs: t3 });
    expect(out.state.tier).toBe(3);
    state = out.state;
    expect(state.status).toContain('needs attention');
  });

  it('is idempotent: re-evaluating at the same instant changes nothing', () => {
    const now = dayAt(0, 11.5) + 11 * MIN;
    const signals = emergencySignals();
    const r = risk(signals, now);
    let out = advanceState({ state: emptyState(now - 11 * MIN), risk: r, household: hh(), signals, nowTs: now });
    const once = out.state;
    const again = advanceState({ state: once, risk: r, household: hh(), signals, nowTs: now });
    expect(again.state.tier).toBe(once.tier);
    expect(again.events).toHaveLength(0);
  });

  it('recent parent interaction stands the ladder down', () => {
    const now = dayAt(0, 11.5);
    const signals = emergencySignals();
    const r = risk(signals, now);
    let out = advanceState({ state: emptyState(now - 40 * MIN), risk: r, household: hh(), signals, nowTs: now });
    // walk it up to tier 2 quickly by rewinding tierSince
    out.state.tierSinceTs = now - 60 * MIN;
    out = advanceState({ state: out.state, risk: r, household: hh(), signals, nowTs: now });
    expect(out.state.tier).toBeGreaterThanOrEqual(2);

    // she picks up the phone a minute ago
    const withUnlock: Signal[] = [...signals, { sourceId: 'src_phone', type: 'screen_event', value: 'unlock', ts: now - MIN }];
    const r2 = computeRisk({ signals: withUnlock, baseline: seededBaseline(), sources: srcWithEsp(), household: hh(), nowTs: now });
    out = advanceState({ state: out.state, risk: r2, household: hh(), signals: withUnlock, nowTs: now });
    expect(out.state.tier).toBe(0);
  });

  it('manual check-in resets everything and logs the event', () => {
    const now = dayAt(0, 11.5);
    const signals: Signal[] = [
      ...emergencySignals(),
      { sourceId: 'src_phone', type: 'manual_checkin', value: 'ok', ts: now - MIN },
    ];
    const r = risk(signals, now);
    const out = advanceState({
      state: { ...emptyState(now), tier: 2, tierSinceTs: now - 30 * MIN },
      risk: r,
      household: hh(),
      signals,
      nowTs: now,
    });
    expect(out.state.tier).toBe(0);
    const checkin = out.events.find((e) => e.type === 'note' || e.type === 'checkin');
    expect(checkin).toBeDefined();
  });

  it('quiet hours hold escalation at a nudge unless the score is severe', () => {
    // A worrying-but-not-emergency day: no unlock, no movement since dawn,
    // sensor quiet — score lands in tier-2 territory by early afternoon.
    const now = dayAt(0, 14);
    const signals = [
      ...dayOfSignals(-2),
      ...dayOfSignals(-1),
      ...dayOfSignals(0, { motionUntilHour: 6.5, signalsEndHour: 7 }),
    ].filter((s) => !(s.type === 'screen_event' && s.ts >= dayAt(0, 0)));
    const daytimeQuiet = makeHousehold({ quietHours: { start: 10, end: 16 } });
    const r = computeRisk({
      signals,
      baseline: seededBaseline(),
      sources: srcWithEsp(),
      household: daytimeQuiet,
      nowTs: now,
    });
    expect(r.score).toBeGreaterThanOrEqual(55);

    const base = { ...emptyState(now), tierSinceTs: now - 60 * MIN };
    const capped = advanceState({ state: base, risk: r, household: daytimeQuiet, signals, nowTs: now });
    expect(capped.state.tier).toBeLessThanOrEqual(1);

    const normalHousehold = makeHousehold(); // quiet 22:00-06:00; 14:00 is daytime
    const uncapped = advanceState({ state: base, risk: r, household: normalHousehold, signals, nowTs: now });
    expect(uncapped.state.tier).toBe(1);
    const uncapped2 = advanceState({
      state: uncapped.state,
      risk: r,
      household: normalHousehold,
      signals,
      nowTs: now + 11 * MIN,
    });
    expect(uncapped2.state.tier).toBe(2);

    // A score of 85+ breaks straight through quiet hours: a genuine
    // emergency is never silenced by the clock.
    const emgNow = dayAt(0, 11.5);
    const emg = [
      ...dayOfSignals(-3),
      ...dayOfSignals(-2),
      ...dayOfSignals(-1, { chargeTonight: false, motionUntilHour: 20 }),
    ].filter((s) => s.ts <= emgNow);
    const rEmg = computeRisk({
      signals: emg,
      baseline: seededBaseline(),
      sources: srcWithEsp(),
      household: daytimeQuiet,
      nowTs: emgNow,
    });
    expect(rEmg.score).toBeGreaterThanOrEqual(85);
    let out = advanceState({
      state: { ...emptyState(emgNow), tierSinceTs: emgNow - 120 * MIN },
      risk: rEmg,
      household: daytimeQuiet,
      signals: emg,
      nowTs: emgNow,
    });
    out = advanceState({ state: out.state, risk: rEmg, household: daytimeQuiet, signals: emg, nowTs: emgNow + 11 * MIN });
    out = advanceState({ state: out.state, risk: rEmg, household: daytimeQuiet, signals: emg, nowTs: emgNow + 22 * MIN });
    out = advanceState({ state: out.state, risk: rEmg, household: daytimeQuiet, signals: emg, nowTs: emgNow + 38 * MIN });
    expect(out.state.tier).toBe(3);
  });

  it('snooze holds the tier down until it expires', () => {
    const now = dayAt(0, 11.5);
    const signals = emergencySignals();
    const r = risk(signals, now);
    const snoozed = { ...emptyState(now), snoozeUntilTs: now + 60 * MIN, tierSinceTs: now - 120 * MIN };
    const out = advanceState({ state: snoozed, risk: r, household: hh(), signals, nowTs: now });
    expect(out.state.tier).toBe(0);
    expect(out.state.status).toContain('Snoozed');

    // after expiry the ladder resumes
    const later = advanceState({ state: out.state, risk: r, household: hh(), signals, nowTs: now + 61 * MIN });
    expect(later.state.snoozeUntilTs).toBeNull();
  });

  it('de-escalates immediately when signals settle', () => {
    const now = dayAt(0, 11.5);
    const bad = risk(emergencySignals(), now);
    let out = advanceState({
      state: { ...emptyState(now), tier: 3, tierSinceTs: now - 60 * MIN },
      risk: bad,
      household: hh(),
      signals: emergencySignals(),
      nowTs: now,
    });
    expect(out.state.tier).toBe(3);

    const good = risk([...dayOfSignals(-3), ...dayOfSignals(-2), ...dayOfSignals(-1), ...dayOfSignals(0, { motionUntilHour: 11.3 })], now);
    out = advanceState({ state: out.state, risk: good, household: hh(), signals: [], nowTs: now + MIN });
    expect(out.state.tier).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Fall detection (CSI room sensor)
// ---------------------------------------------------------------------------

describe('fall detection', () => {
  const withFall = (fallAgeMs: number, now = dayAt(0, 11.5)) => {
    const signals: Signal[] = [
      ...dayOfSignals(-2),
      ...dayOfSignals(-1),
      ...dayOfSignals(0, { motionUntilHour: 11.3 }),
      { sourceId: 'esp32', type: 'presence', value: 'fall', ts: now - fallAgeMs },
    ];
    return { signals, now };
  };

  it('a fresh fall saturates the score to tier 3', () => {
    const { signals, now } = withFall(2 * MIN);
    const r = risk(signals, now);
    expect(r.score).toBe(100);
    expect(r.tier).toBe(3);
    expect(r.contributions.some((c) => c.signal === 'presence' && c.effect === 100)).toBe(true);
  });

  it('a fall bypasses the escalation ladder, quiet hours and low confidence', () => {
    const { signals, now } = withFall(2 * MIN);
    const r = risk(signals, now);
    // tier 0, escalated 1 minute ago, in quiet hours, thin confidence —
    // the fall still goes straight to tier 3.
    const out = advanceState({
      state: { ...emptyState(now), tierSinceTs: now - MIN, snoozeUntilTs: now + 30 * MIN },
      risk: r,
      household: hh(),
      signals,
      nowTs: now,
    });
    expect(out.state.tier).toBe(3);
    const ev = out.events.find((e) => e.type === 'tier_change' && e.to === 3);
    expect(ev?.meta).toContain('fall');
  });

  it('an hour-old fall with no movement after it stays elevated but not saturated', () => {
    const { signals, now } = withFall(45 * MIN);
    const r = risk(signals, now);
    expect(r.score).toBeGreaterThanOrEqual(55);
    expect(r.score).toBeLessThan(100);
  });

  it('movement right after a fall event stands down once she is active again', () => {
    const now = dayAt(0, 11.5);
    const signals: Signal[] = [
      ...dayOfSignals(-2),
      ...dayOfSignals(-1),
      ...dayOfSignals(0, { motionUntilHour: 11.3 }),
      { sourceId: 'esp32', type: 'presence', value: 'fall', ts: now - 20 * MIN },
      { sourceId: 'phone', type: 'screen_event', value: 'unlock', ts: now - 2 * MIN },
    ];
    const out = advanceState({
      state: { ...emptyState(now), tier: 3, tierSinceTs: now - 10 * MIN },
      risk: risk(signals, now),
      household: hh(),
      signals,
      nowTs: now,
    });
    expect(out.state.tier).toBe(0);
  });
});
