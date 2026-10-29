import { describe, expect, it } from 'vitest';
import type { Signal, SosUnanswered } from '@khayaal/shared';
import {
  advanceState,
  dayAt,
  dayOfSignals,
  emptyState,
  makeHousehold,
  statusFor,
  MAX_UNANSWERED_ESCALATIONS,
  MIN,
} from '../src';

/**
 * Responder coordination + no-response escalation on the SOS state machine:
 * several neighbours may answer (first leads, others join), a responder may
 * stand back down, and an SOS nobody answers must not just ring forever —
 * each response window fires an escalation beat the server re-dispatches.
 */

const sosRisk = { score: 10, tier: 0 as const, contributions: [], confidence: 0.5, learning: false, notes: [] };
// An auto-origin sos stands down when the risk settles, so tests that keep a
// live auto sos use an unsettled risk instead.
const unsettledRisk = { score: 80, tier: 3 as const, contributions: [], confidence: 0.9, learning: false, notes: [] };

const press = (ts: number, origin: 'button' | 'auto' = 'button'): Signal => ({
  sourceId: 'src_phone',
  type: 'sos',
  value: 'pressed',
  ts,
  meta: { origin },
});
const respond = (ts: number, sourceId: string, by: string, etaMin?: number): Signal => ({
  sourceId,
  type: 'sos',
  value: 'responded',
  ts,
  meta: { by, ...(etaMin !== undefined ? { etaMin } : {}) },
});
const standDown = (ts: number, sourceId: string, by: string): Signal => ({
  sourceId,
  type: 'sos',
  value: 'withdrawn',
  ts,
  meta: { by },
});

describe('responder coordination', () => {
  it('the first responder leads and later ones join — nobody is overwritten', () => {
    const now = dayAt(0, 11.5);
    const signals: Signal[] = [
      ...dayOfSignals(-1),
      press(now - 3 * MIN),
      respond(now - 2 * MIN, 'nb_1', 'Meera next door', 4),
      respond(now - 1 * MIN, 'nb_2', 'Devi across the road'),
    ];
    const out = advanceState({ state: emptyState(now), risk: sosRisk, household: makeHousehold(), signals, nowTs: now });
    expect(out.state.tier).toBe(4);
    expect(out.state.sos.ack?.by).toBe('Meera next door');
    expect(out.state.sos.responders).toHaveLength(2);
    expect(out.state.sos.responders?.[0]).toMatchObject({ sourceId: 'nb_1', by: 'Meera next door', etaMin: 4, withdrawnTs: null });
    expect(out.state.sos.responders?.[1]).toMatchObject({ sourceId: 'nb_2', by: 'Devi across the road' });
    expect(out.state.status).toContain('Meera next door is responding (+1 helping)');
  });

  it('re-responding updates the eta but keeps the original join time', () => {
    const now = dayAt(0, 11.5);
    const signals: Signal[] = [
      press(now - 5 * MIN),
      respond(now - 4 * MIN, 'nb_1', 'Meera next door', 10),
      respond(now - MIN, 'nb_1', 'Meera next door', 2),
    ];
    const out = advanceState({ state: emptyState(now), risk: sosRisk, household: makeHousehold(), signals, nowTs: now });
    const meera = out.state.sos.responders?.[0];
    expect(meera?.respondedTs).toBe(now - 4 * MIN);
    expect(meera?.etaMin).toBe(2);
  });

  it('a withdrawal stands the responder down; the next in line becomes primary', () => {
    const now = dayAt(0, 11.5);
    const signals: Signal[] = [
      press(now - 4 * MIN),
      respond(now - 3 * MIN, 'nb_1', 'Meera next door'),
      respond(now - 2 * MIN, 'nb_2', 'Devi across the road'),
    ];
    const joined = advanceState({ state: emptyState(now), risk: sosRisk, household: makeHousehold(), signals, nowTs: now });
    const out = advanceState({
      state: joined.state,
      risk: sosRisk,
      household: makeHousehold(),
      signals: [...signals, standDown(now, 'nb_1', 'Meera next door')],
      nowTs: now + MIN,
    });
    expect(out.state.tier).toBe(4); // standing down is not standing the alarm down
    expect(out.state.sos.ack?.by).toBe('Devi across the road');
    expect(out.state.sos.responders?.[0]?.withdrawnTs).toBe(now);
    expect(out.state.sos.responders?.[1]?.withdrawnTs).toBeNull();
  });

  it('a withdrawn responder who re-responds rejoins the team', () => {
    const now = dayAt(0, 11.5);
    const signals: Signal[] = [
      press(now - 5 * MIN),
      respond(now - 4 * MIN, 'nb_1', 'Meera next door'),
      standDown(now - 2 * MIN, 'nb_1', 'Meera next door'),
      respond(now - MIN, 'nb_1', 'Meera next door'),
    ];
    const out = advanceState({ state: emptyState(now), risk: sosRisk, household: makeHousehold(), signals, nowTs: now });
    expect(out.state.sos.responders).toHaveLength(1);
    expect(out.state.sos.responders?.[0]?.withdrawnTs).toBeNull();
    expect(out.state.sos.ack?.by).toBe('Meera next door');
  });

  it('a responder to the previous sos does not ride in on a new press', () => {
    const now = dayAt(0, 11.5);
    const signals: Signal[] = [
      respond(now - 10 * MIN, 'nb_1', 'Meera next door'), // last emergency
      press(now - 2 * MIN),
    ];
    const out = advanceState({ state: emptyState(now), risk: sosRisk, household: makeHousehold(), signals, nowTs: now });
    expect(out.state.sos.responders).toEqual([]);
    expect(out.state.sos.ack).toBeNull();
  });

  it('pressing the button during the auto sos keeps the responder who was already moving', () => {
    const now = dayAt(0, 11.5);
    const prev = {
      ...emptyState(now),
      tier: 4 as const,
      sos: { active: true, origin: 'auto' as const, sinceTs: now - 6 * MIN, ack: null },
    };
    const signals: Signal[] = [
      press(now - 6 * MIN),
      respond(now - 5 * MIN, 'nb_1', 'Meera next door'),
      press(now - 2 * MIN), // the elder presses too — same emergency
    ];
    const out = advanceState({ state: prev, risk: unsettledRisk, household: makeHousehold(), signals, nowTs: now });
    expect(out.state.sos.origin).toBe('button');
    expect(out.state.sos.ack?.by).toBe('Meera next door');
  });
});

