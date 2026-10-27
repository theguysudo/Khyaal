import { NextResponse } from 'next/server';
import { parseIngest } from '@khayaal/shared';
import { ingestSignal, INGEST_FORBIDDEN } from '@/lib/server/runtime';
import { getStore } from '@/lib/server/store';
import { rateLimit } from '@/lib/server/rate-limit';
import { keysMatch } from '@/lib/server/authz';
import { decryptIngest, isEncryptedEnvelope } from '@/lib/server/tunnel-crypto';

/**
 * POST /api/v1/ingest
 * { householdId, sourceId, type, value, ts?, apiKey? }
 * — or the AES-256-GCM encrypted form (lib/server/tunnel-crypto.ts):
 * { householdId, sourceId, enc:"v1", iv, tag, ct }  (no plaintext fields)
 * The one endpoint every source speaks — her phone, the ESP32 room sensor,
 * the bridge. Auth: source must be paired; the per-source key when provided
 * is verified, and it is also the HKDF root for the encrypted envelope.
 * Rate-limited: 120 requests / minute / IP (devices batch, that's ample),
 * with a global ceiling of 8x that (see rate-limit.ts).
 */

/** No ingest body may be bigger than this. A device sends a few hundred bytes. */
const MAX_BODY_BYTES = 256 * 1024;

export async function POST(req: Request) {
  if (
    !rateLimit(`ingest:${req.headers.get('x-forwarded-for') ?? 'local'}`, 120, 60_000, {
      globalMultiplier: 8,
    })
  ) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }

  // Size first, parse second. A 20 MB body is rejected on its declared
  // length (or, for a chunked upload, on its real length) before JSON.parse
  // ever sees it — the value-length cap in parseIngest is the second line
  // of defence, not the first.
  const declared = Number(req.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Body too large' }, { status: 413 });
  }
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Body too large' }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
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
  const encrypted = isEncryptedEnvelope(b);
  if (!source) {
    // One generic refusal for every "no such device" answer. The route used
    // to say "Unknown source — pair this device first" for an unknown id and
    // "Bad source key" for a known one, which made it an oracle for
    // enumerating source ids. An encrypted envelope gets the same answer a
    // broken envelope gets, so the id cannot be probed that way either.
    if (encrypted) {
      return NextResponse.json(
        { error: 'Encrypted envelope rejected (bad-envelope)' },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: INGEST_FORBIDDEN }, { status: 403 });
  }

  let signalBody = b;
  let apiKey: string;
  if (encrypted) {
    // Encrypted envelopes already prove possession of the key: the GCM tag
    // only verifies under the HKDF-derived key.
    const key = typeof b.apiKey === 'string' && b.apiKey ? b.apiKey : source.apiKey;
    const dec = decryptIngest(b, key, householdId, sourceId);
    if (!dec.ok) {
      const status = dec.error === 'replayed' ? 409 : 400;
      return NextResponse.json({ error: `Encrypted envelope rejected (${dec.error})` }, { status });
    }
    signalBody = { householdId, sourceId, ...dec.payload };
    apiKey = source.apiKey;
  } else {
    // Plaintext must present the key. The credential is checked BEFORE the
    // body is parsed as a signal, so a malformed payload cannot be used to
    // tell a known source id from an unknown one.
    const presented = typeof b.apiKey === 'string' ? b.apiKey : '';
    if (!presented || !keysMatch(source.apiKey, presented)) {
      return NextResponse.json({ error: INGEST_FORBIDDEN }, { status: 403 });
    }
    apiKey = presented;
  }

  const signal = parseIngest(signalBody);
  if (!signal) return NextResponse.json({ error: 'Invalid signal' }, { status: 400 });

  const result = await ingestSignal(householdId, signal, apiKey);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 });
  return NextResponse.json({ ok: true });
}
