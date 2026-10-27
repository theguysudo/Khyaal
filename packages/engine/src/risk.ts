import type {
  Baseline,
  Contribution,
  Household,
  RiskResult,
  Signal,
  Source,
  Tier,
} from '@khayaal/shared';
import { TIER_THRESHOLDS } from '@khayaal/shared';
import { DEFAULT_BASELINE } from './baseline';
import { HOUR, MIN, fmtDuration, fmtHour, isDaytime, isQuietHours } from './time';

export interface RiskInput {
  signals: Signal[];
  baseline?: Baseline;
  sources: Source[];
  household: Pick<Household, 'quietHours' | 'learningUntilTs'>;
  nowTs: number;
}

const WEIGHTS = {
  morningUnlock: 30,
  movement: 28,
  overnightCharge: 16,
  presence: 18,
  silence: 20,
  gpsStillness: 18,
} as const;

/** Missing-source confidence penalties. */
const CONFIDENCE_PENALTY = {
  noPresenceSource: 0.15,
  noChargingData: 0.1,
  thinBaseline: 0.1,
} as const;

export function tierForScore(score: number): Tier {
  if (score >= TIER_THRESHOLDS[3]) return 3;
  if (score >= TIER_THRESHOLDS[2]) return 2;
  if (score >= TIER_THRESHOLDS[1]) return 1;
  return 0;
}

const byType = (signals: Signal[], type: Signal['type']) =>
  signals.filter((s) => s.type === type).sort((a, b) => a.ts - b.ts);

/**
 * Is this contribution an *absence* — something that weighs only because it
 * did not happen? Those are the ones an explanation (being away, having gone
 * out) is allowed to soften. A fall or a loud sound is a verdict: it is
 * never softened, only ever added to.
 */
function isAbsenceContribution(c: Contribution): boolean {
  if (c.signal === 'sound_event') return false;
  if (c.signal === 'presence') return c.weight === WEIGHTS.presence; // not the fall
  return c.signal === 'screen_event' || c.signal === 'motion' || c.signal === 'silence' || c.signal === 'charging';
}

/**
 * The rule-based v1 scorer. Absence weighs far more than presence: a quiet
 * phone alone proves nothing, but four independent absences together are the
 * confidence score the family acts on.
 *
 * Guarantees the spec cares about:
 * - missing data from one source degrades confidence, never alerts alone;
 * - the parent being out (location_zone 'away') explains other absences;
 * - quiet hours hold escalation back (handled on the tier, see escalation.ts).
 */
