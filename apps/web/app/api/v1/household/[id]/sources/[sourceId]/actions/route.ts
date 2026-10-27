import { NextResponse } from 'next/server';
import type { DeviceAction } from '@khayaal/shared';
import { requireFamily, unauthorized } from '@/lib/server/authz';
import { getStore } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

const ACTIONS = new Set(['falltest', 'recheck', 'wifi_scan', 'wifi_connect', 'wififorget']);

/**
 * Which transport can actually run each action.
 *
 *  - 'wifi_*' must go over the USB relay: the board can only scan, join and
 *    forget networks through its serial CLI, and it may not even be online.
 *  - 'falltest' works over both, so it is queued on both channels. Whichever
 *    poller gets there first fires it; a repeat is harmless (the engine
 *    recomputes, it does not count).
 */
function channelsFor(action: DeviceAction['action']): ('lan' | 'usb')[] {
  if (action === 'wifi_scan' || action === 'wifi_connect' || action === 'wififorget') {
    return ['usb'];
  }
  return ['lan', 'usb'];
}

/**
 * POST /api/v1/household/{id}/sources/{sourceId}/actions { action, ... }
 * Family-only dashboard control of a paired sensor. The Mac-side bridge
 * relays actions over the sensor's USB link (so Wi-Fi management works even
 * when the sensor is offline): 'wifi_scan' scans, 'wifi_connect' carries
 * { ssid, password }, 'wififorget' clears the stored network.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; sourceId: string }> },
) {
  const { id, sourceId } = await params;
  const guard = await requireFamily(req, id);
  if (guard instanceof Response) return guard;

  const src = await getStore().findSource(id, sourceId);
  if (!src || src.type !== 'esp32') {
    return NextResponse.json({ error: 'No paired room sensor with that id' }, { status: 404 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* defaults */
  }
  const action = typeof body.action === 'string' ? (body.action as DeviceAction['action']) : 'falltest';
  if (!ACTIONS.has(action)) {
    return NextResponse.json({ error: `Unknown action — one of ${[...ACTIONS].join(', ')}` }, { status: 400 });
  }

  let payload: Record<string, unknown> | undefined;
  if (action === 'wifi_connect') {
    const ssid = typeof body.ssid === 'string' ? body.ssid.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!ssid || ssid.length > 32) {
      return NextResponse.json({ error: 'A network name (max 32 chars) is required' }, { status: 400 });
    }
    if (password.length > 64) {
      return NextResponse.json({ error: 'Password too long (max 64)' }, { status: 400 });
    }
    payload = { ssid, password };
  }

  const channels = channelsFor(action);
  for (const via of channels) {
    await getStore().queueDeviceAction(id, sourceId, {
      action,
      ...(payload ? { payload } : {}),
      via,
    });
  }
  await getStore().appendEvent(id, {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    ts: Date.now() + (await getStore().getHousehold(id))!.simTimeOffsetMs,
    type: 'note',
    meta:
      action === 'wifi_scan' ? 'Dashboard asked the room sensor to scan Wi-Fi networks.'
      : action === 'wifi_connect' ? `Dashboard asked the room sensor to join “${String(payload?.ssid)}”.`
      : action === 'wififorget' ? 'Dashboard asked the room sensor to forget its Wi-Fi network.'
      : `Dashboard asked the room sensor to run ${action}.`,
  });
  return NextResponse.json({
    ok: true,
    action,
    via: channels,
    note: channels.includes('usb')
      ? 'The USB relay runs this within ~3 s.'
      : 'The sensor fires on its next poll (~5 s).',
  });
}
