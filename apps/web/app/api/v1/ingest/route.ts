import { NextResponse } from 'next/server';
import { parseIngest } from '@khayaal/shared';
import { ingestSignal } from '@/lib/server/runtime';
import { getStore } from '@/lib/server/store';
import { rateLimit } from '@/lib/server/rate-limit';
import { decryptIngest, isEncryptedEnvelope } from '@/lib/server/tunnel-crypto';

/**
 * POST /api/v1/ingest
 * { householdId, sourceId, type, value, ts?, apiKey? }
 * — or the AES-256-GCM encrypted form (lib/server/tunnel-crypto.ts):
 * { householdId, sourceId, enc:"v1", iv, tag, ct }  (no plaintext fields)
 * The one endpoint every source speaks — her phone, the ESP32 room sensor,
 * the bridge. Auth: source must be paired; the per-source key when provided
 * is verified, and it is also the HKDF root for the encrypted envelope.
 * Rate-limited: 120 requests / minute / IP (devices batch, that's ample).
 */
export async function POST(req: Request) {
  if (!rateLimit(`ingest:${req.headers.get('x-forwarded-for') ?? 'local'}`, 120, 60_000)) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const householdId = typeof b.householdId === 'string' ? b.householdId : null;
  const sourceId = typeof b.sourceId === 'string' ? b.sourceId : null;
  if (!householdId || !sourceId) {
    return NextResponse.json({ error: 'householdId and sourceId required' }, { status: 400 });
  }

  const source = await getStore().findSource(householdId, sourceId);
  if (!source) return NextResponse.json({ error: 'Unknown source — pair this device first' }, { status: 403 });

  let signalBody = b;
  if (isEncryptedEnvelope(b)) {
    const apiKey = typeof b.apiKey === 'string' && b.apiKey ? b.apiKey : source.apiKey;
    const dec = decryptIngest(b, apiKey, householdId, sourceId);
    if (!dec.ok) {
      const status = dec.error === 'replayed' ? 409 : 400;
      return NextResponse.json({ error: `Encrypted envelope rejected (${dec.error})` }, { status });
    }
    signalBody = { householdId, sourceId, ...dec.payload };
  }

  const signal = parseIngest(signalBody);
  if (!signal) return NextResponse.json({ error: 'Invalid signal' }, { status: 400 });

  // Encrypted envelopes already proved possession of the key (the GCM tag
  // only verifies under the HKDF-derived key). Plaintext must present it.
  const apiKey = isEncryptedEnvelope(b)
    ? source.apiKey
    : typeof signalBody.apiKey === 'string' && signalBody.apiKey
      ? signalBody.apiKey
      : undefined;
  if (!apiKey) {
    return NextResponse.json({ error: 'API key required — pair this source first' }, { status: 403 });
  }
  const result = await ingestSignal(householdId, signal, apiKey);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 });
  return NextResponse.json({ ok: true });
}
