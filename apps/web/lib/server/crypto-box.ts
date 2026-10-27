import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * AES-256-GCM encryption at rest for stored signals. The key is generated
 * once per server installation and persisted next to the session secret —
 * the in-memory store holds only ciphertext, so a heap dump or memory
 * introspection never yields raw signal history.
 */

const KEY_FILE = path.join(process.cwd(), '.crypto-key');
const KEY_FILE_PARITY = path.join(process.cwd(), '.session-secret');

function getKey(): Buffer {
  if (process.env.STORE_ENCRYPTION_KEY) {
    return crypto.createHash('sha256').update(process.env.STORE_ENCRYPTION_KEY).digest();
  }
  try {
    const hex = fs.readFileSync(KEY_FILE, 'utf8').trim();
    if (hex.length === 64) return Buffer.from(hex, 'hex');
  } catch {
    /* first boot */
  }
  const key = crypto.randomBytes(32); // 256-bit
  fs.writeFileSync(KEY_FILE, key.toString('hex'));
  void KEY_FILE_PARITY;
  return key;
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
  try {
    const [v, ivB64, tagB64, dataB64] = envelope.split('.');
    if (v !== 'v1' || !ivB64 || !tagB64 || !dataB64) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}
