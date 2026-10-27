import crypto from 'node:crypto';

import type { Household } from '@khayaal/shared';
import { sessionFromRequest, type SessionUser } from './session';
import { getStore } from './store';

/**
 * Household-scoped authorization. Two legitimate callers exist:
 *
 *  - the family (dashboard): HMAC-signed session cookie whose subject is
 *    linked to the household (owner or care-circle member who claimed it);
 *  - her devices (the elder's phone, the ESP32 sensor): a source credential
 *    pair `x-kh-source` + `x-kh-key` issued at pairing time, compared in
 *    constant time.
 *
 * Every household route must call one of the guards below — the pen-test
 * (apps/web/scripts/pentest.sh) asserts they do.
 */

export type AccessLevel = 'family' | 'device' | 'none';

export interface HouseholdAccess {
  level: AccessLevel;
  household: Household | null;
  session: SessionUser | null;
}

function keysMatch(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export async function householdAccess(req: Request, householdId: string): Promise<HouseholdAccess> {
  const store = getStore();
  const household = await store.getHousehold(householdId);
  if (!household) return { level: 'none', household: null, session: null };

  // Device credentials first — they are the elder's own channel.
  const sourceId = req.headers.get('x-kh-source');
  const apiKey = req.headers.get('x-kh-key');
  if (sourceId && apiKey) {
    const src = await store.findSource(householdId, sourceId);
    if (src && keysMatch(src.apiKey, apiKey)) {
      return { level: 'device', household, session: null };
    }
  }

  const session = sessionFromRequest(req);
  if (session) {
    const user = await store.getUser(session.sub);
    if (user?.householdIds.includes(householdId) || household.ownerSubs?.includes(session.sub)) {
      return { level: 'family', household, session };
    }
  }

  return { level: 'none', household, session };
}

const json = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** 404 (not 401/403) for unknown or unauthorised ids — never confirm existence. */
export function unauthorized(): Response {
  return json(404, 'Household not found');
}

/**
 * Family-only actions: send commands, manage circle, reconfigure, demo-warp,
 * create/delete sources, run analysis, acknowledge an alert.
 */
export async function requireFamily(req: Request, householdId: string): Promise<Household | Response> {
  const access = await householdAccess(req, householdId);
  if (access.level === 'family') return access.household!;
  return unauthorized();
}

/** Either caller: read state, check in, snooze, ack commands, register FCM. */
export async function requireHouseholdMember(
  req: Request,
  householdId: string,
): Promise<Household | Response> {
  const access = await householdAccess(req, householdId);
  if (access.level !== 'none') return access.household!;
  return unauthorized();
}

/**
 * Source creation is the one route that hands out an API key, so besides a
 * family session it accepts the household's *current pairing code* — exactly
 * what a pairing phone holds. The code is rotated after a successful use so
 * a captured request cannot mint more keys.
 */
export async function requireSourceCreator(
  req: Request,
  householdId: string,
  pairingCode: string | null,
): Promise<Household | Response> {
  const store = getStore();
  const household = await store.getHousehold(householdId);
  if (!household) return unauthorized();

  const access = await householdAccess(req, householdId);
  if (access.level === 'family') return household;

  if (pairingCode) {
    const ok = keysMatch(household.pairingCode, pairingCode);
    if (ok) {
      // One pairing, one key mint: rotate immediately.
      const { makePairingCode } = await import('@/lib/server/runtime');
      await store.updateHousehold(householdId, { pairingCode: makePairingCode() });
      return household;
    }
  }
  return unauthorized();
}
