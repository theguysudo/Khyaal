import { NextResponse } from 'next/server';
import { randomId } from '@khayaal/engine';
import type { AppCommand } from '@khayaal/shared';
import { requireFamily, unauthorized } from '@/lib/server/authz';
import { getStore } from '@/lib/server/store';
import { rateLimit } from '@/lib/server/rate-limit';

const TYPES: AppCommand['type'][] = ['message', 'reminder', 'tts', 'request_checkin'];
const LANGS: AppCommand['lang'][] = ['en', 'hi'];

/**
 * POST /api/v1/household/{id}/commands { type, text, lang? }
 * The family composes a nudge for the parent's phone/app: a message, a
 * reminder, a text-to-speech voice reminder, or a check-in request.
 * Family-only — nobody else may speak into her phone.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!rateLimit(`cmd:${req.headers.get('x-forwarded-for') ?? 'local'}`, 20, 60_000)) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }
  const { id } = await params;
  const guard = await requireFamily(req, id);
  if (guard instanceof Response) return guard;
  const hh = guard;

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
    ...(body.lang && LANGS.includes(body.lang as AppCommand['lang']) ? { lang: body.lang as AppCommand['lang'] } : {}),
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
