import { NextResponse } from 'next/server';
import { randomId } from '@khayaal/engine';
import { requireScoped } from '@/lib/server/authz';
import { getStore } from '@/lib/server/store';
import { rateLimit } from '@/lib/server/rate-limit';
import { simNow, tickHousehold } from '@/lib/server/runtime';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/household/{id}/sos/respond — "I'm responding".
 *
 * The neighbour's (or a family member's) acknowledgement on an active SOS:
 * it does NOT stand the alarm down — it tells everyone else that a human is
 * moving, which is exactly what the dashboard and the other phones should
 * show while the siren is still ringing. The 'respond' scope belongs to the
 * neighbour source and the family; the room sensor cannot speak here.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!rateLimit(`sos-respond:${req.headers.get('x-forwarded-for') ?? 'local'}`, 20, 60_000)) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }
  const { id } = await params;
  const guard = await requireScoped(req, id, 'respond');
  if (guard instanceof Response) return guard;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* defaults below */
  }
  const etaMin = typeof body.etaMin === 'number' && Number.isFinite(body.etaMin)
    ? Math.min(Math.max(Math.round(body.etaMin), 1), 120)
    : null;

  const store = getStore();
  const household = await store.getHousehold(id);
  if (!household) return NextResponse.json({ error: 'Household not found' }, { status: 404 });

  const sourceId = req.headers.get('x-kh-source') ?? 'src_responder';
  const source = await store.findSource(id, sourceId);
  const by = typeof body.by === 'string' && body.by.trim()
    ? body.by.trim().slice(0, 80)
    : source?.label ?? 'A neighbour';
  const nowTs = simNow(household);

  await store.appendSignal(id, {
    sourceId: source?.id ?? sourceId,
    type: 'sos',
    value: 'responded',
    ts: nowTs,
    meta: { by, ...(etaMin ? { etaMin } : {}) },
  });
  await store.appendEvent(id, {
    id: randomId(),
    ts: nowTs,
    type: 'sos',
    to: 4,
    meta: `${by} is responding${etaMin ? ` — about ${etaMin} min away` : ''}.`,
  });

  const bundle = await tickHousehold(id);
  if (!bundle) return NextResponse.json({ error: 'Household not found' }, { status: 404 });
  return NextResponse.json({ sos: bundle.state.sos, tier: bundle.state.tier, status: bundle.state.status });
}
