import { NextResponse } from 'next/server';
import { sessionFromRequest } from '@/lib/server/session';
import { claimHouseholdByCode } from '@/lib/server/runtime';

/**
 * POST /api/v1/auth/claim { code } — link an existing household to the
 * signed-in account with its pairing code, so families set up before
 * signing in show up on the login page forever after.
 */
export async function POST(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Sign in with Google first' }, { status: 401 });
  let code = '';
  try {
    const body = await req.json();
    if (typeof body?.code === 'string') code = body.code;
  } catch {
    /* handled below */
  }
  if (!/^\d{6}$/.test(code.trim())) {
    return NextResponse.json({ error: 'Enter the 6-digit pairing code' }, { status: 400 });
  }
  const hh = await claimHouseholdByCode(session.sub, code.trim());
  if (!hh) return NextResponse.json({ error: 'No household with that code' }, { status: 404 });
  return NextResponse.json({ household: { id: hh.id, parentName: hh.parentName } });
}
