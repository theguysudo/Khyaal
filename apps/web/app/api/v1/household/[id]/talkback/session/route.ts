import { NextResponse } from 'next/server';
import { scopedAccess } from '@/lib/server/authz';
import { currentSession, callerRole } from '@/lib/server/talkback';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/household/{id}/talkback/session
 * The live talkback session, whichever side is asking.
 * Reply: { session: TalkbackSession | null, role: 'family' | 'parent' }
 *
 * The phone polls this every few seconds while it is in the foreground so an
 * incoming request pops up promptly; the dashboard polls it while the
 * talkback panel is open.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await scopedAccess(req, id, 'talkback');
  if (access instanceof Response) return access;

  const session = await currentSession(id);
  return NextResponse.json(
    { session, role: callerRole(access.level === 'family' ? 'family' : 'device') },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
