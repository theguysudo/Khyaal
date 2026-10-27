import { NextResponse } from 'next/server';
import { householdAccess, unauthorized } from '@/lib/server/authz';
import { getStore } from '@/lib/server/store';
import { rateLimit } from '@/lib/server/rate-limit';
import { callerRole, currentSession, makeTalkbackSession } from '@/lib/server/talkback';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/household/{id}/talkback/request
 *   { direction?: 'to_parent' | 'to_family' }
 * Opens a talkback request. The other side sees a consent popup and nothing
 * else happens until they tap Allow. Either side may start one.
 *
 * Reply: { session }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!rateLimit(`talkback:${req.headers.get('x-forwarded-for') ?? 'local'}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }
  const { id } = await params;
  const access = await householdAccess(req, id);
  if (access.level === 'none') return unauthorized();
  const household = access.household!;

  let body: { direction?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* default direction */
  }
  const direction = body.direction === 'to_family' ? 'to_family' : 'to_parent';
  const role = callerRole(access.level);

  // One live conversation at a time. If a session is already running, that
  // one wins — asking again would stack popups on the other phone.
  const existing = await currentSession(id);
  if (existing && (existing.state === 'pending' || existing.state === 'active')) {
    return NextResponse.json({ session: existing, reused: true });
  }

  const requesterName =
    role === 'family'
      ? household.childName || 'Family'
      : household.parentName || 'Her';

  const session = makeTalkbackSession(id, role, requesterName, direction);
  await getStore().createTalkbackSession(session);
  await getStore().appendEvent(id, {
    id: `evt_${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    ts: Date.now(),
    type: 'note',
    meta:
      role === 'family'
        ? `${requesterName} asked to talk. Waiting for her to allow it.`
        : `${requesterName} asked the family to talk. Waiting for them to allow it.`,
  });

  return NextResponse.json({ session, reused: false });
}
