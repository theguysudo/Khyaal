import { NextResponse } from 'next/server';
import { householdAccess, unauthorized } from '@/lib/server/authz';
import { getStore } from '@/lib/server/store';
import { rateLimit } from '@/lib/server/rate-limit';
import { callerRole, currentSession } from '@/lib/server/talkback';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/household/{id}/talkback/answer
 *   { sessionId, allow: boolean }
 * The consent decision. Only the side being called may answer, and only once.
 * Reply: { session }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!rateLimit(`talkbackans:${req.headers.get('x-forwarded-for') ?? 'local'}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }
  const { id } = await params;
  const access = await householdAccess(req, id);
  if (access.level === 'none') return unauthorized();
  const role = callerRole(access.level);

  let body: { sessionId?: string; allow?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  const allow = body.allow === true;
  if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 });

  const session = await getStore().getTalkbackSession(id, sessionId);
  if (!session) return unauthorized();
  if (session.callee !== role) {
    return NextResponse.json({ error: 'Only the side being called can answer' }, { status: 403 });
  }
  if (session.state !== 'pending') {
    // Already answered — return the session as it is rather than erroring, so
    // a double tap cannot break the flow.
    return NextResponse.json({ session });
  }

  const updated = await getStore().updateTalkbackSession(id, sessionId, {
    state: allow ? 'active' : 'declined',
    consentGiven: allow,
    answeredTs: Date.now(),
  });

  await getStore().appendEvent(id, {
    id: `evt_${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    ts: Date.now(),
    type: 'note',
    meta: allow
      ? `${session.callee === 'parent' ? access.household!.parentName : 'The family'} allowed the talkback.`
      : 'The talkback request was declined.',
  });

  return NextResponse.json({ session: updated });
}
