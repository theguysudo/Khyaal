import { NextRequest, NextResponse } from 'next/server';

import { requireHouseholdMember, unauthorized } from '@/lib/server/authz';
import { getStore } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

/**
 * FCM device-token registry. The Android app posts its token here after
 * pairing; the notify pipeline reads the list when a tier-3 alert fires.
 * Tokens are opaque to the server beyond being sent to FCM.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireHouseholdMember(req, id);
  if (guard instanceof Response) return guard;
  const body = (await req.json().catch(() => null)) as { token?: string } | null;
  const token = body?.token?.trim();
  if (!token || token.length > 4096) {
    return NextResponse.json({ ok: false, error: 'token required (max 4096 chars)' }, { status: 400 });
  }
  await getStore().addDeviceToken(id, token);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireHouseholdMember(req, id);
  if (guard instanceof Response) return guard;
  const body = (await req.json().catch(() => null)) as { token?: string } | null;
  if (!body?.token) {
    return NextResponse.json({ ok: false, error: 'token required' }, { status: 400 });
  }
  await getStore().removeDeviceToken(id, body.token);
  return NextResponse.json({ ok: true });
}