export function computeRisk(input: RiskInput): RiskResult {
  const { signals, sources, nowTs } = input;
  const baseline = input.baseline ?? DEFAULT_BASELINE;
  const learning = nowTs < input.household.learningUntilTs;

  const contributions: Contribution[] = [];
  const notes: string[] = [];
  let confidence = 1;

  if (learning) {
    return {
      score: null,
      tier: 0,
      contributions: [],
      confidence,
      learning: true,
      notes: ['Learning her rhythm — scoring starts once the baseline is ready.'],
    };
  }

  const unlocks = byType(signals, 'screen_event');
  const motions = byType(signals, 'motion');
  const chargings = byType(signals, 'charging');
  const zones = byType(signals, 'location_zone');
  const gps = byType(signals, 'gps_motion');
  const presences = byType(signals, 'presence');
  const checkins = byType(signals, 'manual_checkin');
  const sleeps = byType(signals, 'sleep_event');
  const sounds = byType(signals, 'sound_event');

  const last = (list: Signal[]): number | null => (list.length ? list[list.length - 1].ts : null);

  const hasPresenceSource = sources.some((s) => s.type === 'esp32');
  const lastZone = last(zones);
  const away =
    lastZone !== null &&
    zones[zones.length - 1].value === 'away' &&
    nowTs - lastZone < 12 * HOUR;

  const explanation: Contribution = {
    signal: 'location_zone',
    weight: 0,
    effect: 0,
    reason: `She left home around ${fmtHour(lastZone ?? nowTs)} — being out explains a quiet house.`,
  };

  // --- 1. Morning unlock -------------------------------------------------
  const dayStart = new Date(nowTs);
  dayStart.setHours(0, 0, 0, 0);
  const unlockedToday = unlocks.some((s) => s.ts >= dayStart.getTime() && s.ts <= nowTs);
  const wakePlus = (baseline.wakeHour + 0.75) * HOUR + dayStart.getTime();

  if (!away && isDaytime(nowTs) && !unlockedToday && nowTs >= wakePlus) {
    const lateMs = nowTs - wakePlus;
    contributions.push({
      signal: 'screen_event',
      weight: WEIGHTS.morningUnlock,
      effect: Math.min(WEIGHTS.morningUnlock, 12 + (lateMs / (20 * MIN)) * 2),
      reason: `No phone unlock yet today — she is usually up by ${fmtHour(baseline.wakeHour)}.`,
    });
  }

  // --- 2. Movement -------------------------------------------------------
  const lastMotion = last(motions) ?? last(checkins);
  if (!away && isDaytime(nowTs) && lastMotion !== null) {
    const gap = nowTs - lastMotion;
    if (gap > 6 * HOUR) {
      contributions.push({
        signal: 'motion',
        weight: WEIGHTS.movement,
        effect: Math.min(WEIGHTS.movement, 10 + ((gap - 6 * HOUR) / (30 * MIN)) * 2),
        reason: `No movement for ${fmtDuration(gap)} — usually she is around the house.`,
      });
    }
  } else if (!away && isDaytime(nowTs) && lastMotion === null && signals.length > 0) {
    contributions.push({
      signal: 'motion',
      weight: WEIGHTS.movement,
      effect: 10,
      reason: 'No movement recorded all day so far.',
    });
  }

  // --- 3. Overnight charging --------------------------------------------
  if (chargings.length === 0) {
    confidence -= CONFIDENCE_PENALTY.noChargingData;
  } else if (!away) {
    const chargedLastNight = chargings.some(
      (s) => s.value === true && s.ts >= dayStart.getTime() - 10 * HOUR && s.ts <= wakePlus,
    );
    const morningNow = nowTs >= wakePlus;
    if (morningNow && !chargedLastNight) {
      contributions.push({
        signal: 'charging',
        weight: WEIGHTS.overnightCharge,
        effect: WEIGHTS.overnightCharge,
        reason: 'The phone never went on charge last night.',
      });
    }
  }

  // --- 4. ESP32 presence (optional source) -------------------------------
  if (!hasPresenceSource) {
    confidence -= CONFIDENCE_PENALTY.noPresenceSource;
    notes.push('No room sensor paired — confidence is lower without it.');
  } else if (!away) {
    const lastSeen = last(presences);
    const lastActivePresence = [...presences].reverse().find((p) => p.value === 'motion');
    const since = Math.min(
      lastSeen !== null ? nowTs - lastSeen : Infinity,
      lastActivePresence ? nowTs - lastActivePresence.ts : Infinity,
    );
    if (Number.isFinite(since) && since > 2 * HOUR && isDaytime(nowTs)) {
      contributions.push({
        signal: 'presence',
        weight: WEIGHTS.presence,
        effect: Math.min(WEIGHTS.presence, 8 + ((since - 2 * HOUR) / (20 * MIN)) * 2),
        reason: `The room sensor has felt no movement for ${fmtDuration(since)}.`,
      });
    }
  }

  // --- 4b. Fall (CSI room sensor) — the one presence event that is a verdict
  // rather than an absence. It is added after the away-softening block on
  // purpose: a room sensor seeing a fall is never explained away by the phone
  // reporting 'away', and it is never softened.
  const lastFall = [...presences].reverse().find((p) => p.value === 'fall');
  if (lastFall) {
    const sinceFall = nowTs - lastFall.ts;
    if (sinceFall < 15 * MIN) {
      contributions.push({
        signal: 'presence',
        weight: 100,
        effect: 100,
        reason: `A possible fall was sensed in her room ${fmtDuration(sinceFall)} ago.`,
      });
      notes.push('Fall detection is active — the room sensor felt an impact pattern.');
    } else if (sinceFall < 60 * MIN) {
      contributions.push({
        signal: 'presence',
        weight: 70,
        effect: 70,
        reason: `A possible fall was sensed ${fmtDuration(sinceFall)} ago and no movement has followed it.`,
      });
    }
  }

  // --- 4c. GPS movement — detected here, applied after the silence rule ---
  // The phone reports movement derived from GPS, never coordinates: how far
  // she has moved, how fast, and whether she is moving at all. Its job is to
  // explain a quiet house ("she went to the market") and to corroborate
  // stillness when the accelerometer has nothing to say.
  const lastGps = last(gps);
  const recentTravel = [...gps]
    .reverse()
    .find((g) => {
      const distance = Number(g.meta?.distanceM ?? 0);
      const speed = Number(g.meta?.speedKmh ?? 0);
      return (distance >= 800 || speed >= 8) && nowTs - g.ts < 3 * HOUR;
    });
  if (lastGps !== null && nowTs - lastGps < 12 * HOUR) {
    // A second, independent movement source is worth a little confidence.
    confidence += 0.05;
  }

  // --- 5. Silence — the strongest single signal --------------------------
  const lastAny = Math.max(
    ...signals.map((s) => s.ts),
    last(checkins) ?? 0,
  );
  if (Number.isFinite(lastAny) && signals.length > 0) {
    const gap = nowTs - lastAny;
    const threshold = isQuietHours(input.household.quietHours, nowTs) ? 10 * HOUR : 3 * HOUR;
    if (gap > threshold) {
      contributions.push({
        signal: 'silence',
        weight: WEIGHTS.silence,
        effect: Math.min(WEIGHTS.silence, 6 + ((gap - threshold) / (30 * MIN)) * 1.5),
        reason: `No signal of any kind for ${fmtDuration(gap)}.`,
      });
    }
  } else {
    confidence -= CONFIDENCE_PENALTY.thinBaseline;
    notes.push('Very little history yet — treat the score gently.');
  }

  // --- 5b. GPS movement applied -----------------------------------------
  // Applied after the silence rule so travel can soften it — a quiet house
  // with a GPS trail is a busy person, not a silent one.
  if (!away && recentTravel && !isQuietHours(input.household.quietHours, nowTs)) {
    // Soften the absence signals — but less than the 'away' zone does,
    // because a zone is a declared fact and travel is a hint. The signals are
    // softened, never hidden.
    //
    // Only absences are softened. A fall (the sensor's verdict) and a loud
    // sound (the phone's verdict) are never explained away by movement.
    for (const c of contributions) {
      if (isAbsenceContribution(c)) c.effect = Math.round(c.effect * 0.5 * 10) / 10;
    }
    contributions.unshift({
      signal: 'gps_motion',
      weight: 0,
      effect: 0,
      reason: `Her phone's GPS shows she has moved recently (${Math.round(Number(recentTravel.meta?.distanceM ?? 0))} m) — that explains a quiet house.`,
    });
    notes.push('GPS shows recent movement — some absences are explained.');
  } else if (
    !away &&
    isDaytime(nowTs) &&
    lastGps !== null &&
    nowTs - lastGps > 6 * HOUR &&
    !motions.some((m) => nowTs - m.ts < 6 * HOUR)
  ) {
    // GPS is the only movement source we have, and it has been still for hours.
    contributions.push({
      signal: 'gps_motion',
      weight: WEIGHTS.gpsStillness,
      effect: Math.min(WEIGHTS.gpsStillness, 8 + ((nowTs - lastGps - 6 * HOUR) / (30 * MIN)) * 1.5),
      reason: `GPS has seen no movement for ${fmtDuration(nowTs - lastGps)}.`,
    });
  }

  // --- 6. Night context: sleep marker softens the expected night quiet ----
  const lastSleep = last(sleeps);
  const markedAsleep =
    lastSleep !== null &&
    sleeps[sleeps.length - 1].value === 'asleep' &&
    nowTs - lastSleep < 9 * HOUR &&
    isQuietHours(input.household.quietHours, nowTs);
  if (markedAsleep) {
    for (const c of contributions) {
      if (c.signal === 'silence' || c.signal === 'screen_event' || c.signal === 'motion') {
        c.effect = Math.round(c.effect * 0.25 * 10) / 10;
      }
    }
    notes.push('She is marked asleep — a quiet night is expected, not a risk.');
  }

  // A loud sound near her phone is the one presence-of-danger signal.
  const lastSound = last(sounds);
  if (
    !away &&
    lastSound !== null &&
    nowTs - lastSound < 10 * MIN &&
    sounds[sounds.length - 1].value === 'loud'
  ) {
    contributions.push({
      signal: 'sound_event',
      weight: 15,
      effect: 15,
      reason: 'A loud sound was detected near her phone moments ago.',
    });
  }

  // --- Away overrides the absence signals --------------------------------
  // Being out is not a risk signal — it is an explanation. It always shows,
  // and whatever absences survived are softened, never hidden.
  //
  // A fall is never softened by being away: the room sensor saw an impact
  // pattern, and a phone that happens to be out does not explain it away.
  if (away) {
    for (const c of contributions) {
      if (isAbsenceContribution(c)) c.effect = Math.round(c.effect * 0.35 * 10) / 10;
    }
    contributions.unshift(explanation);
    notes.push('Being out softens the other signals; they are not ignored, just explained.');
  }

  if (baseline.sampleDays < 2) confidence -= CONFIDENCE_PENALTY.thinBaseline;
  confidence = Math.max(0.4, Math.min(1, confidence));

  const raw = contributions.reduce((sum, c) => sum + c.effect, 0);
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  return {
    score,
    tier: tierForScore(score),
    contributions,
    confidence,
    learning: false,
    notes,
  };
}
