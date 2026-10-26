import { NextResponse } from 'next/server';
import { randomId } from '@khayaal/engine';
import { getStore } from '@/lib/server/store';
import { rateLimit } from '@/lib/server/rate-limit';

/**
 * POST /api/v1/relay/pair { pairingCode } — bootstrap the USB relay into a
 * household it has never met.
 *
 * A fresh family's relay holds no credentials, so it cannot poll the device
 * channel and the dashboard's Connect button would stall. This endpoint lets
 * the relay register itself ONCE with the household's current pairing code
 * (the same gate as minting any source, and the code rotates on use). The
 * relay then holds its own source key and Connect is one click from then on.
 *
 * The relay is a device of the household — it runs on the family's own
 * laptop, talks only to this server, and is revoked with the source when
 * deleted. Rate-limited because it mints a key.
 */
export async function POST(req: Request) {
  if (!rateLimit(`relay-pair:${req.headers.get('x-forwarded-for') ?? 'local'}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* handled below */
  }
  const pairingCode = typeof body.pairingCode === 'string' ? body.pairingCode.trim() : null;
  if (!pairingCode) {
    return NextResponse.json({ error: 'pairingCode required' }, { status: 400 });
  }

  const store = getStore();
  const household = await store.getHouseholdByPairingCode(pairingCode);
  if (!household) {
    return NextResponse.json({ error: 'Unknown pairing code' }, { status: 403 });
  }

  const source = {
    id: `src_${randomId()}`,
    type: 'esp32' as const,
    label: 'USB relay (this laptop)',
    apiKey: `sk_${randomId()}${randomId()}`,
    createdAtTs: Date.now(),
    lastSeenTs: null,
  };
  await store.addSource(household.id, source);
  // One code, one use — same rotation rule as every other source mint.
  await store.updateHousehold(household.id, {
    pairingCode: String(Math.floor(100000 + Math.random() * 900000)),
  });

  return NextResponse.json({
    householdId: household.id,
    sourceId: source.id,
    apiKey: source.apiKey,
  });
}
