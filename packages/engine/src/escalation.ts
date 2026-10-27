import type {
  Household,
  HouseholdEvent,
  HouseholdState,
  RiskResult,
  Signal,
  Tier,
} from '@khayaal/shared';
import { TIER_THRESHOLDS } from '@khayaal/shared';
import { MIN, fmtClock, isQuietHours } from './time';

export interface AdvanceInput {
  state: HouseholdState;
  risk: RiskResult;
  household: Household;
  signals: Signal[];
  nowTs: number;
}

export interface AdvanceOutput {
  state: HouseholdState;
  events: HouseholdEvent[]; // only the newly created events
}

/** Signals that mean "she interacted" — enough to reset escalation. */
const INTERACTION_TYPES = new Set(['screen_event', 'app_usage', 'manual_checkin']);
const ACTIVITY_TYPES = new Set(['screen_event', 'app_usage', 'manual_checkin', 'motion', 'steps']);

const RESET_WINDOW = 5 * MIN;
const TREND_STEP = 5 * MIN;
const TREND_CAP = 400;

/** Minutes to dwell in the current tier before the next step may fire. */
function dwellForNextTier(tier: Tier, hh: Household): number {
  if (tier === 0) return hh.escalationConfig.nudgeAfterMin;
  if (tier === 1) return hh.escalationConfig.checkInAfterMin;
  if (tier === 2) return hh.escalationConfig.alertAfterMin;
  return Infinity;
}

export function statusFor(state: HouseholdState, hh: Household, nowTs: number): string {
  const name = hh.parentName;
  if (state.learning) return `Learning ${name}'s rhythm…`;
  if (state.snoozeUntilTs && state.snoozeUntilTs > nowTs) return `Snoozed until ${fmtClock(state.snoozeUntilTs)}`;
  if (state.ack && state.tier === 3) return `${name} needs attention — ${state.ack.by} has checked in`;
  switch (state.tier) {
    case 0:
      return `${name} is doing fine`;
    case 1:
      return `We nudged ${name} gently`;
    case 2:
      return `Waiting for ${name}'s check-in`;
    case 3:
      return `${name} needs attention`;
  }
}

export function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Pure escalation state machine. Same inputs always produce the same state,
 * which is what makes transitions idempotent and race-safe: every evaluation
 * recomputes from signals + previous state, never mutates counters blindly.
 */
export function advanceState(input: AdvanceInput): AdvanceOutput {
  const { risk, household: hh, signals, nowTs } = input;
  const prev = input.state;
  const events: HouseholdEvent[] = [];
  const pushEvent = (e: Omit<HouseholdEvent, 'id'>) => events.push({ id: randomId(), ...e });

  // Latest activity / interaction timestamps
  let lastActiveTs = prev.lastActiveTs;
  let lastInteractionTs = 0;
  for (const s of signals) {
    if (s.ts > nowTs) continue;
    if (INTERACTION_TYPES.has(s.type)) lastInteractionTs = Math.max(lastInteractionTs, s.ts);
    if (s.type === 'presence' && s.value === 'motion') lastInteractionTs = Math.max(lastInteractionTs, s.ts);
    if (ACTIVITY_TYPES.has(s.type)) lastActiveTs = Math.max(lastActiveTs ?? 0, s.ts);
  }

  let tier: Tier = prev.tier;
  let tierSinceTs = prev.tierSinceTs;
  let snoozeUntilTs = prev.snoozeUntilTs;

  const clearSnoozeIfStale = () => {
    if (snoozeUntilTs !== null && snoozeUntilTs <= nowTs) snoozeUntilTs = null;
  };
  clearSnoozeIfStale();

  // --- Parent was seen interacting recently: everything stands down ------
  const parentJustActive = nowTs - lastInteractionTs < RESET_WINDOW && lastInteractionTs > 0;
  if (parentJustActive && tier !== 0) {
    pushEvent({ ts: nowTs, type: 'note', from: tier, to: 0, meta: `${hh.parentName} used the phone — standing down.` });
    tier = 0;
    tierSinceTs = nowTs;
  }

  if (!risk.learning && risk.score !== null) {
    const quiet = isQuietHours(hh.quietHours, nowTs);
    const snoozed = snoozeUntilTs !== null && snoozeUntilTs > nowTs;

    // Hard caps: quiet hours hold the family back unless it is clearly severe;
    // low confidence (thin data) never reaches the child.
    let cap: Tier = 3;
    if (quiet && risk.score < 85) cap = 1;
    if (snoozed) cap = 0;
    if (risk.confidence < 0.55) cap = Math.min(cap, 1) as Tier;

    const target = Math.min(risk.tier, cap) as Tier;

    if (target < tier) {
      pushEvent({ ts: nowTs, type: 'tier_change', from: tier, to: target, meta: 'Signals settled.' });
      tier = target;
      tierSinceTs = nowTs;
    } else if (target > tier) {
      // Escalate one step at a time, only after the dwell timer for the
      // current tier has elapsed. Sequential by design — the ladder is the
      // trust mechanism.
      const dwell = dwellForNextTier(tier, hh) * MIN;
      if (nowTs - tierSinceTs >= dwell) {
        const nextTier = Math.min(tier + 1, target) as Tier;
        const label =
          nextTier === 1 ? 'Soft nudge sent to her phone.' :
          nextTier === 2 ? 'Check-in prompt shown.' :
          'Family alerted with last-known signals.';
        pushEvent({ ts: nowTs, type: 'tier_change', from: tier, to: nextTier, meta: label });
        tier = nextTier;
        tierSinceTs = nowTs;
      }
    }

    // (A snooze is never cleared by parent activity — it is a promise the
    // family made to themselves; it expires on its own.)
  }

  // --- Trend sampling -----------------------------------------------------
  const trend = [...prev.scoreTrend];
  if (risk.score !== null && (trend.length === 0 || nowTs - trend[trend.length - 1].ts >= TREND_STEP)) {
    trend.push({ ts: nowTs, score: risk.score });
    while (trend.length > TREND_CAP) trend.shift();
  }

  const state: HouseholdState = {
    score: risk.score,
    tier,
    status: '',
    contributions: risk.contributions,
    confidence: risk.confidence,
    lastActiveTs: lastActiveTs || null,
    tierSinceTs,
    updatedTs: nowTs,
    scoreTrend: trend,
    snoozeUntilTs,
    ack: tier === 3 ? prev.ack : null,
    learning: risk.learning,
  };
  state.status = statusFor(state, hh, nowTs);

  return { state, events };
}

export { TIER_THRESHOLDS };
