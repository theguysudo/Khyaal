import { NextResponse } from 'next/server';
import { randomId } from '@khayaal/engine';
import { getStore } from '@/lib/server/store';
import { rateLimit } from '@/lib/server/rate-limit';
import { neighbourCookieHeader } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/neighbour/pair — a neighbour joins with the household's code.
 *
 * The neighbour is a device of the household with the narrowest privileges
 * that still make them useful: see the one-bit status, answer an SOS. They
 * are added to the care circle as role 'neighbor' (so the family sees them
 * in the call chain) and a neighbour source is minted — deleting it from the
 * Sources card revokes their console immediately.
 *
 * Rate-limited hard: this endpoint mints a key from a 6-digit code.
 */
export async function POST(req: Request) {
  if (!rateLimit(`neighbour-pair:${req.headers.get('x-forwarded-for') ?? 'local'}`, 5, 60_000)) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const code = typeof body.pairingCode === 'string' ? body.pairingCode.trim() : '';
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 60) : '';
  if (!code) return NextResponse.json({ error: 'pairingCode required' }, { status: 400 });

  const store = getStore();
  const household = await store.getHouseholdByPairingCode(code);
  if (!household) return NextResponse.json({ error: 'Unknown pairing code' }, { status: 403 });

  const source = {
    id: `src_${randomId()}`,
    type: 'neighbour' as const,
    label: name ? `Neighbour · ${name}` : 'Neighbour',
    apiKey: `sk_${randomId()}${randomId()}`,
    createdAtTs: Date.now(),
    lastSeenTs: null,
  };
  await store.addSource(household.id, source);
  await store.updateHousehold(household.id, {
    careCircle: [
      ...(household.careCircle ?? []),
      { name: name || 'Neighbour', email: `neighbour-${source.id}@khayaal.local`, role: 'neighbor', addedTs: Date.now() },
    ],
  });

  const res = NextResponse.json({
    householdId: household.id,
    householdName: `${household.parentName}'s home`,
    sourceId: source.id,
  });
  res.headers.append('Set-Cookie', neighbourCookieHeader(household.id, source.id));
  return res;
}
