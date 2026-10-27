import { NextResponse } from 'next/server';
import { childAck } from '@/lib/server/runtime';
import { requireFamily, unauthorized } from '@/lib/server/authz';

/** POST /api/v1/household/{id}/ack — "I've checked in" (notifies siblings). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireFamily(req, id);
  if (guard instanceof Response) return guard;
  let by = 'Family';
  try {
    const body = await req.json();
    if (typeof body?.by === 'string' && body.by) by = body.by;
  } catch {
    // body optional
  }
  const bundle = await childAck(id, by);
  if (!bundle) return unauthorized();
  return NextResponse.json(bundle);
}
