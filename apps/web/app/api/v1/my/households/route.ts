import { NextResponse } from 'next/server';
import { sessionFromRequest } from '@/lib/server/session';
import { householdsForUser } from '@/lib/server/runtime';

/**
 * GET /api/v1/my/households — the families linked to the signed-in Google
 * account (name + id only; the dashboard itself needs no secrets).
 */
export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ user: null, households: [] });
  const households = await householdsForUser(session.sub);
  return NextResponse.json({
    user: session,
    households: households.map((hh) => ({
      id: hh.id,
      parentName: hh.parentName,
      createdAtTs: hh.createdAtTs,
    })),
  });
}
