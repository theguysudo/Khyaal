import { NextResponse } from 'next/server';
import { randomId } from '@khayaal/engine';
import type { AppCommand } from '@khayaal/shared';
import { getStore } from '@/lib/server/store';
import { rateLimit } from '@/lib/server/rate-limit';

const TYPES: AppCommand['type'][] = ['message', 'reminder', 'tts', 'request_checkin'];

/**
 * POST /api/v1/household/{id}/commands { type, text }
 * The family composes a nudge for the parent's phone/app: a message, a
 * reminder, a text-to-speech voice reminder, or a check-in request.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!rateLimit(`cmd:${req.headers.get('x-forwarded-for') ?? 'local'}`, 20, 60_000)) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }
  const { id } = await params;
  const hh = await getStore().getHousehold(id);
  if (!hh) return NextResponse.json({ error: 'Household not found' }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const type = body.type as AppCommand['type'];
  const rawText = typeof body.text === 'string' ? body.text.trim() : '';
  if (!TYPES.includes(type) || !rawText || rawText.length > 280) {
    return NextResponse.json({ error: 'Need a valid type and text (1–280 chars)' }, { status: 400 });
  }
  const command: AppCommand = {
    id: `cmd_${randomId()}`,
    ts: Date.now() + hh.simTimeOffsetMs,
    type,
    text: rawText,
    ackTs: null,
  };
  await getStore().addCommand(id, command);
  await getStore().appendEvent(id, {
    id: randomId(),
    ts: command.ts,
    type: 'note',
    meta:
      type === 'tts'
        ? `Voice reminder sent: “${rawText}”`
        : type === 'request_checkin'
          ? 'Check-in requested from her phone'
          : `${type === 'reminder' ? 'Reminder' : 'Message'} sent: “${rawText}”`,
  });
  return NextResponse.json({ command });
}
