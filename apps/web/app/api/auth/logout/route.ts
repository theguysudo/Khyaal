import { NextResponse } from 'next/server';
import { clearSessionCookieHeader } from '@/lib/server/session';

/** GET /api/auth/logout — clears the family session. */
export async function GET(req: Request) {
  const res = NextResponse.redirect(`${new URL(req.url).origin}/login`);
  res.headers.append('Set-Cookie', clearSessionCookieHeader());
  return res;
}
