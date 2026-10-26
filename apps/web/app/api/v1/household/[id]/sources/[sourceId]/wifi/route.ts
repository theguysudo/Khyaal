import { NextResponse } from 'next/server';
import { requireFamily, unauthorized } from '@/lib/server/authz';
import { getStore } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/household/{id}/sources/{sourceId}/wifi — family-only view of
 * what the sensor's USB relay reported: the last Wi-Fi scan (fresh ~2 min)
 * and the last connection status. The dashboard's Wi-Fi panel polls this.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; sourceId: string }> },
) {
  const { id, sourceId } = await params;
  const guard = await requireFamily(_req, id);
  if (guard instanceof Response) return guard;
  const src = await getStore().findSource(id, sourceId);
  if (!src || src.type !== 'esp32') return unauthorized();

  const [raw, status, relaySeenTs] = await Promise.all([
    getStore().getDeviceScan(sourceId),
    getStore().getDeviceStatus(sourceId),
    getStore().getRelaySeen(sourceId),
  ]);

  // One shape, always: the scan is an object with the list, the count and the
  // reason it might be empty. Older rows stored a bare array, so that is
  // normalised up to the same shape — the dashboard only ever has to read
  // `scan.networks` and `scan.error`.
  const scan = Array.isArray(raw)
    ? { networks: raw, count: raw.length, error: null, ts: null }
    : ((raw as { networks?: unknown[]; count?: number; error?: string | null; ts?: number } | null) ?? null);

  return NextResponse.json(
    {
      scan,
      networks: scan?.networks ?? null,
      status,
      // When the USB relay last polled for actions on this source. The panel
      // uses it to say whether the relay is running at all before blaming
      // the sensor for an empty scan.
      relay: { lastSeenTs: relaySeenTs },
      serverTs: Date.now(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
