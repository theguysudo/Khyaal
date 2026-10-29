import type {
  Ack,
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
  if (tier === 3) return hh.escalationConfig.alertAfterMin; // dwelling here too long raises SOS
  return Infinity;
}

/** The idle SOS state — inactive, no origin, nobody responding. */
export function emptySos() {
  return { active: false, origin: null, sinceTs: null, ack: null };
}

export function statusFor(state: HouseholdState, hh: Household, nowTs: number): string {
  const name = hh.parentName;
  if (state.learning) return `Learning ${name}'s rhythm…`;
  if (state.snoozeUntilTs && state.snoozeUntilTs > nowTs) return `Snoozed until ${fmtClock(state.snoozeUntilTs)}`;
  if (state.sos.active) {
    const responder = state.sos.ack ? ` — ${state.sos.ack.by} is responding` : '';
    return state.sos.origin === 'button'
      ? `SOS — ${name} pressed the emergency button${responder}`
      : `SOS — no answer to the alert ladder${responder}`;
  }
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
    case 4:
      return `SOS`;
  }
}

export function randomId(): string {
  // CSPRNG via the platform Web Crypto (Node 18+ and every browser): these
  // ids end up inside API keys and pairing identifiers, so predictability
  // was a real finding, not a nitpick. `globalThis.crypto` is the one form
  // that works in both places — this package is bundled into the browser
  // dashboard as well as the server.
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("");
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

  // --- SOS derivation ------------------------------------------------------
  // Recomputed from signals on every tick, like everything else here: the
  // last 'pressed' wins over the last 'resolved', so the state is identical
  // no matter how many times it is recomputed. A responder ('responded') is
  // whoever spoke after the button did.
  let sosPressedTs: number | null = null;
  let sosPressedOrigin: 'button' | 'auto' | null = null;
  let sosResolvedTs: number | null = null;
  let sosResponded: Ack | null = null;
  for (const s of signals) {
    if (s.ts > nowTs || s.type !== 'sos') continue;
    if (s.value === 'pressed') {
      if (sosPressedTs === null || s.ts >= sosPressedTs) {
        sosPressedTs = s.ts;
        sosPressedOrigin = s.meta?.origin === 'auto' ? 'auto' : 'button';
      }
    } else if (s.value === 'resolved') {
      sosResolvedTs = Math.max(sosResolvedTs ?? 0, s.ts);
    } else if (s.value === 'responded') {
      if (!sosResponded || s.ts >= sosResponded.ts) {
        sosResponded = { by: String(s.meta?.by ?? 'Someone'), ts: s.ts };
      }
    }
  }
  const manualSosActive = sosPressedTs !== null && (sosResolvedTs === null || sosResolvedTs < sosPressedTs);
  // A resolve that lands after the press (or with no press at all — the auto
  // SOS was raised by the ladder, so the family stands it down by hand).
  const sosResolveArrived = sosResolvedTs !== null && (sosPressedTs === null || sosResolvedTs >= sosPressedTs);
  const respondedForThisSos = sosResponded && sosPressedTs !== null && sosResponded.ts >= sosPressedTs;

  const clearSnoozeIfStale = () => {
    if (snoozeUntilTs !== null && snoozeUntilTs <= nowTs) snoozeUntilTs = null;
  };
  clearSnoozeIfStale();

  // --- Parent was seen interacting recently: everything stands down ------
  // While a manual SOS is live, ordinary phone use does NOT stand it down —
  // the button was pressed on purpose, and pocket unlocks must not silence
  // an emergency. Only her explicit check-in (or a resolve, below) does.
  const lastCheckinTs = (() => {
    let t = 0;
    for (const s of signals) if (s.type === 'manual_checkin' && s.ts <= nowTs) t = Math.max(t, s.ts);
    return t;
  })();
  const parentJustActive = nowTs - lastInteractionTs < RESET_WINDOW && lastInteractionTs > 0;
  const parentCheckedIn = nowTs - lastCheckinTs < RESET_WINDOW && lastCheckinTs > 0;
  const standDownOnActivity =
    (manualSosActive ? parentCheckedIn : parentJustActive);
  if (standDownOnActivity && tier !== 0) {
    pushEvent({
      ts: nowTs,
      type: 'note',
      from: tier,
      to: 0,
      meta: manualSosActive
        ? `${hh.parentName} checked in — SOS standing down.`
        : `${hh.parentName} used the phone — standing down.`,
    });
    tier = 0;
    tierSinceTs = nowTs;
  }

  if (!risk.learning && risk.score !== null) {
    const quiet = isQuietHours(hh.quietHours, nowTs);
    const snoozed = snoozeUntilTs !== null && snoozeUntilTs > nowTs;

    // A live manual SOS outranks everything below it: no score can pull it
    // down, no quiet hour can cap it. Only a resolve (or her check-in, or a
    // resolve signal) ends it.
    if (manualSosActive && tier < 4) {
      pushEvent({
        ts: nowTs,
        type: 'sos',
        from: tier,
        to: 4,
        meta: `${hh.parentName} pressed the SOS button — alarm raised.`,
      });
      tier = 4;
      tierSinceTs = nowTs;
    } else if (tier === 4) {
      // Stood down — by an explicit resolve (button or auto path), by the
      // button's own resolve, or — auto SOS only — by genuine recovery: the
      // score falling back to all-well means she is moving again. A button
      // press is a human's word; only a human (or her check-in) ends it.
      const autoSos = prev.sos.origin !== 'button';
      const riskSettled = risk.tier === 0;
      if (prev.sos.origin === 'button' && !manualSosActive) {
        pushEvent({ ts: nowTs, type: 'sos', from: 4, to: 0, meta: 'SOS stood down.' });
        tier = 0;
        tierSinceTs = nowTs;
      } else if (sosResolveArrived) {
        pushEvent({ ts: nowTs, type: 'sos', from: 4, to: 0, meta: 'SOS stood down.' });
        tier = 0;
        tierSinceTs = nowTs;
      } else if (autoSos && riskSettled) {
        pushEvent({ ts: nowTs, type: 'sos', from: 4, to: 0, meta: 'Signals settled — automatic SOS stood down.' });
        tier = 0;
        tierSinceTs = nowTs;
      }
    } else {
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

      // --- Auto-SOS: the ladder ran out -----------------------------------
      // Tier 3 held for the alert window with no answer and no check-in: the
      // system raises the alarm itself. This is the "system reached the SOS
      // stage" path — the phones ring exactly as if she had pressed.
      if (tier === 3 && nowTs - tierSinceTs >= hh.escalationConfig.alertAfterMin * MIN) {
        pushEvent({
          ts: nowTs,
          type: 'sos',
          from: 3,
          to: 4,
          meta: 'No answer to the alert ladder — SOS raised automatically.',
        });
        tier = 4;
        tierSinceTs = nowTs;
      }
    }

    // --- Fall override -----------------------------------------------------
    // A freshly sensed fall skips the ladder, the dwell timers, quiet hours
    // and the confidence gate, and goes straight to SOS: the sensor saw an
    // impact pattern, and that is precisely the moment the alarm must ring —
    // even at 3am, even in quiet hours. A resolve newer than the fall means
    // somebody already answered THIS fall — the alarm stays down until the
    // sensor sees a fresh one, otherwise standing down is impossible.
    const lastFall = [...signals]
      .reverse()
      .find((s) => s.type === 'presence' && s.value === 'fall');
    const fallSupersededByResolve = sosResolvedTs !== null && (!lastFall || sosResolvedTs > lastFall.ts);
    if (lastFall && nowTs - lastFall.ts < 15 * MIN && tier < 4 && !manualSosActive && !fallSupersededByResolve) {
      pushEvent({
        ts: nowTs,
        type: 'sos',
        from: tier,
        to: 4,
        meta: 'Possible fall detected by the room sensor — SOS raised immediately.',
      });
      tier = 4;
      tierSinceTs = nowTs;
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

  // The SOS record: active exactly when the tier is 4, with the origin and
  // the first responder derived from the signals — so every tick agrees.
  const sosActive = tier === 4;
  const sos: HouseholdState['sos'] = {
    active: sosActive,
    origin: sosActive ? (manualSosActive ? sosPressedOrigin : prev.sos.origin ?? 'auto') : null,
    sinceTs: sosActive ? (sosPressedTs ?? (sosActive && prev.sos.active ? prev.sos.sinceTs : nowTs)) : null,
    ack: respondedForThisSos ? sosResponded : sosActive ? prev.sos.ack : null,
  };

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
    sos,
  };
  state.status = statusFor(state, hh, nowTs);

  return { state, events };
}

export { TIER_THRESHOLDS };
