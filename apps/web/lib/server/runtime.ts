import type {
  AppCommand,
  Baseline,
  Household,
  HouseholdEvent,
  HouseholdState,
  Signal,
  Source,
} from '@khayaal/shared';
import {
  advanceState,
  computeRisk,
  learnBaseline,
  DEFAULT_BASELINE,
  HOUR,
  MIN,
  randomId,
} from '@khayaal/engine';
import { dispatchTierAlert } from './notify';
import { getStore } from './store';

export const SIGNAL_WINDOW_MS = 7 * 24 * HOUR;

export function simNow(hh: Household): number {
  return Date.now() + hh.simTimeOffsetMs;
}

export interface TickBundle {
  household: Household;
  state: HouseholdState;
  events: HouseholdEvent[];
  sources: Omit<Source, 'apiKey'>[];
  baseline: Baseline;
  simNowTs: number;
  realNowTs: number;
  /** Family→app nudges awaiting the device. */
  commands: AppCommand[];
  /** Activity intensity per hour of the current day (counts, no content). */
  hourlyActivity: number[];
  /** Recent night-watch / sound events for the sleep card. */
  sleepSound: Signal[];
}

function emptyState(nowTs: number): HouseholdState {
  return {
    score: null,
    tier: 0,
    status: '',
    contributions: [],
    confidence: 1,
    lastActiveTs: null,
    tierSinceTs: nowTs,
    updatedTs: nowTs,
    scoreTrend: [],
    snoozeUntilTs: null,
    ack: null,
    learning: true,
  };
}

/**
 * The heartbeat. Every read of a household flows through here: signals in,
 * risk out, state machine advanced, events logged. Idempotent — two calls in
 * the same instant produce the same state (second one logs nothing new).
 */
export async function tickHousehold(householdId: string): Promise<TickBundle | null> {
  const store = getStore();
  const household = await store.getHousehold(householdId);
  if (!household) return null;

  const nowTs = simNow(household);
  const signals = await store.getSignals(householdId, nowTs - SIGNAL_WINDOW_MS);
  const sources = await store.getSources(householdId);
  const baseline = (await store.getBaseline(householdId)) ?? DEFAULT_BASELINE;
  const prevState = (await store.getState(householdId)) ?? emptyState(nowTs);

  const risk = computeRisk({ signals, baseline, sources, household, nowTs });
  const { state, events } = advanceState({ state: prevState, risk, household, signals, nowTs });

  await store.setState(householdId, state);
  for (const e of events) await store.appendEvent(householdId, e);

  // Tier-3 escalation also fans out to the free channels: FCM push to the
  // Android app, VAPID push to the family browser, SMTP email to the care
  // circle. All fire-and-forget — a notify outage must never block a tick,
  // and without creds every channel is a silent no-op.
  const escalated = events.find((e) => e.type === 'tier_change' && e.to === 3);
  if (escalated) {
    const alertHousehold = { ...household, tierSinceTs: state.tierSinceTs };
    void dispatchTierAlert(alertHousehold, escalated.meta ?? 'Escalation to urgent care.').catch(
      () => undefined,
    );
  }

  const recentEvents = await store.getEvents(householdId, nowTs - 24 * HOUR, 60);

  // Privacy-safe aggregates for the dashboard: per-hour signal counts today,
  // recent night-watch events, and the pending command queue.
  const hourlyActivity = new Array(24).fill(0) as number[];
  const todayStart = dayStartOf(nowTs);
  for (const s of signals) {
    if (s.ts >= todayStart && s.ts <= nowTs) {
      hourlyActivity[Math.min(23, Math.floor((s.ts - todayStart) / HOUR))]++;
    }
  }
  const sleepSound = signals
    .filter((s) => (s.type === 'sleep_event' || s.type === 'sound_event') && s.ts >= nowTs - 18 * HOUR)
    .slice(-12);
  const commands = (await store.getCommands(householdId)).filter((c) => c.ackTs === null);

  return {
    household,
    state,
    events: recentEvents,
    sources: sources.map(({ apiKey: _apiKey, ...s }) => s),
    baseline,
    simNowTs: nowTs,
    realNowTs: Date.now(),
    commands,
    hourlyActivity,
    sleepSound,
  };
}

// ---------------------------------------------------------------------------
// Ingest
// ---------------------------------------------------------------------------

