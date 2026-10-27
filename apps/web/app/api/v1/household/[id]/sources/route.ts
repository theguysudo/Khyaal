import { NextResponse } from 'next/server';
import { randomId } from '@khayaal/engine';
import { getStore } from '@/lib/server/store';

/**
 * Sources — the devices that speak /api/v1/ingest.
 * GET lists them (never exposes keys); POST registers one and returns its key
 * exactly once (that key goes into the ESP32 firmware or the parent app).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sources = await getStore().getSources(id);
  return NextResponse.json(sources.map(({ apiKey: _k, ...s }) => s));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getStore();
  const hh = await store.getHousehold(id);
  if (!hh) return NextResponse.json({ error: 'Household not found' }, { status: 404 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // defaults below
  }
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
  return NextResponse.json(source); // includes apiKey — shown once
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const sourceId = url.searchParams.get('sourceId');
  if (!sourceId) return NextResponse.json({ error: 'sourceId required' }, { status: 400 });
  await getStore().deleteSource(id, sourceId);
  return NextResponse.json({ ok: true });
}
