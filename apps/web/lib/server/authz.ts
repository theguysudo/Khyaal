import crypto from 'node:crypto';

import type { Household, Source } from '@khayaal/shared';
import { demoAccessFromRequest, sessionFromRequest, type SessionUser } from './session';
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
 *
 * Device credentials are NOT all equal. The room sensor's key is typed into
 * the board over USB serial, lives in board memory and sits physically in
 * the elder's bedroom: it is the least-protected credential in the
 * deployment. It may report what it sees and receive its own device
 * commands — it may not file her check-in, silence the alert ladder, spend
 * the operator's LLM budget, register a push token or talk to the family.
 */

export type AccessLevel = 'family' | 'device' | 'none';

/**
 * What a credential may do inside a household.
 *
 *  - read     : the state bundle and the CSI stream
 *  - ingest   : post signals
 *  - control  : poll the device action queue / report Wi-Fi results
 *  - checkin  : file the "I'm OK" check-in
 *  - snooze   : silence the alert ladder
 *  - assistant: spend the operator's LLM budget
 *  - push     : register an FCM token (and receive the alerts sent to it)
 *  - talkback : open, answer, stream or end a talkback
 */
export type Scope =
  | 'read'
  | 'ingest'
  | 'control'
  | 'checkin'
  | 'snooze'
  | 'assistant'
  | 'push'
  | 'talkback';

const ALL_SCOPES: readonly Scope[] = [
  'read',
  'ingest',
  'control',
  'checkin',
  'snooze',
  'assistant',
  'push',
  'talkback',
];

/**
 * The privileges of each kind of device credential.
 *
 *  - phone     : the elder's own Android app. It legitimately checks in,
 *                snoozes, talks back, talks to the assistant and registers
 *                its own push token — it keeps every privilege.
 *  - simulator : the demo console's device. It keeps them too: the demo
 *                depends on a simulator behaving like the phone.
 *  - esp32     : the room sensor (and the USB relay that speaks for it).
 *                It reports presence/CSI and receives its own device
 *                commands, and nothing else.
 */
const SOURCE_SCOPES: Record<Source['type'], readonly Scope[]> = {
  phone: ALL_SCOPES,
  simulator: ALL_SCOPES,
  esp32: ['read', 'ingest', 'control'],
};

/** The scopes a device of this type holds. */
export function scopesForSource(type: Source['type']): readonly Scope[] {
  return SOURCE_SCOPES[type] ?? [];
}

export interface HouseholdAccess {
  level: AccessLevel;
  household: Household | null;
  session: SessionUser | null;
  /** The device credential that matched, when level === 'device'. */
  source: Source | null;
}

export function keysMatch(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export async function householdAccess(req: Request, householdId: string): Promise<HouseholdAccess> {
  const store = getStore();
  const household = await store.getHousehold(householdId);
  if (!household) return { level: 'none', household: null, session: null, source: null };

  // Device credentials first — they are the elder's own channel.
  const sourceId = req.headers.get('x-kh-source');
  const apiKey = req.headers.get('x-kh-key');
  if (sourceId && apiKey) {
    const src = await store.findSource(householdId, sourceId);
    if (src && keysMatch(src.apiKey, apiKey)) {
      return { level: 'device', household, session: null, source: src };
    }
  }

  const session = sessionFromRequest(req);
  if (session) {
    const user = await store.getUser(session.sub);
    if (user?.householdIds.includes(householdId) || household.ownerSubs?.includes(session.sub)) {
      return { level: 'family', household, session, source: null };
    }
  }

  // The /demo console: a signed, household-bound cookie handed out by
  // pair {action:'demo'} counts as family access for exactly that household.
  if (demoAccessFromRequest(req, householdId)) {
    return { level: 'family', household, session: null, source: null };
  }

  return { level: 'none', household, session: null, source: null };
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

/**
 * The access a caller has, if it holds the given scope. A family session
 * holds every scope; a device holds only what its type is allowed.
 *
 * A device that lacks the scope gets the same 404 as a stranger: the
 * surface never says "your key is real, but too weak for this".
 */
export async function scopedAccess(
  req: Request,
  householdId: string,
  scope: Scope,
): Promise<HouseholdAccess | Response> {
  const access = await householdAccess(req, householdId);
  if (access.level === 'family') return access;
  if (access.level === 'device' && access.source) {
    if (scopesForSource(access.source.type).includes(scope)) return access;
  }
  return unauthorized();
}

/** Either caller: read state, ack commands. */
export async function requireHouseholdMember(
  req: Request,
  householdId: string,
): Promise<Household | Response> {
  const access = await householdAccess(req, householdId);
  if (access.level !== 'none') return access.household!;
  return unauthorized();
}

/**
 * A household member that holds one specific privilege. The device routes
 * use this so that a room sensor cannot check in, snooze, spend LLM budget,
 * register a push token or talk back.
 */
export async function requireScoped(
  req: Request,
  householdId: string,
  scope: Scope,
): Promise<Household | Response> {
  const access = await scopedAccess(req, householdId, scope);
  if (access instanceof Response) return access;
  return access.household!;
}

/**
 * The device-control channel: the board polling its action queue, the USB
 * relay picking up Wi-Fi work and the one-click pairing request.
 *
 * These routes were never part of the existence-hiding 404 surface — they
 * answer 403 — so they keep that shape. The scope check is what matters
 * here: a room sensor (and the relay, which is a device of the household
 * too) may drive its own hardware, nothing else.
 */
export async function requireDeviceControl(
  req: Request,
  householdId: string,
): Promise<Source | Response> {
  const access = await householdAccess(req, householdId);
  if (access.level !== 'device' || !access.source) {
    return json(403, 'Unknown source');
  }
  if (!scopesForSource(access.source.type).includes('control')) {
    return json(403, 'Unknown source');
  }
  return access.source;
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
    if (ok) return household;
  }
  return unauthorized();
}
