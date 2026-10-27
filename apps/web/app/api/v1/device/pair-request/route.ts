import { NextResponse } from 'next/server';
import { requireDeviceControl } from '@/lib/server/authz';
import { getStore } from '@/lib/server/store';
import { rateLimit } from '@/lib/server/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/device/pair-request — polled by the USB relay alongside the
 * device-actions queue. Returns a pending one-click pairing request for this
 * household, if one is fresh (the dashboard mints it and waits for the
 * sensor to come alive; the relay types the identity into the board).
 *
 * Same device-header credentials as /device/actions. The request is NOT
 * drained here — re-reading it is harmless because typing the same identity
 * twice is idempotent, and it expires after five minutes.
 */
export async function GET(req: Request) {
  if (!rateLimit(`devpair:${req.headers.get('x-forwarded-for') ?? 'local'}`, 60, 60_000)) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }
  const householdId = req.headers.get('x-kh-household');
  const sourceId = req.headers.get('x-kh-source');
  if (!householdId || !sourceId) {
    return NextResponse.json({ error: 'Device credentials required' }, { status: 401 });
  }

  const source = await requireDeviceControl(req, householdId);
  if (source instanceof Response) return source;

  const request = await getStore().getSensorPairRequest(householdId);
  const FRESH_MS = 5 * 60_000;
  const pending =
    request && Date.now() - request.ts <= FRESH_MS ? request : null;

  return NextResponse.json({ request: pending }, { headers: { 'Cache-Control': 'no-store' } });
}
