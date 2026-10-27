import crypto from 'node:crypto';

/**
 * AES-256-GCM encryption for the communication tunnel (bridge → backend, and
 * the ESP32's LAN mode). The key is never on the wire: both ends derive it
 * from the source's own API key with HKDF-SHA256 (salt "khayaal-tunnel-v1",
 * info "khayaal/ingest"), so capturing traffic reveals nothing but identities
 * (householdId / sourceId) and opaque ciphertext.
 *
 * Envelope (JSON):
 *   { enc: "v1", iv: <b64>, tag: <b64>, ct: <b64> }
 * with AES-256-GCM and additional authenticated data
 *   `${householdId}|${sourceId}`
 * binding every ciphertext to its identity — a recorded envelope cannot be
 * replayed into another household or under another source.
 *
 * Replay protection: the server remembers (sourceId, iv) pairs for an hour;
 * a repeat is rejected.
 */

const HKDF_SALT = 'khayaal-tunnel-v1';
const HKDF_INFO = 'khayaal/ingest';
const IV_LEN = 12;
const REPLAY_TTL_MS = 60 * 60_000;
const REPLAY_MAX = 4096;

const keyCache = new Map<string, Buffer>();

export function tunnelKey(apiKey: string): Buffer {
  const hit = keyCache.get(apiKey);
  if (hit) return hit;
  const key = crypto.hkdfSync(
    'sha256',
    Buffer.from(apiKey, 'utf8'),
    Buffer.from(HKDF_SALT, 'utf8'),
    Buffer.from(HKDF_INFO, 'utf8'),
    32,
  );
  const buf = Buffer.from(key);
  if (keyCache.size > 256) keyCache.clear();
  keyCache.set(apiKey, buf);
  return buf;
}

export function isEncryptedEnvelope(b: Record<string, unknown>): boolean {
  return typeof b.enc === 'string' && b.enc === 'v1';
}

const seen = new Map<string, number>();

function ivSeenBefore(sourceId: string, ivB64: string): boolean {
  const key = `${sourceId}:${ivB64}`;
  const now = Date.now();
  for (const [k, ts] of seen) if (now - ts > REPLAY_TTL_MS) seen.delete(k);
  if (seen.has(key)) return true;
  if (seen.size >= REPLAY_MAX) seen.clear();
  seen.set(key, now);
  return false;
}

export interface TunnelDecryptResult {
  ok: boolean;
  payload?: Record<string, unknown>;
  error?: 'bad-envelope' | 'tampered' | 'replayed';
}

/**
 * Decrypt an ingest envelope under the source's key. AAD binds the ciphertext
 * to householdId + sourceId; a wrong key, wrong identity, or tampered byte
 * fails the GCM tag.
 */
export function decryptIngest(
  envelope: Record<string, unknown>,
  apiKey: string,
  householdId: string,
  sourceId: string,
): TunnelDecryptResult {
  const ivB64 = typeof envelope.iv === 'string' ? envelope.iv : '';
  const tagB64 = typeof envelope.tag === 'string' ? envelope.tag : '';
  const ctB64 = typeof envelope.ct === 'string' ? envelope.ct : '';
  if (!ivB64 || !tagB64 || !ctB64) return { ok: false, error: 'bad-envelope' };

  let iv: Buffer;
  let tag: Buffer;
  let ct: Buffer;
  try {
    iv = Buffer.from(ivB64, 'base64');
    tag = Buffer.from(tagB64, 'base64');
    ct = Buffer.from(ctB64, 'base64');
  } catch {
    return { ok: false, error: 'bad-envelope' };
  }
  if (iv.length !== IV_LEN || tag.length !== 16 || ct.length === 0 || ct.length > 8192) {
    return { ok: false, error: 'bad-envelope' };
  }

  const replayKey = `${sourceId}:${ivB64}`;
  if (ivSeenBefore(sourceId, ivB64)) {
    void replayKey;
    return { ok: false, error: 'replayed' };
  }

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', tunnelKey(apiKey), iv);
    decipher.setAAD(Buffer.from(`${householdId}|${sourceId}`, 'utf8'));
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
    const payload = JSON.parse(plain.toString('utf8'));
    if (payload === null || typeof payload !== 'object') return { ok: false, error: 'bad-envelope' };
    return { ok: true, payload: payload as Record<string, unknown> };
  } catch {
    return { ok: false, error: 'tampered' };
  }
}
