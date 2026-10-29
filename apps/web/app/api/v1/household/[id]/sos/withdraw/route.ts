import { NextResponse } from 'next/server';
import { randomId } from '@khayaal/engine';
import { scopedAccess } from '@/lib/server/authz';
import { getStore } from '@/lib/server/store';
import { rateLimit } from '@/lib/server/rate-limit';
import { simNow, tickHousehold } from '@/lib/server/runtime';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/household/{id}/sos/withdraw — "I can't after all".
 *
 * The other half of "I'm responding": a responder standing back down. Every
 * responder app shows who is coming; a stale "Meera is on her way" that is
 * no longer true is worse than none, because it tells the next neighbour
 * they are not needed. Withdrawing removes this responder from the active
 * team (the engine keeps them in the record with a withdrawnTs), hands
 * primary to whoever responded next, and — if nobody is left — restarts the
 * no-response escalation clock from the withdrawal.
 *
 * Auth: the same 'respond' scope as sos/respond — the neighbour source and
 * the family; the room sensor cannot speak here. The withdrawal is keyed on
 * the AUTHENTICATED caller's source (the neighbour cookie resolves it), and
 * the engine ignores a withdrawal from a source that never responded, so a
 * stale client cannot disturb the team.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!rateLimit(`sos-withdraw:${req.headers.get('x-forwarded-for') ?? 'local'}`, 20, 60_000)) {
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

  const store = getStore();
  const household = await store.getHousehold(id);
  if (!household) return NextResponse.json({ error: 'Household not found' }, { status: 404 });

  const state = await store.getState(id);
  if (!state?.sos.active) {
    // Nothing to stand down from — the client should reset its UI to idle.
    return NextResponse.json({ error: 'No active SOS' }, { status: 409 });
  }

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
    value: 'withdrawn',
    ts: nowTs,
    meta: { by },
  });
  await store.appendEvent(id, {
    id: randomId(),
    ts: nowTs,
    type: 'sos',
    to: 4,
    meta: `${by} stood down — no longer responding.`,
  });

  const bundle = await tickHousehold(id);
  if (!bundle) return NextResponse.json({ error: 'Household not found' }, { status: 404 });
  return NextResponse.json({ sos: bundle.state.sos, tier: bundle.state.tier, status: bundle.state.status });
}
