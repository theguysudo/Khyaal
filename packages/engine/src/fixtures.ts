import type {
  Baseline,
  EscalationConfig,
  Household,
  QuietHours,
  Signal,
  Source,
} from '@khayaal/shared';
import { HOUR, MIN } from './time';

/** A fixed reference point: 20 Oct 2026, 12:00 local time. */
export const BASE = new Date(2026, 9, 20, 12, 0, 0, 0).getTime();

export function dayAt(daysFromBase: number, hourDecimal: number): number {
  const d = new Date(BASE);
  d.setHours(0, 0, 0, 0);
  return d.getTime() + daysFromBase * 24 * HOUR + hourDecimal * HOUR;
}

export function makeHousehold(overrides: Partial<Household> = {}): Household {
  const quietHours: QuietHours = { start: 22, end: 6 };
  const escalationConfig: EscalationConfig = {
    nudgeAfterMin: 10,
    checkInAfterMin: 10,
    alertAfterMin: 15,
  };
  return {
    id: 'hh_test',
    parentName: 'Amma',
    childName: 'Aditya',
    childIds: ['child_1'],
    pairingCode: '123456',
    quietHours,
    escalationConfig,
    simTimeOffsetMs: 0,
    learningUntilTs: BASE - 24 * HOUR, // learning already done unless overridden
    createdAtTs: BASE - 30 * 24 * HOUR,
    ...overrides,
  };
}

export function makeSources({ esp32 = true }: { esp32?: boolean } = {}): Source[] {
  const list: Source[] = [
    { id: 'src_phone', type: 'simulator', label: "Amma's phone", apiKey: 'k_phone', createdAtTs: BASE, lastSeenTs: BASE },
  ];
  if (esp32) {
    list.push({ id: 'src_esp32', type: 'esp32', label: 'Room sensor', apiKey: 'k_esp32', createdAtTs: BASE, lastSeenTs: BASE });
  }
  return list;
}

export function seededBaseline(): Baseline {
  return { wakeHour: 7.25, chargingStartHour: 22.5, dailyMotionCount: 24, sampleDays: 6, updatedAt: BASE - HOUR };
}

interface DayOpts {
  wakeHour?: number;
  motionUntilHour?: number; // last motion of the day
  chargeTonight?: boolean; // phone goes on charge that evening
  signalsEndHour?: number; // hard stop for all signals that day
}

/** One ordinary day of signals for a phone (+ optional ESP32) source. */
export function dayOfSignals(daysFromBase: number, opts: DayOpts = {}): Signal[] {
  const {
    wakeHour = 7.1,
    motionUntilHour = 21.5,
    chargeTonight = true,
    signalsEndHour = 24,
  } = opts;
  const out: Signal[] = [];
  const push = (type: Signal['type'], value: Signal['value'], ts: number) => {
    if (ts <= dayAt(daysFromBase, signalsEndHour)) out.push({ sourceId: 'src_phone', type, value, ts });
  };

  push('charging', false, dayAt(daysFromBase, 6.8));
  push('screen_event', 'unlock', dayAt(daysFromBase, wakeHour));
  for (let h = wakeHour; h <= Math.min(motionUntilHour, signalsEndHour); h += 0.5) {
    push('motion', 1, dayAt(daysFromBase, h));
    if (Math.abs(h - Math.round(h)) < 0.01) push('app_usage', 'whatsapp', dayAt(daysFromBase, h));
  }
  push('location_zone', 'home', dayAt(daysFromBase, wakeHour));
  if (chargeTonight) push('charging', true, dayAt(daysFromBase, 22.5));

  // ESP32 presence rides along
  for (let h = wakeHour; h <= Math.min(motionUntilHour, signalsEndHour); h += 0.5) {
    out.push({ sourceId: 'src_esp32', type: 'presence', value: 'motion', ts: dayAt(daysFromBase, h) });
  }
  return out;
}

/** ESP32 presence lost after a given hour on a given day. */
export function presenceLost(daysFromBase: number, afterHour: number): Signal[] {
  return [
    { sourceId: 'src_esp32', type: 'presence', value: 'motion', ts: dayAt(daysFromBase, afterHour) },
    { sourceId: 'src_esp32', type: 'presence', value: 'lost', ts: dayAt(daysFromBase, afterHour) + 5 * MIN },
  ];
}

export const emptyState = (nowTs: number) => ({
  score: null,
  tier: 0 as const,
  status: '',
  contributions: [],
  confidence: 1,
  lastActiveTs: null,
  tierSinceTs: nowTs,
  updatedTs: nowTs,
  scoreTrend: [],
  snoozeUntilTs: null,
  ack: null,
  learning: false,
});
