import { NextResponse } from 'next/server';
import { getRelayRegistration, relayTokenMatches } from '@/lib/server/relay';
import { rateLimit } from '@/lib/server/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/relay/claim — the USB relay's bootstrap.
 *
 * The relay needs a device credential to poll the dashboard's action queue,
 * but credentials live in the server's memory and die on every restart. The
 * old remedy was a pairing code typed into a terminal by hand.
 *
 * This endpoint replaces that. It is authenticated by the relay's own local
 * token (a 0600 file next to the bridge script — the server creates it on
 * first use), and it only ever returns the identity that a family member
 * explicitly asked for by pressing "Connect room sensor" on THIS server.
 *
 * The token therefore proves exactly one thing: "I am the relay running on
 * the laptop that serves this dashboard." It cannot read a household, mint a
 * key, or move an alert — a claim only succeeds for a registration that the
 * family already approved.
 */
export async function POST(req: Request) {
  if (
    !rateLimit(`relay-claim:${req.headers.get('x-forwarded-for') ?? 'local'}`, 30, 60_000)
  ) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }

  const token = req.headers.get('x-kh-relay-token');
  if (!relayTokenMatches(token)) {
    // 403, not 404: a wrong token is a wrong credential, and saying so
    // helps the operator without confirming anything about a household.
    return NextResponse.json({ error: 'Unknown relay token' }, { status: 403 });
  }

  const registration = getRelayRegistration();
  if (!registration) {
    return NextResponse.json({ registration: null }, { headers: { 'Cache-Control': 'no-store' } });
  }

  return NextResponse.json(
    { registration },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
