import { NextResponse } from 'next/server';
import { createHousehold, ensureDemoHousehold, makePairingCode } from '@/lib/server/runtime';
import { getStore } from '@/lib/server/store';

/**
 * POST /api/v1/pair
 *  { action: 'create', parentName, childName, wakeHour?, chargeStartHour?, quietStart?, quietEnd? }
 *  { action: 'join',   code }            — a parent device pairing in
 *  { action: 'demo' }                    — demo quick-start
 */
export async function POST(req: Request) {
  const store = getStore();
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const action = body.action;

  if (action === 'create') {
    const hh = await createHousehold({
      parentName: String(body.parentName ?? ''),
      childName: String(body.childName ?? ''),
      wakeHour: num(body.wakeHour),
      chargeStartHour: num(body.chargeStartHour),
      quietStart: num(body.quietStart),
      quietEnd: num(body.quietEnd),
    });
    return NextResponse.json({ household: hh });
  }

  if (action === 'join') {
    const code = String(body.code ?? '').trim();
    const hh = await store.getHouseholdByPairingCode(code);
    if (!hh) return NextResponse.json({ error: 'No household with that code' }, { status: 404 });
    // Parent devices re-key on every pairing for hygiene.
    const newCode = makePairingCode();
    await store.updateHousehold(hh.id, { pairingCode: newCode });
    return NextResponse.json({ household: { ...hh, pairingCode: newCode } });
  }

  if (action === 'demo') {
    const hh = await ensureDemoHousehold();
    return NextResponse.json({ household: hh });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}
