import { NextResponse } from 'next/server';
import { getStore } from '@/lib/server/store';

/** POST /api/v1/household/{id}/command-ack { id } — the app confirmed delivery. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let commandId = '';
  try {
    const body = await req.json();
    if (typeof body?.id === 'string') commandId = body.id;
  } catch {
    /* handled below */
  }
  if (!commandId) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await getStore().ackCommand(id, commandId, Date.now());
  return NextResponse.json({ ok: true });
}
