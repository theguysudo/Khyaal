import { NextResponse } from 'next/server';
import { signSession, sessionCookieHeader, type SessionUser } from '@/lib/server/session';
import { consumeTransferToken } from '@/lib/server/transfer';
import { getStore } from '@/lib/server/store';

/**
 * GET /auth/transfer/{token} — the phone opens this once; the session cookie
 * is set, the carried profile re-upserts the user row (so transfers survive
 * store restarts), and the token is burned. Redirects to /login.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const origin = new URL(_req.url).origin;
  const user: SessionUser | null = consumeTransferToken(token);
  if (!user) return NextResponse.redirect(`${origin}/login?transfer=expired`);

  const store = getStore();
  const existing = await store.getUser(user.sub);
  await store.upsertUser({
    sub: user.sub,
    email: user.email,
    name: user.name,
    picture: user.picture,
    householdIds: existing?.householdIds ?? [],
    createdAtTs: existing?.createdAtTs ?? Date.now(),
  });

  const res = NextResponse.redirect(`${origin}/login?transferred=1`);
  res.headers.append('Set-Cookie', sessionCookieHeader(signSession(user)));
  return res;
}
