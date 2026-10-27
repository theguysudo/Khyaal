import type { Baseline, Signal } from '@khayaal/shared';
import { HOUR, hourOf, startOfDay } from './time';

export const DEFAULT_BASELINE: Baseline = {
  wakeHour: 7.25,
  chargingStartHour: 22.5,
  dailyMotionCount: 24,
  sampleDays: 0,
  updatedAt: 0,
};

export type { Baseline };

function median(nums: number[]): number {
  if (nums.length === 0) return NaN;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Fold a recent window of signals into the baseline. v1 keeps it deliberately
 * simple — a few robust medians — so it is explainable and debuggable.
 * A weak day (few signals) simply doesn't move the medians much.
 */
export function learnBaseline(prev: Baseline, signals: Signal[], nowTs: number): Baseline {
  const since = nowTs - 7 * 24 * HOUR;
  const recent = signals.filter((s) => s.ts >= since && s.ts <= nowTs);

  // First unlock per day -> wake estimate
  const firstUnlockByDay = new Map<number, number>();
  for (const s of recent) {
    if (s.type !== 'screen_event') continue;
    const day = startOfDay(s.ts);
    const cur = firstUnlockByDay.get(day);
    if (cur === undefined || s.ts < cur) firstUnlockByDay.set(day, s.ts);
  }
  const wakes = [...firstUnlockByDay.values()].map((ts) => hourOf(ts));

  // First "on charge" per evening -> charge start estimate
  const chargeStartByDay = new Map<number, number>();
  for (const s of recent) {
    if (s.type !== 'charging' || s.value !== true) continue;
    const day = startOfDay(s.ts);
    const cur = chargeStartByDay.get(day);
    if (cur === undefined || s.ts < cur) chargeStartByDay.set(day, s.ts);
  }
  const charges = [...chargeStartByDay.values()].map((ts) => hourOf(ts));

  // Motion events per day -> activity level
  const motionByDay = new Map<number, number>();
  for (const s of recent) {
    if (s.type !== 'motion') continue;
    const day = startOfDay(s.ts);
    motionByDay.set(day, (motionByDay.get(day) ?? 0) + 1);
  }
  const motions = [...motionByDay.values()];

  const daysSeen = Math.max(firstUnlockByDay.size, motionByDay.size);
  if (daysSeen === 0) return { ...prev, updatedAt: nowTs };

  const next: Baseline = { ...prev, updatedAt: nowTs };
  if (wakes.length >= 2) next.wakeHour = clamp(median(wakes), 4, 12);
  if (charges.length >= 2) next.chargingStartHour = clamp(median(charges), 18, 26) % 24;
  if (motions.length >= 2) next.dailyMotionCount = Math.max(4, median(motions));
  next.sampleDays = Math.min(14, prev.sampleDays + daysSeen);
  return next;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
