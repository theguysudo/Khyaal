import { NextResponse } from 'next/server';
import { householdAccess } from '@/lib/server/authz';
import { getStore } from '@/lib/server/store';
import { rateLimit } from '@/lib/server/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/device/actions — polled by the ESP32 sensor in LAN mode
 * (x-kh-household / x-kh-source / x-kh-key headers, the same credentials as
 * ingest). Returns and clears the dashboard-queued actions for this source:
 *   { "actions": ["falltest"] }
 */
export async function GET(req: Request) {
  if (!rateLimit(`devpoll:${req.headers.get('x-forwarded-for') ?? 'local'}`, 60, 60_000)) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }
  const householdId = req.headers.get('x-kh-household');
  const sourceId = req.headers.get('x-kh-source');
  if (!householdId || !sourceId) {
    return NextResponse.json({ error: 'Device credentials required' }, { status: 401 });
  }

  const access = await householdAccess(req, householdId);
  if (access.level === 'none') return NextResponse.json({ error: 'Unknown source' }, { status: 403 });

  const source = await getStore().findSource(householdId, sourceId);
  if (!source) return NextResponse.json({ error: 'Unknown source' }, { status: 403 });

  const actions = await getStore().drainDeviceActions(sourceId);
  return NextResponse.json(
    { actions },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
