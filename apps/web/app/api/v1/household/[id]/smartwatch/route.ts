import { NextResponse } from 'next/server';
import { requireScoped } from '@/lib/server/authz';
import { getStore } from '@/lib/server/store';
import { SIGNAL_WINDOW_MS, simNow, smartwatchSummary } from '@/lib/server/runtime';

/**
 * GET /api/v1/household/{id}/smartwatch
 *
 * The wearable's latest reading — a few numbers and a last-active time.
 * Never a feed, never a heart-rate trace, never an API key.
 *
 * Guarded with the `read` scope: the family sees it (a session holds every
 * scope), and a device of this household may read it too. A band that never
 * reports simply produces an empty summary — it can never make this route
 * lie about what it saw.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireScoped(req, id, 'read');
  if (guard instanceof Response) return guard;

  const store = getStore();
  const sources = await store.getSources(id);
  const nowTs = simNow(guard);
  const signals = await store.getSignals(id, nowTs - SIGNAL_WINDOW_MS);
  return NextResponse.json(
    { summary: smartwatchSummary(sources, signals, nowTs), nowTs },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
