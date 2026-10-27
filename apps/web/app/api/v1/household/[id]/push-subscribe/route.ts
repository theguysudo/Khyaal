import { NextRequest, NextResponse } from 'next/server';

import { requireFamily, unauthorized } from '@/lib/server/authz';
import { getStore } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

/**
 * Browser (VAPID web-push) subscription registry for the dashboard itself —
 * so the family laptop gets the tier-3 nudge even with the tab closed.
 * The PushSubscription JSON is stored as-is; keys never leave the server
 * process because sending happens inside lib/server/notify.ts.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireFamily(req, id);
  if (guard instanceof Response) return guard;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || !('endpoint' in body)) {
    return NextResponse.json({ ok: false, error: 'PushSubscription JSON required' }, { status: 400 });
  }
  await getStore().addWebPushSubscriber(id, body);
  return NextResponse.json({ ok: true });
}