export async function ingestSignal(
  householdId: string,
  signal: Signal,
  apiKey?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const store = getStore();
  const household = await store.getHousehold(householdId);
  if (!household) return { ok: false, error: 'Unknown household' };

  const source = await store.findSource(householdId, signal.sourceId);
  if (!source) return { ok: false, error: 'Unknown source — pair this device first' };
  if (apiKey && source.apiKey !== apiKey) return { ok: false, error: 'Bad source key' };

  await store.appendSignal(householdId, signal);
  await store.touchSource(householdId, signal.sourceId, signal.ts);

  // Baseline folds in new data as it arrives (7-day window, robust medians).
  const hh2 = (await store.getHousehold(householdId))!;
  const nowTs = simNow(hh2);
  if (signal.ts <= nowTs) {
    const baseline = (await store.getBaseline(householdId)) ?? DEFAULT_BASELINE;
    const recent = await store.getSignals(householdId, nowTs - SIGNAL_WINDOW_MS);
    await store.setBaseline(householdId, learnBaseline(baseline, recent, nowTs));
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Pairing & household creation
// ---------------------------------------------------------------------------

export function makePairingCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export interface CreateHouseholdInput {
  parentName: string;
  childName: string;
  wakeHour?: number;
  chargeStartHour?: number;
  quietStart?: number;
  quietEnd?: number;
  /** Google subject of the signed-in family member, when there is one. */
  ownerSub?: string;
}

export async function createHousehold(input: CreateHouseholdInput): Promise<Household> {
  const store = getStore();
  const nowTs = Date.now();
  const hh: Household = {
    id: `hh_${randomId()}`,
    parentName: input.parentName.trim() || 'Amma',
    childName: input.childName.trim() || 'Family',
    childIds: [],
    pairingCode: makePairingCode(),
    quietHours: {
      start: input.quietStart ?? 22,
      end: input.quietEnd ?? 6,
    },
    escalationConfig: { nudgeAfterMin: 10, checkInAfterMin: 10, alertAfterMin: 15 },
    simTimeOffsetMs: 0,
    // Demo-first: scoring is instant. The declared onboarding prior is treated
    // as an earned week, so confidence is full and reasons read naturally from
    // the first request. The engine's learning-window logic remains — flip
    // learningUntilTs forward (or PATCH learningHours) to re-enable it.
    learningUntilTs: nowTs - MIN,
    createdAtTs: nowTs,
    ownerSubs: input.ownerSub ? [input.ownerSub] : [],
  };
  await store.createHousehold(hh);
  if (input.ownerSub) await store.linkHouseholdToUser(input.ownerSub, hh.id);
  await store.setBaseline(hh.id, {
    wakeHour: input.wakeHour ?? 7.25,
    chargingStartHour: input.chargeStartHour ?? 22.5,
    dailyMotionCount: 24,
    sampleDays: 6,
    updatedAt: nowTs,
  });
  const phone: Source = {
    id: `src_${randomId()}`,
    type: 'phone',
    label: `${hh.parentName}'s phone`,
    apiKey: `sk_${randomId()}${randomId()}`,
    createdAtTs: nowTs,
    lastSeenTs: null,
  };
  const esp: Source = {
    id: `src_${randomId()}`,
    type: 'esp32',
    label: 'Room sensor (ESP32)',
    apiKey: `sk_${randomId()}${randomId()}`,
    createdAtTs: nowTs,
    lastSeenTs: null,
  };
  await store.addSource(hh.id, phone);
  await store.addSource(hh.id, esp);

  // Seed one believable yesterday plus this morning from the declared prior,
  // so the very first tick has history to score against (confidence 1.0).
  const today = dayStartOf(nowTs);
  const nowHour = (nowTs - today) / HOUR;
  const wake = input.wakeHour ?? 7.25;
  const history: Signal[] = [
    ...ordinaryDay(today - 24 * HOUR, phone.id, esp.id, {
      wakeHour: wake - 0.15,
      motionUntilHour: 21.5,
      chargeTonight: true,
    }),
  ];
  if (nowHour > wake + 0.75) {
    history.push(
      ...ordinaryDay(today, phone.id, esp.id, {
        wakeHour: wake + 0.05,
        motionUntilHour: Math.max(wake + 1, nowHour - 0.2),
        chargeTonight: false,
        stopHour: Math.min(nowHour - 0.15, 24),
      }),
    );
  }
  for (const s of history) await store.appendSignal(hh.id, s);
  return hh;
}

/** Households a signed-in family member can see, newest first. */
export async function householdsForUser(sub: string): Promise<Household[]> {
  const store = getStore();
  const user = await store.getUser(sub);
  if (!user) return [];
  const out: Household[] = [];
  for (const id of user.householdIds) {
    const hh = await store.getHousehold(id);
    if (hh) out.push(hh);
  }
  return out.reverse();
}

/**
 * Attach an existing (previously set up) household to a signed-in account by
 * its pairing code. Deliberately does NOT rotate the code — the parent's
 * phone may already be paired with it.
 */
export async function claimHouseholdByCode(
  sub: string,
  code: string,
): Promise<Household | null> {
  const store = getStore();
  const hh = await store.getHouseholdByPairingCode(code.trim());
  if (!hh) return null;
  await store.linkHouseholdToUser(sub, hh.id);
  return store.getHousehold(hh.id);
}

// ---------------------------------------------------------------------------
// Parent / child actions
// ---------------------------------------------------------------------------

export async function parentCheckIn(householdId: string): Promise<TickBundle | null> {
  const store = getStore();
  const household = await store.getHousehold(householdId);
  if (!household) return null;
  const phone = (await store.getSources(householdId)).find((s) => s.type === 'phone');
  const nowTs = simNow(household);
  await store.appendSignal(householdId, {
    sourceId: phone?.id ?? 'src_parent',
    type: 'manual_checkin',
    value: 'ok',
    ts: nowTs,
  });
  if (phone) await store.touchSource(householdId, phone.id, nowTs);
  await store.appendEvent(householdId, {
    id: randomId(),
    ts: nowTs,
    type: 'checkin',
    meta: `${household.parentName} tapped "I'm OK".`,
  });
  // A confirmed check-in is worth something lasting: the ladder holds down
  // for two hours — she has said, in the only voice she needs, that she is fine.
  const state = (await store.getState(householdId)) ?? null;
  if (state) {
    const until = Math.max(state.snoozeUntilTs ?? 0, nowTs + 2 * HOUR);
    await store.setState(householdId, { ...state, snoozeUntilTs: until });
  }
  return tickHousehold(householdId);
}

export async function childAck(householdId: string, by: string): Promise<TickBundle | null> {
  const store = getStore();
  const household = await store.getHousehold(householdId);
  if (!household) return null;
  const nowTs = simNow(household);
  const state = (await store.getState(householdId)) ?? emptyState(nowTs);
  await store.setState(householdId, { ...state, ack: { by, ts: nowTs } });
  await store.appendEvent(householdId, {
    id: randomId(),
    ts: nowTs,
    type: 'ack',
    meta: `${by} checked in — siblings notified.`,
  });
  return tickHousehold(householdId);
}

export async function snooze(householdId: string, minutes: number): Promise<TickBundle | null> {
  const store = getStore();
  const household = await store.getHousehold(householdId);
  if (!household) return null;
  const nowTs = simNow(household);
  const state = (await store.getState(householdId)) ?? emptyState(nowTs);
  await store.setState(householdId, { ...state, snoozeUntilTs: nowTs + minutes * MIN });
  await store.appendEvent(householdId, {
    id: randomId(),
    ts: nowTs,
    type: 'snooze',
    meta: `Snoozed for ${minutes} min.`,
  });
  return tickHousehold(householdId);
}

// ---------------------------------------------------------------------------
// Demo scenarios — seed a believable week of signals in milliseconds
// ---------------------------------------------------------------------------

interface DayShape {
  wakeHour: number;
  motionUntilHour: number;
  chargeTonight: boolean;
  stopHour?: number; // hard stop for every signal this day
  noWake?: boolean; // the morning unlock never came
}

function dayStartOf(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function hourTs(dayStart: number, h: number): number {
  return dayStart + h * HOUR;
}

function ordinaryDay(
  dayStart: number,
  phoneId: string,
  espId: string | null,
  shape: DayShape,
): Signal[] {
  const out: Signal[] = [];
  const stop = shape.stopHour ?? 24;
  const push = (sourceId: string, type: Signal['type'], value: Signal['value'], ts: number) => {
    if (ts <= hourTs(dayStart, stop)) out.push({ sourceId, type, value, ts });
  };

  push(phoneId, 'charging', false, hourTs(dayStart, 6.85));
  if (!shape.noWake) push(phoneId, 'screen_event', 'unlock', hourTs(dayStart, shape.wakeHour));
  push(phoneId, 'location_zone', 'home', hourTs(dayStart, shape.wakeHour + 0.1));
  for (let h = shape.wakeHour; h <= Math.min(shape.motionUntilHour, stop); h += 0.5) {
    push(phoneId, 'motion', 1, hourTs(dayStart, h));
    if (Number.isInteger(h)) push(phoneId, 'app_usage', 'whatsapp', hourTs(dayStart, h));
    if (espId) push(espId, 'presence', 'motion', hourTs(dayStart, h));
  }
  if (shape.chargeTonight) push(phoneId, 'charging', true, hourTs(dayStart, 22.5));
  return out;
}

export type DemoScenario = 'normal' | 'slow' | 'emergency';

/**
 * Wipes the household's timeline and plants a scripted week, then sets the
 * simulated clock so the story starts exactly where it should. The engine
 * does the rest — the demo is the real engine, not a recording.
 */
export async function seedDemoScenario(
  householdId: string,
  scenario: DemoScenario,
): Promise<{ household: Household; sources: Source[] } | null> {
  const store = getStore();
  let household = await store.getHousehold(householdId);
  if (!household) return null;

  // Fresh timeline, fresh state, offset back to zero while we seed.
  await store.clearSignals(householdId);
  await store.clearEvents(householdId);
  household = await store.updateHousehold(householdId, { simTimeOffsetMs: 0 });
  if (!household) return null;

  // Sources: her phone + the optional room sensor.
  let sources = await store.getSources(householdId);
  const nowTs = Date.now();
  const ensure = async (type: Source['type'], label: string): Promise<Source> => {
    const existing = sources.find((s) => s.type === type);
    if (existing) return existing;
    const s: Source = {
      id: `src_${randomId()}`,
      type,
      label,
      apiKey: `sk_${randomId()}${randomId()}`,
      createdAtTs: nowTs,
      lastSeenTs: null,
    };
    await store.addSource(householdId, s);
    return s;
  };
  const phone = await ensure('phone', `${household.parentName}'s phone`);
  const esp = await ensure('esp32', 'Room sensor (ESP32)');
  sources = await store.getSources(householdId);

  const realNow = Date.now();
  const today = dayStartOf(realNow);

  // A believable learned baseline: up at 7:15, phone on charge 22:30.
  await store.setBaseline(householdId, {
    wakeHour: 7.25,
    chargingStartHour: 22.5,
    dailyMotionCount: 26,
    sampleDays: 6,
    updatedAt: realNow,
  });

  const days: Signal[] = [];
  for (let d = -6; d <= -1; d++) {
    days.push(...ordinaryDay(today + d * 24 * HOUR, phone.id, esp.id, {
      wakeHour: 7.1,
      motionUntilHour: 21.5,
      chargeTonight: true,
    }));
  }

  let offset = 0;
  if (scenario === 'normal') {
    // A living morning, up to a quarter of an hour ago.
    const lastMotionH = Math.max(7.5, ((realNow - today) / HOUR) - 0.25);
    days.push(...ordinaryDay(today, phone.id, esp.id, {
      wakeHour: 7.05,
      motionUntilHour: lastMotionH,
      chargeTonight: false,
    }));
  } else if (scenario === 'slow') {
    // She is up and about — the house was alive till mid-morning — but the
    // phone never left the nightstand. No unlock all day.
    days.push(...ordinaryDay(today, phone.id, esp.id, {
      wakeHour: 7.05,
      motionUntilHour: 8.5,
      chargeTonight: false,
      stopHour: 8.6,
      noWake: true,
    }));
    // Simulated clock: 11:30 today.
    offset = today + 11.5 * HOUR - realNow;
  } else {
    // Everything went quiet the evening before. No charge, no unlock,
    // no movement, no presence.
    days.push(...ordinaryDay(today - 24 * HOUR, phone.id, esp.id, {
      wakeHour: 7.1,
      motionUntilHour: 20.6,
      chargeTonight: false,
      stopHour: 20.7,
    }));
    // Simulated clock: 11:30 today.
    offset = today + 11.5 * HOUR - realNow;
  }

  for (const s of days) await store.appendSignal(householdId, s);

  // The learning window is measured in *simulated* time — the demo clock may
  // sit hours in the past, and the baseline must already be earned there.
  const updated = await store.updateHousehold(householdId, {
    simTimeOffsetMs: offset,
    learningUntilTs: realNow + offset - MIN,
  });
  await store.setState(householdId, emptyState(realNow + offset));
  await store.appendEvent(householdId, {
    id: randomId(),
    ts: realNow + offset,
    type: 'note',
    meta: `Demo scenario "${scenario}" seeded.`,
  });

  return { household: updated ?? household, sources };
}

/** Demo quick-start: first household or a fresh one. */
export async function ensureDemoHousehold(): Promise<Household> {
  const store = getStore();
  const existing = await store.listHouseholds();
  if (existing.length > 0) return existing[0];
  return createHousehold({ parentName: 'Amma', childName: 'Aditya' });
}
