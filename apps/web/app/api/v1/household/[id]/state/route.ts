import { NextResponse } from 'next/server';
import { tickHousehold } from '@/lib/server/runtime';
import { requireHouseholdMember, unauthorized } from '@/lib/server/authz';

/**
 * GET /api/v1/household/{id}/state
 * Advances the escalation state machine (a "tick") and returns the current
 * bundle. The dashboards poll this; polling is the realtime layer.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireHouseholdMember(req, id);
  if (guard instanceof Response) return guard;
  const bundle = await tickHousehold(id);
  if (!bundle) return unauthorized();
  return NextResponse.json(bundle, { headers: { 'Cache-Control': 'no-store' } });
}
