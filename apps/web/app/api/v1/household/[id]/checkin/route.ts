import { NextResponse } from 'next/server';
import { parentCheckIn } from '@/lib/server/runtime';
import { requireHouseholdMember, unauthorized } from '@/lib/server/authz';

/** POST /api/v1/household/{id}/checkin — the one-tap "I'm OK". */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireHouseholdMember(req, id);
  if (guard instanceof Response) return guard;
  const bundle = await parentCheckIn(id);
  if (!bundle) return unauthorized();
  return NextResponse.json(bundle);
}
