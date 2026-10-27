import { NextResponse } from 'next/server';
import { parentCheckIn } from '@/lib/server/runtime';
import { requireScoped, unauthorized } from '@/lib/server/authz';

/**
 * POST /api/v1/household/{id}/checkin — the one-tap "I'm OK".
 *
 * Only a caller that may speak for her: the family, her phone, or the
 * simulator. A room sensor must not be able to file the check-in that
 * silences the alert ladder for two hours.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireScoped(req, id, 'checkin');
  if (guard instanceof Response) return guard;
  const bundle = await parentCheckIn(id);
  if (!bundle) return unauthorized();
  return NextResponse.json(bundle);
}
