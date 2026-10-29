import { NextResponse } from 'next/server';
import { neighbourAccessFromRequest } from '@/lib/server/session';
import { getStore } from '@/lib/server/store';
import { rateLimit } from '@/lib/server/rate-limit';
import { tickHousehold } from '@/lib/server/runtime';
import { neighbourEscalation, neighbourMe, publicResponders } from '@/lib/server/neighbour-coordination';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/neighbour/status — the neighbour's whole world.
 *
 * One bit, essentially: all well, or SOS active. When it is active, the
 * family's call contacts are included so the neighbour can phone a human
 * without the family's dashboard being open, the responder team shows who
 * is already moving, and `me` says whether this neighbour is one of them.
 * Everything else — the signals, the score, the trend, the room — stays
 * inside the family. A neighbour is a rung of the ladder, not a reader of
 * the house.
 *
 * The read is also a TICK. This endpoint is what neighbour phones poll, and
 * neighbours are the layer most likely to be watching when the family's own
 * dashboards are closed — so their poll drives the engine, and the
 * no-response escalation beats fire (and re-dispatch the alarm) even when
 * nobody in the family has an app open.
 */
export async function GET(req: Request) {
  if (!rateLimit(`neighbour-status:${req.headers.get('x-forwarded-for') ?? 'local'}`, 60, 60_000)) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }
  const url = new URL(req.url);
  const householdId = url.searchParams.get('hh');
  if (!householdId) return NextResponse.json({ error: 'hh required' }, { status: 400 });

  const access = neighbourAccessFromRequest(req, householdId);
  if (!access) return NextResponse.json({ error: 'Pair with the household code first' }, { status: 403 });

  const store = getStore();
  const household = await store.getHousehold(householdId);
  if (!household) return NextResponse.json({ error: 'Household not found' }, { status: 404 });

  // The cookie names the neighbour source; if the family deleted it, the
  // console is revoked on the spot — no grace period.
  const source = await store.findSource(householdId, access.sourceId);
  if (!source || source.type !== 'neighbour') {
    return NextResponse.json({ error: 'This neighbour access was revoked' }, { status: 403 });
  }
  await store.touchSource(householdId, source.id, Date.now());

  // The tick: advances the state machine (escalation beats for an unanswered
  // sos are emitted here and re-dispatched by the runtime) and returns the
  // fresh state this response paints from.
  const bundle = await tickHousehold(householdId);
  if (!bundle) return NextResponse.json({ error: 'Household not found' }, { status: 404 });

  const state = bundle.state;
  const sos = state.sos ?? { active: false, origin: null, sinceTs: null, ack: null };

  // Contacts only when they are needed — an emergency is not the moment to
  // go hunting for a phone number, but a quiet Tuesday has no business
  // showing them either.
  const contacts = sos.active
    ? (household.careCircle ?? [])
        .filter((m) => m.phone)
        .map((m) => ({ name: m.name, phone: m.phone! }))
    : [];

  return NextResponse.json(
    {
      householdName: `${household.parentName}'s home`,
      parentName: household.parentName,
      allWell: !sos.active && (state.tier ?? 0) === 0,
      tier: state.tier ?? 0,
      status: state.status ?? '',
      // The neighbour never sees another responder's source id — names only.
      sos: { ...sos, responders: publicResponders(sos) },
      me: neighbourMe(sos, source.id),
      escalation: neighbourEscalation(sos, bundle.simNowTs),
      contacts,
      serverTs: Date.now(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
