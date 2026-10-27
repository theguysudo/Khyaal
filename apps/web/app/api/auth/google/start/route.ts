import { NextResponse } from 'next/server';
import crypto from 'node:crypto';

/**
 * GET /api/auth/google/start — begins the Google OAuth2 (Authorization Code)
 * flow. Requires GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env.local; the
 * redirect URI registered in Google Cloud must be exactly
 *   {origin}/api/auth/google/callback
 */
export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const origin = new URL(req.url).origin;
  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.redirect(`${origin}/login?google=not-configured`);
  }
  const state = crypto.randomBytes(16).toString('hex');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });
  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  res.headers.append(
    'Set-Cookie',
    `kh_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
  );
  return res;
}
