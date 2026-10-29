import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The USB relay's bootstrap channel.
 *
 * The relay lives on the family's own laptop and reaches the server over
 * USB serial. It needs a device credential to poll the dashboard's action
 * queue — but that credential dies every time the server restarts, because
 * households and sources live in memory. The old remedy was for the family
 * to copy a rotating pairing code into a terminal. That is not a product.
 *
 * So the relay gets its own durable, local credential instead: a random
 * token in a 0600 file next to the bridge script. The token proves "I am the
 * relay on this laptop" and nothing else — it cannot read a household, mint
 * a key or move an alert. What it can do is CLAIM the identity that a family
 * member explicitly asked for by pressing Connect on this server. No code is
 * typed, and a restarted server heals itself on the next poll.
 *
 * The file lives beside the bridge script because that is the one place both
 * sides can agree on without configuration: the server walks up from its own
 * working directory to find the repo, the bridge knows its own path.
 */

/** Where the bridge script lives, and therefore where the token goes. */
function tunnelDir(): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'firmware', 'tunnel');
    if (fs.existsSync(path.join(candidate, 'khayaal_serial_bridge.py'))) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export const RELAY_TOKEN_FILE = tunnelDir()
  ? path.join(tunnelDir()!, 'relay-token')
  : null;

/** How long a parked Connect request stays claimable. */
export const RELAY_PENDING_TTL_MS = 5 * 60_000;

export interface RelayRegistration {
  householdId: string;
  sourceId: string;
  apiKey: string;
  ts: number;
}

/**
 * The one pending registration on this server. A laptop has one USB relay,
 * so one slot is right — and the family pressing Connect is what fills it.
 */
const g = globalThis as unknown as { __khayaalRelayPending?: RelayRegistration | null };

function pendingSlot(): RelayRegistration | null {
  if (g.__khayaalRelayPending === undefined) g.__khayaalRelayPending = null;
  return g.__khayaalRelayPending;
}

/** Park an identity for the local relay to claim. */
export function parkRelayRegistration(reg: RelayRegistration): void {
  g.__khayaalRelayPending = reg;
}

/** The pending registration, if it is still fresh. */
export function getRelayRegistration(): RelayRegistration | null {
  const reg = pendingSlot();
  if (!reg) return null;
  if (Date.now() - reg.ts > RELAY_PENDING_TTL_MS) {
    g.__khayaalRelayPending = null;
    return null;
  }
  return reg;
}

/**
 * The local relay token: 32 random bytes, 0600, created on first use.
 *
 * The same secret-then-persist pattern as the session secret. If the file
 * cannot be written (a deployed server with no repo on disk), there is no
 * token and the relay simply falls back to its stored credentials.
 */
export function getRelayToken(): string | null {
  if (!RELAY_TOKEN_FILE) return null;
  try {
    const existing = fs.readFileSync(RELAY_TOKEN_FILE, 'utf8').trim();
    if (existing) return existing;
  } catch {
    /* first boot */
  }
  const token = crypto.randomBytes(32).toString('hex');
  try {
    fs.writeFileSync(RELAY_TOKEN_FILE, token + '\n', { mode: 0o600 });
    fs.chmodSync(RELAY_TOKEN_FILE, 0o600);
    return token;
  } catch {
    return null;
  }
}

/** Constant-time comparison, so a wrong token leaks nothing by timing. */
export function relayTokenMatches(candidate: string | null): boolean {
  const expected = getRelayToken();
  if (!expected || !candidate) return false;
  const a = crypto.createHash('sha256').update(candidate).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}
