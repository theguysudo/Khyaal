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
  /** The band agreeing with the phone that she has not moved. */
  watchStillness: 6,
  /** A night far below her own learned sleep baseline. */
  watchShortSleep: 8,
} as const;

/** Missing-source confidence penalties. */
const CONFIDENCE_PENALTY = {
  noPresenceSource: 0.15,
  noChargingData: 0.1,
  thinBaseline: 0.1,
  /** A band that was paired but has not reported for two days. */
  watchSilent: 0.05,
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
  // A zero-weight row from the wearable is an explanation (she moved), not a
  // claim about what she did not do — only the rows with points are claims.
  if (c.signal === 'activity' || c.signal === 'steps') return c.weight > 0;
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

  // --- 7. Smartwatch — a second pair of eyes --------------------------------
  // The band is not a verdict and never becomes one. It reports what it can
  // measure — steps, pulse, sleep, active minutes — and the engine uses it
  // for exactly two jobs: to *explain* an absence the phone cannot explain
  // (the phone is not on her), and to *corroborate* an absence the phone and
  // the room sensor already agree on. Nothing the band says raises the score
  // on its own, and nothing it says softens a fall or a loud sound.
  //
  // A band that is paired but silent lowers confidence, exactly like a phone
  // that never charges: missing data is not the same as bad news.
  const watchIds = new Set(
    sources.filter((s) => s.type === 'smartwatch').map((s) => s.id),
  );
  const watchSignals = signals
    .filter((s) => watchIds.has(s.sourceId))
    .sort((a, b) => a.ts - b.ts);
  const watchHeartRates = watchSignals.filter((s) => s.type === 'heart_rate');
  const watchActivity = watchSignals.filter((s) => s.type === 'activity');
  const watchSleep = watchSignals.filter((s) => s.type === 'sleep_duration');
  const watchSteps = watchSignals.filter((s) => s.type === 'steps');
  const phoneSteps = signals
    .filter((s) => s.type === 'steps' && !watchIds.has(s.sourceId))
    .sort((a, b) => a.ts - b.ts);

  // 7a. A pulse says she is alive and wearing the band. It does NOT say she
  // has moved — a resting pulse is exactly what a fallen person still has —
  // so it never softens the movement rule. It does refresh the liveness
  // clock (any signal counts), and it adds a little confidence because a
  // second, independent device is talking.
  const lastPulse = watchHeartRates.length ? watchHeartRates[watchHeartRates.length - 1] : null;
  if (lastPulse && nowTs - lastPulse.ts < 30 * MIN) {
    confidence += 0.05;
    notes.push(
      `Her band felt a pulse ${fmtDuration(nowTs - lastPulse.ts)} ago — she is wearing it and it is working.`,
    );
  }

  // 7b. Activity: the band says she moved and the phone's accelerometer did
  // not. That is a hint, not a declared fact, so it softens the movement
  // absence the way a GPS trail does — less than "being out" would.
  const recentBandActivity = [...watchActivity]
    .reverse()
    .find((a) => Number(a.value) >= 5 && nowTs - a.ts < 3 * HOUR);
  if (recentBandActivity && !away) {
    for (const c of contributions) {
      if (c.signal === 'motion') c.effect = Math.round(c.effect * 0.5 * 10) / 10;
    }
    contributions.unshift({
      signal: 'activity',
      weight: 0,
      effect: 0,
      reason: `Her band counted ${Math.round(Number(recentBandActivity.value))} active minutes ${fmtDuration(nowTs - recentBandActivity.ts)} ago — she moved, even if her phone did not feel it.`,
    });
  }

  // 7c. ...and the other way round. The band says she has not moved today
  // and the phone agrees: two independent absences line up, so the stillness
  // is a little more certain. A small, capped addition — never a verdict.
  const todayActivity = watchActivity.filter(
    (a) => a.ts >= dayStart.getTime() && a.ts <= nowTs,
  );
  const bandActiveToday = todayActivity.reduce((sum, a) => sum + Number(a.value), 0);
  const lastPhoneMotion = last(motions);
  const phoneQuiet =
    lastPhoneMotion === null || nowTs - lastPhoneMotion > 3 * HOUR;
  if (
    !away &&
    isDaytime(nowTs) &&
    todayActivity.length > 0 &&
    bandActiveToday < 5 &&
    phoneQuiet
  ) {
    contributions.push({
      signal: 'activity',
      weight: WEIGHTS.watchStillness,
      effect: WEIGHTS.watchStillness,
      reason: 'Her band agrees — no active minutes on her wrist today either.',
    });
  }

  // 7d. Steps: the band's count against the phone's. Two numbers from two
  // devices on the same body. When they disagree wildly, the phone is
  // probably not on her — the same explanation as "being out", but it comes
  // from the wrist instead of the GPS. When they agree, the movement (or
  // the stillness) is corroborated.
  const stepsToday = (list: Signal[]): number | null => {
    const today = list.filter((s) => s.ts >= dayStart.getTime() && s.ts <= nowTs);
    const latest = today.length ? today[today.length - 1] : null;
    return latest ? Number(latest.value) : null;
  };
  const bandSteps = stepsToday(watchSteps);
  const phoneStepsToday = stepsToday(phoneSteps);
  if (bandSteps !== null && phoneStepsToday !== null) {
    if (bandSteps >= 1000 && bandSteps >= phoneStepsToday * 3) {
      // The phone is not on her. Everything the phone's silence used to
      // mean now has a simpler explanation.
      for (const c of contributions) {
        if (c.signal === 'motion' || c.signal === 'screen_event' || c.signal === 'silence') {
          c.effect = Math.round(c.effect * 0.5 * 10) / 10;
        }
      }
      contributions.unshift({
        signal: 'steps',
        weight: 0,
        effect: 0,
        reason: `Her band counted ${Math.round(bandSteps)} steps today while her phone counted ${Math.round(phoneStepsToday)} — the phone is probably not on her.`,
      });
      notes.push('The band says she has been walking; a quiet phone is not a quiet house.');
    } else {
      const gap = Math.abs(bandSteps - phoneStepsToday);
      const scale = Math.max(bandSteps, phoneStepsToday);
      // Two counters that agree on a *small* number are saying the same
      // thing: she has hardly moved today. Two counters that agree on a
      // large one only say she walked — they say nothing about the last
      // three hours, so they add nothing to the movement rule.
      if (scale <= 800 && gap <= Math.max(200, scale * 0.25)) {
        confidence += 0.05;
        if (phoneQuiet && !away) {
          contributions.push({
            signal: 'steps',
            weight: 2,
            effect: 2,
            reason: 'Her band and her phone agree on how little she has moved today.',
          });
        }
      } else if (gap <= Math.max(200, scale * 0.25)) {
        confidence += 0.05;
      }
    }
  }

  // 7e. Sleep against the learned baseline. A night far below her own median
  // is a small, honest fact: a short night makes a slow morning ordinary and
  // a daytime fall more likely. It supports the other rules; it can never
  // carry the score on its own, and being out does not explain it.
  const learnedSleep = baseline.sleepMinutes;
  const lastNightSleep = watchSleep.length ? watchSleep[watchSleep.length - 1] : null;
  if (
    learnedSleep !== undefined &&
    learnedSleep >= 240 &&
    lastNightSleep !== null &&
    nowTs - lastNightSleep.ts < 24 * HOUR &&
    isDaytime(nowTs) &&
    !away
  ) {
    const slept = Number(lastNightSleep.value);
    if (slept > 0 && slept < learnedSleep * 0.65) {
      const shortfall = 1 - slept / learnedSleep; // 0 .. 1
      contributions.push({
        signal: 'sleep_duration',
        weight: WEIGHTS.watchShortSleep,
        effect: Math.min(WEIGHTS.watchShortSleep, 3 + shortfall * 8),
        reason: `She slept ${fmtDuration(slept * MIN)} last night — well under her usual ${fmtDuration(learnedSleep * MIN)}.`,
      });
    }
  }

  // 7f. A band that was paired but has not spoken for two days lowers the
  // confidence of everything we *can* see — it never raises the score.
  if (watchIds.size > 0) {
    const lastWatchSignal = watchSignals.length ? watchSignals[watchSignals.length - 1].ts : null;
    if (lastWatchSignal === null || nowTs - lastWatchSignal > 48 * HOUR) {
      confidence -= CONFIDENCE_PENALTY.watchSilent;
      notes.push('Her band has not reported for two days — confidence is lower without it.');
    }
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
