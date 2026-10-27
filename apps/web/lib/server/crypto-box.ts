import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * AES-256-GCM encryption at rest for stored signals and talkback audio. The
 * key is generated once per server installation and persisted next to the
 * session secret — the in-memory store holds only ciphertext, so a heap dump
 * or memory introspection never yields raw signal history.
 *
 * Three rules make the key survivable:
 *
 *  1. The committed key is burned. `apps/web/.crypto-key` was tracked in git
 *     once, so every clone of this repository shared one encryption key. A
 *     key that still equals that value is replaced on the next start — and
 *     never in the log. The operator's own `STORE_ENCRYPTION_KEY` is always
 *     honoured and is never rotated away.
 *  2. The key lives in two files. Losing one copy no longer orphans the
 *     store: the other copy is read and the missing one is written back.
 *  3. A key that cannot be persisted is a hard error. Continuing with an
 *     ephemeral key would quietly orphan every stored envelope on the next
 *     restart.
 *
 * The parity copy deliberately does NOT live in `.session-secret`: that file
 * is the HMAC secret for family session cookies (see session.ts). Writing
 * the encryption key into it would invalidate every signed-in session, and
 * the two secrets would overwrite each other on a fresh install.
 */

const KEY_FILE = path.join(process.cwd(), '.crypto-key');
const KEY_FILE_PARITY = path.join(process.cwd(), '.crypto-key.parity');

/**
 * The key that was committed to git (apps/web/.crypto-key). It is burned,
 * not secret: it is written here on purpose, so that every deployment can
 * recognise it and move off it. It is NOT a valid key any more.
 */
const BURNED_KEY_HEX = 'e7362545e7b93d5d94beedf4426744f505e1b89e4d100cfbc4b8aa6525d2a56e';

/** The cached key for this process. */
let cachedKey: Buffer | null = null;

function isBurned(key: Buffer): boolean {
  return key.toString('hex') === BURNED_KEY_HEX;
}

/**
 * Mirrors `firestoreConfigured()` in ./firestore.ts — kept local so that
 * crypto-box stays free of imports (firestore.ts imports crypto-box, and a
 * cycle in the key path is not a risk worth taking).
 */
function persistentStoreConfigured(): boolean {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return true;
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY,
  );
}

/** Reads a 32-byte key from disk; null when the file is missing or unusable. */
function readKeyFile(file: string): Buffer | null {
  try {
    const hex = fs.readFileSync(file, 'utf8').trim();
    if (/^[0-9a-f]{64}$/i.test(hex)) return Buffer.from(hex, 'hex');
  } catch {
    /* not there */
  }
  return null;
}

/**
 * Writes a key to disk, owner-read-only. Throws with a clear message: a key
 * that cannot be persisted must stop the server, not disappear with the
 * process.
 */
function writeKeyFile(file: string, key: Buffer): void {
  try {
    fs.writeFileSync(file, key.toString('hex'), { mode: 0o600 });
    try {
      fs.chmodSync(file, 0o600);
    } catch {
      /* best effort — some filesystems refuse chmod */
    }
  } catch (err) {
    throw new Error(
      `[khayaal] cannot persist the store encryption key to ${file}: ${(err as Error).message}. ` +
        'The store encryption key must be writable (or STORE_ENCRYPTION_KEY must be set); ' +
        'continuing with an ephemeral key would orphan every stored envelope on the next restart.',
    );
  }
}

/**
 * Resolves the key from disk, rotating the burned one and keeping both
 * copies in step. Runs once per process, before the first encrypt/decrypt.
 */
function loadOrCreateKey(): Buffer {
  const primary = readKeyFile(KEY_FILE);
  const parity = readKeyFile(KEY_FILE_PARITY);

  let key: Buffer | null = null;
  if (primary && parity && primary.equals(parity)) {
    key = primary;
  } else if (primary && parity) {
    // The copies disagree. Prefer the primary copy — unless it is the burned
    // one, in which case the parity copy is the only key that can still
    // decrypt anything, so it wins and the primary is re-synced from it.
    if (isBurned(primary) && !isBurned(parity)) {
      key = parity;
      console.warn(
        '[khayaal] .crypto-key held the key that was committed to git; the parity copy ' +
          'has been restored over it and the store keeps its existing key.',
      );
    } else {
      key = primary;
      console.warn(
        '[khayaal] the two encryption-key copies disagreed; the .crypto-key copy wins ' +
          'and the parity copy has been re-synced.',
      );
    }
  } else if (primary) {
    key = primary;
  } else if (parity) {
    key = parity;
    console.warn(
      '[khayaal] .crypto-key was missing; the key has been restored from its parity copy.',
    );
  }

  if (key && isBurned(key)) {
    if (persistentStoreConfigured()) {
      // Rotating here would orphan every stored row, because the persistent
      // store is encrypted with the key that is about to be thrown away. The
      // operator has to rotate it deliberately (and re-encrypt the rows).
      console.warn(
        '[khayaal] WARNING: the file-based store encryption key is the key that was ' +
          'committed to git, and a persistent store (Firestore) is configured. It was NOT ' +
          'rotated automatically, because that would orphan every stored row. Rotate it ' +
          'deliberately, or set STORE_ENCRYPTION_KEY.',
      );
    } else {
      console.warn(
        '[khayaal] WARNING: the store encryption key was the key that was committed to ' +
          'git. It has been replaced with a freshly generated one (the key itself is ' +
          'never logged).',
      );
      key = crypto.randomBytes(32);
    }
  }

  if (!key) {
    console.warn('[khayaal] no store encryption key found; generating a new one.');
    key = crypto.randomBytes(32);
  }

  // The primary copy must be persisted: an ephemeral key would orphan every
  // stored envelope on the next restart, so a failure here is fatal.
  if (!primary || !primary.equals(key)) writeKeyFile(KEY_FILE, key);
  // The parity copy is best-effort — the key is already safe in the primary.
  if (!parity || !parity.equals(key)) {
    try {
      writeKeyFile(KEY_FILE_PARITY, key);
    } catch (err) {
      console.warn(`[khayaal] could not write the parity key copy: ${(err as Error).message}`);
    }
  }
  return key;
}

function getKey(): Buffer {
  // The operator's own key wins over both files, and is never rotated: they
  // chose it deliberately.
  const fromEnv = process.env.STORE_ENCRYPTION_KEY;
  if (fromEnv) {
    if (!cachedKey) {
      cachedKey = crypto.createHash('sha256').update(fromEnv).digest();
    }
    return cachedKey;
  }
  if (!cachedKey) cachedKey = loadOrCreateKey();
  return cachedKey;
}

/** Encrypt a UTF-8 payload → "v1.<iv-b64>.<tag-b64>.<data-b64>". */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64')}.${tag.toString('base64')}.${data.toString('base64')}`;
}

/** Decrypt a "v1.<iv>.<tag>.<data>" envelope; returns null on any tamper. */
export function decrypt(envelope: string): string | null {
  // The key is resolved OUTSIDE the try: a key that cannot be read or
  // persisted is a hard failure and must not be swallowed into "tampered".
  const key = getKey();
  try {
    const [v, ivB64, tagB64, dataB64] = envelope.split('.');
    if (v !== 'v1' || !ivB64 || !tagB64 || !dataB64) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}
