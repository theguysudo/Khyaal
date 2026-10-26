import { NextResponse } from 'next/server';
import type { Blueprint } from '@khayaal/shared';
import { requireFamily, requireHouseholdMember, unauthorized } from '@/lib/server/authz';
import { getStore } from '@/lib/server/store';
import { simNow } from '@/lib/server/runtime';
import { defaultBlueprint, sanitizeBlueprint } from '@khayaal/engine';

/**
 * GET  /api/v1/household/{id}/blueprint — the room plan.
 * POST /api/v1/household/{id}/blueprint — save it.
 *
 * The blueprint is the family's own drawing of where their sensors sit. It
 * holds room rectangles and the position of each paired sensor, nothing
 * else — no coordinates of the elder, no history of who went where.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireHouseholdMember(req, id);
  if (guard instanceof Response) return guard;

  const store = getStore();
  const household = await store.getHousehold(id);
  if (!household) return unauthorized();

  const blueprint: Blueprint =
    household.blueprint ?? defaultBlueprint(await store.getSources(id), simNow(household));
  return NextResponse.json({ blueprint });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireFamily(req, id);
  if (guard instanceof Response) return guard;

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const store = getStore();
  const household = await store.getHousehold(id);
  if (!household) return unauthorized();

  const blueprint = sanitizeBlueprint(body, simNow(household));
  if (!blueprint.rooms.length) {
    return NextResponse.json({ error: 'A blueprint needs at least one room' }, { status: 400 });
  }
  await store.updateHousehold(id, { blueprint });
  return NextResponse.json({ blueprint });
}
