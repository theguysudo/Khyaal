import { NextResponse } from 'next/server';
import { requireDeviceControl } from '@/lib/server/authz';
import { getStore } from '@/lib/server/store';
import { rateLimit } from '@/lib/server/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/device/actions?via=lan|usb — polled by the ESP32 sensor in LAN
 * mode (x-kh-household / x-kh-source / x-kh-key headers, the same credentials
 * as ingest) and by the Mac-side USB relay.
 *
 * Returns and clears the dashboard-queued actions for this source:
 *   { "actions": [{ "action": "falltest" }] }
 *
 * The `via` channel matters: two pollers share one queue, and the board can
 * only run what it can do over Wi-Fi. Without the split, the board drained a
 * `wifi_scan` request, did nothing with it, and the USB relay never saw it —
 * the scan simply never came back.
 */
export async function GET(req: Request) {
  if (
    !rateLimit(`devpoll:${req.headers.get('x-forwarded-for') ?? 'local'}`, 60, 60_000, {
      globalMultiplier: 8,
    })
  ) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }
  const householdId = req.headers.get('x-kh-household');
  const sourceId = req.headers.get('x-kh-source');
  if (!householdId || !sourceId) {
    return NextResponse.json({ error: 'Device credentials required' }, { status: 401 });
  }

  const source = await requireDeviceControl(req, householdId);
  if (source instanceof Response) return source;

  const via = new URL(req.url).searchParams.get('via') === 'usb' ? 'usb' : 'lan';
  const actions = await getStore().drainDeviceActions(sourceId, via);
  // A successful poll means the relay is alive and its credentials work. The
  // dashboard reads this back, so a missing scan can say "the relay is not
  // running" instead of leaving the family staring at nothing.
  await getStore().noteRelaySeen(sourceId);
  return NextResponse.json(
    { actions },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
