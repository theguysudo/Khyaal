import { NextResponse } from 'next/server';
import { snooze } from '@/lib/server/runtime';
import { requireScoped, unauthorized } from '@/lib/server/authz';

/**
 * POST /api/v1/household/{id}/snooze { minutes }
 *
 * Silencing the alert ladder is a family decision. A room sensor may not
 * make it.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireScoped(req, id, 'snooze');
  if (guard instanceof Response) return guard;
  let minutes = 60;
  try {
    const body = await req.json();
    if (typeof body?.minutes === 'number' && body.minutes > 0) minutes = Math.min(body.minutes, 720);
  } catch {
    // default
  }
  const bundle = await snooze(id, minutes);
  if (!bundle) return unauthorized();
  return NextResponse.json(bundle);
}
