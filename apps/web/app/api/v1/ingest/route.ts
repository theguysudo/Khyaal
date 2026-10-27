import { NextResponse } from 'next/server';
import { parseIngest } from '@khayaal/shared';
import { ingestSignal } from '@/lib/server/runtime';

/**
 * POST /api/v1/ingest
 * { householdId, sourceId, type, value, ts?, apiKey? }
 * The one endpoint every source speaks — her phone, the ESP32 room sensor,
 * the simulator. Auth: source must be paired; per-source key when provided.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const householdId = typeof b.householdId === 'string' ? b.householdId : null;
  if (!householdId) return NextResponse.json({ error: 'householdId required' }, { status: 400 });

  const signal = parseIngest(b);
  if (!signal) return NextResponse.json({ error: 'Invalid signal' }, { status: 400 });

  const apiKey = typeof b.apiKey === 'string' ? b.apiKey : undefined;
  const result = await ingestSignal(householdId, signal, apiKey);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 });
  return NextResponse.json({ ok: true });
}
