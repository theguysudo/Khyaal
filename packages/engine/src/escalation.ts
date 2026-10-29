import type {
  Ack,
  Household,
  HouseholdEvent,
  HouseholdState,
  RiskResult,
  Signal,
  SosResponder,
  SosUnanswered,
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

/**
 * Responder coordination — how long an SOS may sit with nobody responding
 * before each escalation beat (alarm re-dispatch + explicit family-circle
 * notice). Five minutes: the phones are already ringing, so this is not the
 * alerting delay, it is the "is any human actually moving?" deadline.
 */
export const NEIGHBOUR_RESPOND_WINDOW_MIN_DEFAULT = 5;

/** Re-alerting forever would train the family to ignore the alarm. */
export const MAX_UNANSWERED_ESCALATIONS = 3;

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
    const active = (state.sos.responders ?? []).filter((r) => r.withdrawnTs === null);
    let responder = '';
    if (active.length > 0) {
      responder = ` — ${active[0].by} is responding${active.length > 1 ? ` (+${active.length - 1} helping)` : ''}`;
    } else if ((state.sos.unanswered?.attempts ?? 0) > 0) {
      responder = ' — nobody has responded yet';
    }
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
  // no matter how many times it is recomputed.
  let sosPressedTs: number | null = null;
  let sosPressedOrigin: 'button' | 'auto' | null = null;
  let sosResolvedTs: number | null = null;
  const respondSigs: { sourceId: string; by: string; ts: number; etaMin: number | null }[] = [];
  const withdrawSigs: { sourceId: string; ts: number }[] = [];
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
      respondSigs.push({
        sourceId: s.sourceId,
        by: String(s.meta?.by ?? 'Someone'),
        ts: s.ts,
        etaMin: typeof s.meta?.etaMin === 'number' && Number.isFinite(s.meta.etaMin) ? s.meta.etaMin : null,
      });
    } else if (s.value === 'withdrawn') {
      withdrawSigs.push({ sourceId: s.sourceId, ts: s.ts });
    }
  }
  const manualSosActive = sosPressedTs !== null && (sosResolvedTs === null || sosResolvedTs < sosPressedTs);
  // A resolve that lands after the press (or with no press at all — the auto
  // SOS was raised by the ladder, so the family stands it down by hand).
  const sosResolveArrived = sosResolvedTs !== null && (sosPressedTs === null || sosResolvedTs >= sosPressedTs);

  // --- Responder team ------------------------------------------------------
  // Coordination, derived like everything else: every source that said
  // "I'm responding" to THIS sos joins the team — the first one to arrive
  // leads, later ones join rather than overwrite (a second neighbour erasing
  // the first was the old last-write-wins behaviour, and it lied). A
  // 'withdrawn' from the same source stands them back down, so the next
  // neighbour is visibly still needed. Re-responding rejoins.
  // The anchor is the start of the current emergency: the ongoing sos's
  // sinceTs when one is live (so a responder to the auto alarm keeps their
  // place even after the elder also presses the button), else the press
  // itself. A responder of last week's emergency cannot ride in on this one.
  const respondAnchorTs =
    prev.sos.active && prev.sos.sinceTs !== null && (sosPressedTs === null || sosPressedTs >= prev.sos.sinceTs)
      ? prev.sos.sinceTs
      : sosPressedTs;
  const team = new Map<string, SosResponder>();
  if (respondAnchorTs !== null) {
    const chron: ({ kind: 'join'; ts: number; sourceId: string; by: string; etaMin: number | null } | { kind: 'leave'; ts: number; sourceId: string })[] = [
      ...respondSigs.filter((r) => r.ts >= respondAnchorTs).map((r) => ({ kind: 'join' as const, ...r })),
      ...withdrawSigs.filter((w) => w.ts >= respondAnchorTs).map((w) => ({ kind: 'leave' as const, ...w })),
    ].sort((a, b) => a.ts - b.ts);
    for (const e of chron) {
      if (e.kind === 'join') {
        const existing = team.get(e.sourceId);
        if (existing) {
          existing.withdrawnTs = null;
          existing.by = e.by;
          if (e.etaMin !== null) existing.etaMin = e.etaMin;
        } else {
          team.set(e.sourceId, {
            sourceId: e.sourceId,
            by: e.by,
            respondedTs: e.ts,
            etaMin: e.etaMin,
            withdrawnTs: null,
          });
        }
      } else {
        const existing = team.get(e.sourceId);
        if (existing && existing.withdrawnTs === null) existing.withdrawnTs = e.ts;
      }
    }
  }
  const responders: SosResponder[] = [...team.values()].sort((a, b) => a.respondedTs - b.respondedTs);
  const activeResponders = responders.filter((r) => r.withdrawnTs === null);
  const primary = activeResponders[0] ?? null;
  const sosResponded: Ack | null = primary ? { by: primary.by, ts: primary.respondedTs } : null;

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

  // --- Unanswered escalation ----------------------------------------------
  // The alarm ringing is not the same as a human moving. While the sos is
  // active with nobody responding, each response window that passes fires an
  // escalation beat: an sos event the server's tick re-dispatches the alarm
  // from (full volume again) with the reason naming the silence, plus the
  // attempt count in state so every surface can show it. A responder joining
  // stops the clock; the withdrawal that empties the team restarts it — the
  // family must know the door is open again. Deliberately OUTSIDE the
  // learning/score gate: a live sos escalates even if the risk engine has
  // nothing to say.
  const respondWindowMs = Math.max(1, hh.neighbourRespondWindowMin ?? NEIGHBOUR_RESPOND_WINDOW_MIN_DEFAULT) * MIN;
  let unanswered: SosUnanswered | null = null;
  if (tier === 4 && activeResponders.length === 0 && respondAnchorTs !== null) {
    const emptySinceTs = responders.length === 0
      ? respondAnchorTs
      : Math.max(...responders.map((r) => r.withdrawnTs ?? 0));
    const elapsed = nowTs - emptySinceTs;
    const attempts = Math.min(MAX_UNANSWERED_ESCALATIONS, Math.max(0, Math.floor(elapsed / respondWindowMs)));
    const prevUn = prev.sos.unanswered ?? null;
    const sameEpisode = prevUn !== null && prevUn.emptySinceTs === emptySinceTs;
    unanswered = {
      attempts,
      windowMin: Math.round(respondWindowMs / MIN),
      emptySinceTs,
      lastEscalationTs: attempts > 0 ? emptySinceTs + attempts * respondWindowMs : null,
    };
    if (attempts > (sameEpisode ? prevUn.attempts : 0)) {
      pushEvent({
        ts: nowTs,
        type: 'sos',
        from: 4,
        to: 4,
        meta: `No one has responded for ${Math.round(elapsed / MIN)} min — alarm re-rung and the family circle notified (attempt ${attempts} of ${MAX_UNANSWERED_ESCALATIONS}).`,
      });
    }
  }

  // --- Trend sampling -----------------------------------------------------
  const trend = [...prev.scoreTrend];
  if (risk.score !== null && (trend.length === 0 || nowTs - trend[trend.length - 1].ts >= TREND_STEP)) {
    trend.push({ ts: nowTs, score: risk.score });
    while (trend.length > TREND_CAP) trend.shift();
  }

  // The SOS record: active exactly when the tier is 4, with the origin, the
  // responder team and the unanswered countdown derived from the signals —
  // so every tick agrees without carrying anything over from prev.
  const sosActive = tier === 4;
  const sos: HouseholdState['sos'] = {
    active: sosActive,
    origin: sosActive ? (manualSosActive ? sosPressedOrigin : prev.sos.origin ?? 'auto') : null,
    sinceTs: sosActive ? (sosPressedTs ?? (sosActive && prev.sos.active ? prev.sos.sinceTs : nowTs)) : null,
    ack: sosActive ? sosResponded : null,
    responders: sosActive ? responders : [],
    unanswered: sosActive ? unanswered : null,
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
