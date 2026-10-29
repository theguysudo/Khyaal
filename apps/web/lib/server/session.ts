import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Cookie sessions for the family (child) side, signed with HMAC-SHA256.
 * The secret comes from SESSION_SECRET or is auto-generated and persisted —
 * restarts keep sessions valid without any setup.
 */

const SECRET_FILE = path.join(process.cwd(), '.session-secret');

function getSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  try {
    const s = fs.readFileSync(SECRET_FILE, 'utf8').trim();
    if (s) return s;
  } catch {
    /* first boot */
  }
  const s = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, s);
  return s;
}

export interface SessionUser {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

export function signSession(user: SessionUser, days = 30): string {
  const exp = Date.now() + days * 86_400_000;
  const payload = Buffer.from(JSON.stringify({ ...user, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySession(token: string | undefined | null): SessionUser | null {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expect = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof data.sub !== 'string' || typeof data.exp !== 'number' || data.exp < Date.now()) return null;
    return { sub: data.sub, email: data.email, name: data.name, picture: data.picture };
  } catch {
    return null;
  }
}

export function sessionFromRequest(req: Request): SessionUser | null {
  const cookie = req.headers.get('cookie') ?? '';
  const m = cookie.match(/(?:^|;\s*)kh_session=([^;]+)/);
  return verifySession(m?.[1]);
}

export function sessionCookieHeader(token: string): string {
  return `kh_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}`;
}

export function clearSessionCookieHeader(): string {
  return 'kh_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
}

// --- Demo household access -------------------------------------------------
// The /demo console runs without a Google login: pair {action:'demo'} hands
// out a signed, household-bound cookie that authorizes exactly that one
// household (and nothing else) for a day. Judge-proof and isolated: a demo
// cookie for household A confers no power over household B.

export function signDemoAccess(householdId: string): string {
  const exp = Date.now() + 86_400_000;
  const payload = Buffer.from(JSON.stringify({ hh: householdId, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function demoAccessFromRequest(req: Request, householdId: string): boolean {
  const cookie = req.headers.get('cookie') ?? '';
  const token = cookie.match(/(?:^|;\s*)kh_demo=([^;]+)/)?.[1];
  if (!token) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expect = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.hh === householdId && typeof data.exp === 'number' && data.exp >= Date.now();
  } catch {
    return false;
  }
}

export function demoCookieHeader(householdId: string): string {
  return `kh_demo=${signDemoAccess(householdId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`;
}

// --- Neighbour access -------------------------------------------------------
// A neighbour pairs with the household's code and gets a signed,
// household+source-bound cookie — the same shape as the demo cookie, but it
// also names the neighbour source, so authz can check the source still
// exists (deleting the neighbour from the Sources card revokes the console
// immediately). The neighbour sees the one-bit status and answers an SOS;
// the cookie confers nothing else.

export function signNeighbourAccess(householdId: string, sourceId: string): string {
  const exp = Date.now() + 30 * 86_400_000;
  const payload = Buffer.from(JSON.stringify({ hh: householdId, src: sourceId, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function neighbourAccessFromRequest(
  req: Request,
  householdId: string,
): { sourceId: string } | null {
  const token = req.headers.get('cookie')?.match(/(?:^|;\s*)kh_neighbour=([^;]+)/)?.[1];
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expect = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.hh !== householdId || typeof data.src !== 'string' || typeof data.exp !== 'number' || data.exp < Date.now()) {
      return null;
    }
    return { sourceId: data.src };
  } catch {
    return null;
  }
}

export function neighbourCookieHeader(householdId: string, sourceId: string): string {
  return `kh_neighbour=${signNeighbourAccess(householdId, sourceId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}`;
}
