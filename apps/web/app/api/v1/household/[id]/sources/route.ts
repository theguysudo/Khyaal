import { NextResponse } from 'next/server';
import { randomId } from '@khayaal/engine';
import { requireFamily, requireSourceCreator, unauthorized } from '@/lib/server/authz';
import { getStore } from '@/lib/server/store';
import { makePairingCode } from '@/lib/server/runtime';

/**
 * Sources — the devices that speak /api/v1/ingest.
 * GET lists them (never exposes keys) — family session only.
 * POST registers one and returns its key exactly once. That key is the
 * credential for everything her device can do, so POST requires either the
 * family session or the household's *current pairing code* (which a pairing
 * phone holds and which is rotated after every use — see authz.ts).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireFamily(req, id);
  if (guard instanceof Response) return guard;
  const sources = await getStore().getSources(id);
  return NextResponse.json(sources.map(({ apiKey: _k, ...s }) => s));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // defaults below
  }
  const pairingCode = typeof body.pairingCode === 'string' ? body.pairingCode.trim() : null;
  const guard = await requireSourceCreator(req, id, pairingCode);
  if (guard instanceof Response) return guard;

  const store = getStore();
  const type = body.type === 'esp32' ? 'esp32' : body.type === 'phone' ? 'phone' : 'simulator';
  const source = {
    id: `src_${randomId()}`,
    type: type as 'esp32' | 'phone' | 'simulator',
    label: typeof body.label === 'string' && body.label ? body.label : type === 'esp32' ? 'Room sensor (ESP32)' : 'Simulated source',
    apiKey: `sk_${randomId()}${randomId()}`,
    createdAtTs: Date.now(),
    lastSeenTs: null,
  };
  await store.addSource(id, source);
  // One mint, one code: the printed/visible code cannot mint keys forever.
  // The family taps regenerate for the next device — the fresh code is on
  // the card the moment they need it. The replacement comes from the
  // CSPRNG (crypto.randomInt), never from a modulo of getRandomValues and
  // never from Math.random().
  await store.updateHousehold(id, {
    pairingCode: makePairingCode(),
  });
  return NextResponse.json(source); // includes apiKey — shown once
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireFamily(req, id);
  if (guard instanceof Response) return guard;
  const url = new URL(req.url);
  const sourceId = url.searchParams.get('sourceId');
  if (!sourceId) return NextResponse.json({ error: 'sourceId required' }, { status: 400 });
  await getStore().deleteSource(id, sourceId);
  return NextResponse.json({ ok: true });
}
