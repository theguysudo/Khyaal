import crypto from 'node:crypto';
import type { SessionUser } from '@/lib/server/session';

/**
 * One-time session transfer tokens. Google blocks OAuth redirect URIs with
 * IP addresses, so the phone never signs in with Google — instead, the
 * signed-in laptop mints a short-lived link the phone opens once, and the
 * session cookie rides across the LAN. The full profile rides along, so the
 * user row can be re-upserted on consume even if the store was restarted.
 */

const TOKEN_TTL_MS = 5 * 60_000;

interface TransferToken {
  user: SessionUser;
  exp: number;
  used: boolean;
}

const g = globalThis as unknown as { __khayaalTransfers?: Map<string, TransferToken> };

function map(): Map<string, TransferToken> {
  if (!g.__khayaalTransfers) g.__khayaalTransfers = new Map();
  return g.__khayaalTransfers;
}

export function mintTransferToken(user: SessionUser): string {
  const token = crypto.randomBytes(6).toString('hex'); // 12 chars, 5-min TTL
  map().set(token, { user, exp: Date.now() + TOKEN_TTL_MS, used: false });
  // opportunistic cleanup
  const now = Date.now();
  for (const [t, v] of map()) if (v.exp < now) map().delete(t);
  return token;
}

/** Burns the token and returns the profile it carried, once. */
export function consumeTransferToken(token: string): SessionUser | null {
  const entry = map().get(token);
  if (!entry || entry.used || entry.exp < Date.now()) return null;
  entry.used = true;
  return entry.user;
}
