import { NextResponse } from 'next/server';
import { householdAccess } from '@/lib/server/authz';
import { getStore } from '@/lib/server/store';
import { rateLimit } from '@/lib/server/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Device-side Wi-Fi relay results, posted by the Mac-side bridge after it
 * runs dashboard-queued Wi-Fi actions over the sensor's USB link.
 *
 * POST /api/v1/device/wifi
 *   { kind: 'scan',   networks: [{ ssid, rssi, secure }] }
 *   { kind: 'status', status:  { connected, ssid, rssi, ip, fw } }
 * Auth: the sensor's own credentials (x-kh-household / x-kh-source / x-kh-key).
 */
export async function POST(req: Request) {
  if (!rateLimit(`devwifi:${req.headers.get('x-forwarded-for') ?? 'local'}`, 60, 60_000)) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }
  const householdId = req.headers.get('x-kh-household');
  const sourceId = req.headers.get('x-kh-source');
  if (!householdId || !sourceId) {
    return NextResponse.json({ error: 'Device credentials required' }, { status: 401 });
  }
  const access = await householdAccess(req, householdId);
  if (access.level === 'none') return NextResponse.json({ error: 'Unknown source' }, { status: 403 });

  let body: { kind?: string; networks?: unknown; status?: unknown; count?: number; error?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.kind === 'scan') {
    if (!Array.isArray(body.networks)) {
      return NextResponse.json({ error: 'networks array required' }, { status: 400 });
    }
    // Keep the count and the device's own error string: "no networks here"
    // and "the sensor never answered" are very different problems, and the
    // dashboard should be able to say which one it was.
    await getStore().putDeviceScan(sourceId, {
      networks: body.networks,
      count: typeof body.count === 'number' ? body.count : body.networks.length,
      error: typeof body.error === 'string' ? body.error : null,
    });
    return NextResponse.json({ ok: true });
  }
  if (body.kind === 'status') {
    if (typeof body.status !== 'object' || body.status === null) {
      return NextResponse.json({ error: 'status object required' }, { status: 400 });
    }
    await getStore().putDeviceStatus(sourceId, body.status);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'kind must be scan|status' }, { status: 400 });
}
