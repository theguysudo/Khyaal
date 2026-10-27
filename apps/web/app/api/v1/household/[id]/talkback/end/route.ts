import { NextResponse } from 'next/server';
import { householdAccess, unauthorized } from '@/lib/server/authz';
import { getStore } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/household/{id}/talkback/end
 *   { sessionId }
 * Either side may hang up. The audio slices are dropped with the session.
 * Reply: { ok: true }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await householdAccess(req, id);
  if (access.level === 'none') return unauthorized();

  let body: { sessionId?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* fall through to the latest session */
  }
  const store = getStore();
  const sessionId =
    typeof body.sessionId === 'string' && body.sessionId
      ? body.sessionId
      : (await store.getLatestTalkbackSession(id))?.id;
  if (!sessionId) return NextResponse.json({ ok: true });

  const session = await store.getTalkbackSession(id, sessionId);
  if (!session) return unauthorized();
  if (session.state !== 'ended') {
    await store.updateTalkbackSession(id, sessionId, {
      state: 'ended',
      endedTs: Date.now(),
    });
    await store.appendEvent(id, {
      id: `evt_${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      ts: Date.now(),
      type: 'note',
      meta: 'The talkback ended.',
    });
  }
  return NextResponse.json({ ok: true });
}
