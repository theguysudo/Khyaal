import { NextResponse } from 'next/server';
import { randomId } from '@khayaal/engine';
import { scopedAccess } from '@/lib/server/authz';
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
 *
 * Coordination: the responder is the AUTHENTICATED caller — the neighbour
 * cookie resolves to the neighbour's own source (device credentials carry it
 * in x-kh-source) — because the engine keys the responder team on source id.
 * Keying on a header fallback collapsed every cookie neighbour into one
 * responder, each new "I'm responding" erasing the last.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!rateLimit(`sos-respond:${req.headers.get('x-forwarded-for') ?? 'local'}`, 20, 60_000)) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }
  const { id } = await params;
  const access = await scopedAccess(req, id, 'respond');
  if (access instanceof Response) return access;

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

  // The caller's own credential decides who joined — the cookie's neighbour
  // source, the device headers, or (for a family session) the header-less
  // family path. A body name may dress the record, never replace the identity.
  const headerSourceId = req.headers.get('x-kh-source');
  const sourceId = access.source?.id ?? headerSourceId ?? 'src_responder';
  const source = access.source ?? (headerSourceId ? await store.findSource(id, headerSourceId) : null);
  const by = typeof body.by === 'string' && body.by.trim()
    ? body.by.trim().slice(0, 80)
    : source?.label ?? access.session?.name ?? 'A neighbour';
  const nowTs = simNow(household);

  await store.appendSignal(id, {
    sourceId,
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
