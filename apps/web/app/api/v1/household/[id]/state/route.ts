import { NextResponse } from 'next/server';
import { tickHousehold } from '@/lib/server/runtime';

/**
 * GET /api/v1/household/{id}/state
 * Advances the escalation state machine (a "tick") and returns the current
 * bundle. The dashboards poll this; polling is the realtime layer.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await tickHousehold(id);
  if (!bundle) return NextResponse.json({ error: 'Household not found' }, { status: 404 });
  return NextResponse.json(bundle, { headers: { 'Cache-Control': 'no-store' } });
}