describe('no-response escalation', () => {
  it('each elapsed response window fires one escalation beat while nobody responds', () => {
    const t0 = dayAt(0, 11.5);
    const hh = makeHousehold();
    const raised = advanceState({
      state: emptyState(t0),
      risk: sosRisk,
      household: hh,
      signals: [press(t0)],
      nowTs: t0,
    });
    expect(raised.state.sos.unanswered).toMatchObject({ attempts: 0, windowMin: 5 });

    // 11 minutes later: two windows have passed with nobody responding.
    const now = t0 + 11 * MIN;
    const out = advanceState({
      state: raised.state,
      risk: sosRisk,
      household: hh,
      signals: [press(t0)],
      nowTs: now,
    });
    expect(out.state.tier).toBe(4);
    expect(out.state.sos.unanswered?.attempts).toBe(2);
    expect(out.state.sos.unanswered?.lastEscalationTs).toBe(t0 + 10 * MIN);
    const beats = out.events.filter((e) => e.type === 'sos' && e.from === 4 && e.to === 4);
    expect(beats).toHaveLength(1);
    expect(beats[0].meta).toContain('No one has responded');
    expect(beats[0].meta).toContain('attempt 2 of 3');
    expect(out.state.status).toContain('nobody has responded yet');
  });

  it('is idempotent: re-ticking the same instant repeats nothing, and beats cap at three', () => {
    const t0 = dayAt(0, 11.5);
    const hh = makeHousehold();
    const raised = advanceState({ state: emptyState(t0), risk: sosRisk, household: hh, signals: [press(t0)], nowTs: t0 });
    const now = t0 + 20 * MIN;
    const first = advanceState({ state: raised.state, risk: sosRisk, household: hh, signals: [press(t0)], nowTs: now });
    const again = advanceState({ state: first.state, risk: sosRisk, household: hh, signals: [press(t0)], nowTs: now });
    expect(again.events).toHaveLength(0);
    expect(first.state.sos.unanswered?.attempts).toBe(MAX_UNANSWERED_ESCALATIONS);
    expect(again.state.sos.unanswered?.attempts).toBe(MAX_UNANSWERED_ESCALATIONS);
  });

  it('a responder stops the escalation clock; the withdrawal that empties the team restarts it', () => {
    const t0 = dayAt(0, 11.5);
    const hh = makeHousehold();
    const raised = advanceState({ state: emptyState(t0), risk: sosRisk, household: hh, signals: [press(t0)], nowTs: t0 });
    const t1 = t0 + 7 * MIN; // one beat has fired by now
    const unanswered = advanceState({ state: raised.state, risk: sosRisk, household: hh, signals: [press(t0)], nowTs: t1 });
    expect(unanswered.state.sos.unanswered?.attempts).toBe(1);

    // Meera responds at t1 — the clock stops, no more beats.
    const withResponder = advanceState({
      state: unanswered.state,
      risk: sosRisk,
      household: hh,
      signals: [press(t0), respond(t1, 'nb_1', 'Meera next door')],
      nowTs: t1,
    });
    expect(withResponder.state.sos.unanswered).toBeNull();
    const t2 = t1 + 10 * MIN;
    const stillHer = advanceState({
      state: withResponder.state,
      risk: sosRisk,
      household: hh,
      signals: [press(t0), respond(t1, 'nb_1', 'Meera next door')],
      nowTs: t2,
    });
    expect(stillHer.state.sos.unanswered).toBeNull();
    expect(stillHer.events).toHaveLength(0);

    // She stands back down — the door is open again, the clock restarts
    // from the withdrawal, not from the original press.
    const withdrawn = advanceState({
      state: stillHer.state,
      risk: sosRisk,
      household: hh,
      signals: [press(t0), respond(t1, 'nb_1', 'Meera next door'), standDown(t2, 'nb_1', 'Meera next door')],
      nowTs: t2,
    });
    expect(withdrawn.state.sos.unanswered?.emptySinceTs).toBe(t2);
    expect(withdrawn.state.sos.unanswered?.attempts).toBe(0);
    const t3 = t2 + 6 * MIN;
    const nextBeat = advanceState({
      state: withdrawn.state,
      risk: sosRisk,
      household: hh,
      signals: [press(t0), respond(t1, 'nb_1', 'Meera next door'), standDown(t2, 'nb_1', 'Meera next door')],
      nowTs: t3,
    });
    expect(nextBeat.state.sos.unanswered?.attempts).toBe(1);
    expect(nextBeat.events.some((e) => e.type === 'sos' && e.meta?.includes('attempt 1'))).toBe(true);
  });

  it('the response window comes from the household config when set', () => {
    const t0 = dayAt(0, 11.5);
    const hh = makeHousehold({ neighbourRespondWindowMin: 2 });
    const raised = advanceState({ state: emptyState(t0), risk: sosRisk, household: hh, signals: [press(t0)], nowTs: t0 });
    const out = advanceState({ state: raised.state, risk: sosRisk, household: hh, signals: [press(t0)], nowTs: t0 + 3 * MIN });
    expect(out.state.sos.unanswered?.windowMin).toBe(2);
    expect(out.state.sos.unanswered?.attempts).toBe(1);
  });

  it('an unanswered auto sos escalates too, anchored to its own since', () => {
    const now = dayAt(0, 11.5);
    const since = now - 6 * MIN;
    const prevUnanswered: SosUnanswered = { attempts: 0, windowMin: 5, emptySinceTs: since, lastEscalationTs: null };
    const prev = {
      ...emptyState(now),
      tier: 4 as const,
      sos: { active: true, origin: 'auto' as const, sinceTs: since, ack: null, unanswered: prevUnanswered },
    };
    const out = advanceState({ state: prev, risk: unsettledRisk, household: makeHousehold(), signals: [], nowTs: now });
    expect(out.state.sos.unanswered?.attempts).toBe(1);
    expect(out.state.sos.unanswered?.emptySinceTs).toBe(since);
  });
});
