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
