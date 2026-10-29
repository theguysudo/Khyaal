import { NextResponse } from 'next/server';
import { randomId } from '@khayaal/engine';
import { householdAccess, requireScoped } from '@/lib/server/authz';
import { getStore } from '@/lib/server/store';
import { rateLimit } from '@/lib/server/rate-limit';
import { simNow, tickHousehold } from '@/lib/server/runtime';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/household/{id}/sos/resolve — stand the SOS down.
 *
 * The elder's own check-in channel or the family may resolve. A neighbour
 * cannot: "I'm responding" is theirs to give, "she is safe" is the family's
 * (or hers) to say. The signal drives the engine — the state machine drops
 * to tier 0 only when the resolve is the newest sos signal.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!rateLimit(`sos-resolve:${req.headers.get('x-forwarded-for') ?? 'local'}`, 20, 60_000)) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }
  const { id } = await params;
  const access = await householdAccess(req, id);
  const allowed =
    access.level === 'family' ||
    (access.level === 'device' && access.source && ['phone', 'simulator'].includes(access.source.type));
  if (!allowed) {
    // 404, like every other unauthorized household answer — no oracle.
    return new Response(JSON.stringify({ error: 'Household not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* defaults below */
  }
  const by = typeof body.by === 'string' && body.by.trim()
    ? body.by.trim().slice(0, 80)
    : access.session?.name ?? `${access.household!.parentName}'s phone`;

  const store = getStore();
  const household = await store.getHousehold(id);
  if (!household) return NextResponse.json({ error: 'Household not found' }, { status: 404 });

  const sourceId = req.headers.get('x-kh-source') ?? 'src_family';
  const nowTs = simNow(household);
  await store.appendSignal(id, {
    sourceId,
    type: 'sos',
    value: 'resolved',
    ts: nowTs,
    meta: { by },
  });
  await store.appendEvent(id, {
    id: randomId(),
    ts: nowTs,
    type: 'sos',
    from: 4,
    to: 0,
    meta: `SOS stood down by ${by}.`,
  });

  const bundle = await tickHousehold(id);
  if (!bundle) return NextResponse.json({ error: 'Household not found' }, { status: 404 });
  return NextResponse.json({ sos: bundle.state.sos, tier: bundle.state.tier, status: bundle.state.status });
}
