import { NextResponse } from 'next/server';
import { householdAccess, unauthorized } from '@/lib/server/authz';
import { getStore } from '@/lib/server/store';
import { encrypt } from '@/lib/server/crypto-box';
import { rateLimit } from '@/lib/server/rate-limit';
import { callerRole, isBase64, MAX_CHUNK_B64_CHARS, TALKBACK_AUDIO_MIME } from '@/lib/server/talkback';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/household/{id}/talkback/chunk
 *   { sessionId, mime?, data }   — data is base64 PCM16 mono 16 kHz
 * One slice of audio (about a quarter of a second). The server stamps `seq`
 * and `from`, so a client cannot forge either.
 * Reply: { ok: true, seq }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!rateLimit(`talkbackchunk:${req.headers.get('x-forwarded-for') ?? 'local'}`, 240, 60_000)) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }
  const { id } = await params;
  const access = await householdAccess(req, id);
  if (access.level === 'none') return unauthorized();
  const role = callerRole(access.level);

  let body: { sessionId?: string; mime?: string; data?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  const data = typeof body.data === 'string' ? body.data : '';
  if (!sessionId || !data) {
    return NextResponse.json({ error: 'sessionId and data required' }, { status: 400 });
  }
  if (data.length > MAX_CHUNK_B64_CHARS) {
    return NextResponse.json({ error: 'Audio slice too large' }, { status: 413 });
  }
  if (!isBase64(data)) {
    return NextResponse.json({ error: 'data must be base64' }, { status: 400 });
  }

  const session = await getStore().getTalkbackSession(id, sessionId);
  if (!session) return unauthorized();
  if (session.state !== 'active') {
    return NextResponse.json({ error: 'Talkback is not active' }, { status: 409 });
  }

  // Sealed before it ever touches the store or the wire: a passive listener
  // on the network sees AES-256-GCM ciphertext, not the conversation.
  const chunk = await getStore().appendTalkbackChunk(id, sessionId, {
    ts: Date.now(),
    mime: typeof body.mime === 'string' && body.mime ? body.mime : TALKBACK_AUDIO_MIME,
    data: encrypt(data),
    from: role,
  });

  return NextResponse.json({ ok: true, seq: chunk.seq });
}
