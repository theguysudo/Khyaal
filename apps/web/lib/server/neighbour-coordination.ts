import type { SosState } from '@khayaal/shared';
import { MAX_UNANSWERED_ESCALATIONS } from '@khayaal/engine';

/**
 * Neighbour-facing projections of the SOS coordination state.
 *
 * The engine (packages/engine/escalation.ts) derives the responder team and
 * the unanswered-escalation countdown from signals; these helpers shape that
 * state for the neighbour console. The neighbour surface stays one-bit: who
 * is responding, whether it is me, and how long until the family is told
 * nobody is coming. Source ids stay inside the family's own bundle — a
 * neighbour never learns another responder's credential identity.
 */

export interface NeighbourResponder {
  by: string;
  respondedTs: number;
  etaMin: number | null;
  withdrawnTs: number | null;
}

export function publicResponders(sos: SosState): NeighbourResponder[] {
  return (sos.responders ?? []).map(({ sourceId: _sourceId, ...r }) => r);
}

export interface NeighbourMe {
  responding: boolean;
  isPrimary: boolean;
  respondedTs: number | null;
  etaMin: number | null;
}

/** This neighbour's own place in the responder team, by their source id. */
export function neighbourMe(sos: SosState, mySourceId: string): NeighbourMe {
  const mine = (sos.responders ?? []).find((r) => r.sourceId === mySourceId);
  if (!mine || mine.withdrawnTs !== null) {
    return { responding: false, isPrimary: false, respondedTs: null, etaMin: null };
  }
  const firstActive = (sos.responders ?? []).find((r) => r.withdrawnTs === null);
  return {
    responding: true,
    isPrimary: firstActive?.sourceId === mySourceId,
    respondedTs: mine.respondedTs,
    etaMin: mine.etaMin,
  };
}

export interface NeighbourEscalation {
  /** True while the sos is active with nobody responding. */
  unanswered: boolean;
  /** Escalation beats fired so far (capped — see the engine constant). */
  attempts: number;
  /** The response window in minutes. */
  windowMin: number;
  /** Ms until the next escalation beat — null once capped or answered. */
  nextBeatInMs: number | null;
}

export function neighbourEscalation(sos: SosState, nowSimTs: number): NeighbourEscalation {
  const un = sos.unanswered;
  if (!sos.active || !un) {
    return { unanswered: false, attempts: 0, windowMin: 0, nextBeatInMs: null };
  }
  const windowMs = un.windowMin * 60_000;
  const capped = un.attempts >= MAX_UNANSWERED_ESCALATIONS;
  const nextBeatTs = un.emptySinceTs + (un.attempts + 1) * windowMs;
  return {
    unanswered: true,
    attempts: un.attempts,
    windowMin: un.windowMin,
    nextBeatInMs: capped ? null : Math.max(0, nextBeatTs - nowSimTs),
  };
}
