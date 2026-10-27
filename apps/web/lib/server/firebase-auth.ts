import crypto from 'node:crypto';

/**
 * Minimal service-account OAuth2 for Google REST APIs (Firestore, FCM share
 * the same flow). Tokens are minted on demand and cached in-process until a
 * minute before expiry. No SDK dependency — the same trick notify.ts uses
 * for FCM, factored out so the Firestore adapter can reuse it.
 */

const cache = new Map<string, { token: string; expTs: number }>();

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

export async function firebaseAccessToken(
  clientEmail: string,
  privateKey: string,
  scope: string,
): Promise<string> {
  const key = `${clientEmail}:${scope}`;
  const hit = cache.get(key);
  if (hit && hit.expTs > Date.now() + 60_000) return hit.token;

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: clientEmail,
      scope,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(privateKey).toString('base64url');
  const assertion = `${header}.${claims}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`firebase token: ${res.status} ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  const token = json.access_token;
  cache.set(key, { token, expTs: Date.now() + json.expires_in * 1000 });
  return token;
}
