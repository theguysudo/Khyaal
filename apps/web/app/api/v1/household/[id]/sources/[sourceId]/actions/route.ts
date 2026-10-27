import { NextResponse } from 'next/server';
import { requireFamily, unauthorized } from '@/lib/server/authz';
import { getStore } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

const ACTIONS = new Set(['falltest', 'recheck']);

/**
 * POST /api/v1/household/{id}/sources/{sourceId}/actions { action }
 * Family-only dashboard control of a paired sensor. The sensor picks the
 * action up on its next poll (~5 s in LAN mode) — 'falltest' makes the real
 * hardware fire a fall event so the escalation path can be demonstrated
 * without anyone falling over.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; sourceId: string }> },
) {
  const { id, sourceId } = await params;
  const guard = await requireFamily(req, id);
  if (guard instanceof Response) return guard;

  const src = await getStore().findSource(id, sourceId);
  if (!src || src.type !== 'esp32') {
    return NextResponse.json({ error: 'No paired room sensor with that id' }, { status: 404 });
  }

  let action = 'falltest';
  try {
    const body = await req.json();
    if (typeof body?.action === 'string') action = body.action;
  } catch {
    /* default */
  }
  if (!ACTIONS.has(action)) {
    return NextResponse.json({ error: `Unknown action — one of ${[...ACTIONS].join(', ')}` }, { status: 400 });
  }

  await getStore().queueDeviceAction(id, sourceId, action);
  await getStore().appendEvent(id, {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    ts: Date.now() + (await getStore().getHousehold(id))!.simTimeOffsetMs,
    type: 'note',
    meta: `Dashboard asked the room sensor to run ${action}.`,
  });
  return NextResponse.json({ ok: true, action, note: 'The sensor fires on its next poll (~5 s).' });
}
