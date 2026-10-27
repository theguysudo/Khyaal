import { NextResponse } from 'next/server';
import { signSession, sessionCookieHeader } from '@/lib/server/session';
import { getStore } from '@/lib/server/store';

/**
 * GET /api/auth/google/callback — exchanges the OAuth code for tokens, reads
 * the OIDC profile, upserts the family user, and sets the signed session
 * cookie. Then back to /login, which shows their households.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = (req.headers.get('cookie') ?? '').match(/kh_oauth_state=([^;]+)/)?.[1];

  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(`${origin}/login?google=state-mismatch`);
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: `${origin}/api/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) return NextResponse.redirect(`${origin}/login?google=token-failed`);
  const tokens = (await tokenRes.json()) as { access_token?: string };
  if (!tokens.access_token) return NextResponse.redirect(`${origin}/login?google=token-failed`);

  const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profileRes.ok) return NextResponse.redirect(`${origin}/login?google=profile-failed`);
  const profile = (await profileRes.json()) as { sub: string; email?: string; name?: string; picture?: string };

  const store = getStore();
  const existing = await store.getUser(profile.sub);
  await store.upsertUser({
    sub: profile.sub,
    email: profile.email ?? '',
    name: profile.name ?? profile.email ?? 'Family',
    picture: profile.picture,
    householdIds: existing?.householdIds ?? [],
    createdAtTs: existing?.createdAtTs ?? Date.now(),
  });

  const res = NextResponse.redirect(`${origin}/login`);
  res.headers.append('Set-Cookie', sessionCookieHeader(signSession({
    sub: profile.sub,
    email: profile.email ?? '',
    name: profile.name ?? 'Family',
    picture: profile.picture,
  })));
  res.headers.append('Set-Cookie', 'kh_oauth_state=; Path=/; Max-Age=0');
  return res;
}
