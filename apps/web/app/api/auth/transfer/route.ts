import { NextResponse } from 'next/server';
import { sessionFromRequest, signSession, sessionCookieHeader } from '@/lib/server/session';
import { mintTransferToken } from '@/lib/server/transfer';
import { getLanIp } from '@/lib/server/lan';

/**
 * POST /api/auth/transfer — signed-in on the laptop, this mints a one-time
 * link the phone opens to inherit the session (Google's IP-address ban makes
 * signing in with Google on the LAN impossible).
 */
export async function POST(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });

  const lanIp = getLanIp();
  if (!lanIp) return NextResponse.json({ error: 'No LAN address found' }, { status: 500 });

  const token = mintTransferToken(session);
  return NextResponse.json({
    url: `http://${lanIp}:3100/auth/transfer/${token}`,
    expiresInSec: 300,
  });
}
