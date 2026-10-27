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

  const [networks, status] = await Promise.all([
    getStore().getDeviceScan(sourceId),
    getStore().getDeviceStatus(sourceId),
  ]);
  return NextResponse.json(
    { networks, status },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
