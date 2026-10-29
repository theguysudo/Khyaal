import { NextResponse } from 'next/server';
import { randomId } from '@khayaal/engine';
import { requireScoped } from '@/lib/server/authz';
import { getStore } from '@/lib/server/store';
import { rateLimit } from '@/lib/server/rate-limit';
import { simNow, tickHousehold } from '@/lib/server/runtime';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/household/{id}/sos — raise the alarm.
 *
 * Called by the elder's phone when the button is pressed. This is the one
 * signal that is allowed to be loud: the state machine jumps to tier 4 (SOS),
 * every registered phone of the household rings its siren at full volume,
 * and the dashboards paint the takeover.
 *
 * Auth: the 'sos' scope — the elder's phone (and the simulator) hold it; a
 * neighbour does not (a neighbour answers an SOS, they cannot raise one),
 * and the room sensor does not either (a fall raises SOS through the
 * engine's fall path, not by posting this signal).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!rateLimit(`sos:${req.headers.get('x-forwarded-for') ?? 'local'}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }
  const { id } = await params;
  const guard = await requireScoped(req, id, 'sos');
  if (guard instanceof Response) return guard;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* defaults below */
  }
  const origin = body.origin === 'auto' ? 'auto' : 'button';
  const note = typeof body.note === 'string' ? body.note.slice(0, 200) : '';

  const store = getStore();
  const household = await store.getHousehold(id);
  if (!household) return NextResponse.json({ error: 'Household not found' }, { status: 404 });

  const sourceId = req.headers.get('x-kh-source') ?? 'src_sos';
  const source = await store.findSource(id, sourceId);
  const nowTs = simNow(household);
  await store.appendSignal(id, {
    sourceId: source?.id ?? sourceId,
    type: 'sos',
    value: 'pressed',
    ts: nowTs,
    ...(note ? { meta: { note } } : {}),
  });
  await store.appendEvent(id, {
    id: randomId(),
    ts: nowTs,
    type: 'sos',
    to: 4,
    meta: origin === 'button' ? `${household.parentName} pressed SOS.` : 'SOS raised automatically.',
  });

  const bundle = await tickHousehold(id);
  if (!bundle) return NextResponse.json({ error: 'Household not found' }, { status: 404 });
  return NextResponse.json({
    sos: bundle.state.sos,
    tier: bundle.state.tier,
    status: bundle.state.status,
  });
}
