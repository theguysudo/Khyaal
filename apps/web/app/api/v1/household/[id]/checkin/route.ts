import { NextResponse } from 'next/server';
import { parentCheckIn } from '@/lib/server/runtime';

/** POST /api/v1/household/{id}/checkin — the one-tap "I'm OK". */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await parentCheckIn(id);
  if (!bundle) return NextResponse.json({ error: 'Household not found' }, { status: 404 });
  return NextResponse.json(bundle);
}
