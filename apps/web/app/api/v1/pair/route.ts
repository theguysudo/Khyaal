import { NextResponse } from 'next/server';
import { createHousehold, ensureDemoHousehold } from '@/lib/server/runtime';
import { getStore } from '@/lib/server/store';
import { demoCookieHeader, sessionFromRequest } from '@/lib/server/session';
import { rateLimit } from '@/lib/server/rate-limit';

/**
 * POST /api/v1/pair
 *  { action: 'create', ... }   — family creation, requires a Google session
 *                                (OAuth-first; the family stays with the account)
 *  { action: 'join',   code }  — a parent device pairing in
 *  { action: 'demo' }          — demo quick-start (household-bound cookie)
 */
export async function POST(req: Request) {
  if (!rateLimit(`pair:${req.headers.get('x-forwarded-for') ?? 'local'}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }
  const store = getStore();
  const session = sessionFromRequest(req);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const action = body.action;

  if (action === 'create') {
    // OAuth-first: a family always belongs to a Google account, so a
    // returning sign-in lands straight back in it. No anonymous creation.
    if (!session) {
      return NextResponse.json(
        { error: 'Sign in with Google first, then create your family.' },
        { status: 401 },
      );
    }
    const hh = await createHousehold({
      parentName: String(body.parentName ?? ''),
      childName: String(body.childName ?? ''),
      wakeHour: num(body.wakeHour),
      chargeStartHour: num(body.chargeStartHour),
      quietStart: num(body.quietStart),
      quietEnd: num(body.quietEnd),
      ownerSub: session.sub,
    });
    return NextResponse.json({ household: hh });
  }

  if (action === 'join') {
    const code = String(body.code ?? '').trim();
    const hh = await store.getHouseholdByPairingCode(code);
    if (!hh) return NextResponse.json({ error: 'No household with that code' }, { status: 404 });
    // One code may pair several devices, so rotation stays explicit (the
    // Sources card regenerates; minting a source rotates it too). The
    // response carries only what the pairing screen needs — never the whole
    // household with its care-circle contacts and owner ids.
    return NextResponse.json({ household: { id: hh.id, parentName: hh.parentName } });
  }

  if (action === 'demo') {
    const hh = await ensureDemoHousehold();
    const res = NextResponse.json({ household: hh });
    // The /demo console has no Google session; this cookie authorizes exactly
    // this household for a day (verified by authz.ts on every request).
    res.headers.append('Set-Cookie', demoCookieHeader(hh.id));
    return res;
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}
