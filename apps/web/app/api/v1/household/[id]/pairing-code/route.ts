import { NextResponse } from 'next/server';
import { makePairingCode } from '@/lib/server/runtime';
import { requireFamily, unauthorized } from '@/lib/server/authz';
import { getStore } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

/**
 * GET  /api/v1/household/{id}/pairing-code — the current code, so the family
 *      can pair another phone or sensor later (family session only).
 * POST — regenerate the code (explicit rotation: use this if a code leaked,
 *      e.g. shown on a screen during a demo). Existing paired devices keep
 *      working; only NEW pairings need the new code.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireFamily(req, id);
  if (guard instanceof Response) return guard;
  return NextResponse.json({ pairingCode: guard.pairingCode });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireFamily(req, id);
  if (guard instanceof Response) return guard;
  const pairingCode = makePairingCode();
  await getStore().updateHousehold(id, { pairingCode });
  return NextResponse.json({ pairingCode });
}
