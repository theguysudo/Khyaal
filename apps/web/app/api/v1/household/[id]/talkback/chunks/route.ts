import { NextResponse } from 'next/server';
import { scopedAccess } from '@/lib/server/authz';
import { getStore } from '@/lib/server/store';
import { MAX_LONG_POLL_MS, readAliveChunks, wireChunk } from '@/lib/server/talkback';
import { decrypt } from '@/lib/server/crypto-box';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * GET /api/v1/household/{id}/talkback/chunks?after=<seq>
 * Long-poll for new audio slices. The request is held open for up to 15 s and
 * returns as soon as something arrives, so the conversation feels live without
 * hammering the server.
 * Reply: { chunks: [{seq, ts, mime, data, from}], now }
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await scopedAccess(req, id, 'talkback');
  if (access instanceof Response) return access;

  const url = new URL(req.url);
  const after = Number(url.searchParams.get('after') ?? 0);
  const afterSeq = Number.isFinite(after) && after > 0 ? Math.floor(after) : 0;
  const sessionId = url.searchParams.get('sessionId') ?? '';

  const store = getStore();
  const deadline = Date.now() + MAX_LONG_POLL_MS;

  // Poll the store until a slice shows up or the wait expires. The store is
  // in-memory in the demo, so this is cheap; with Firestore it is a read.
  for (;;) {
    const session = sessionId
      ? await store.getTalkbackSession(id, sessionId)
      : await store.getLatestTalkbackSession(id);
    if (!session) {
      return NextResponse.json({ chunks: [], now: Date.now() });
    }
    const chunks = readAliveChunks(
      await store.getTalkbackChunks(id, session.id, afterSeq),
      session,
    );
    if (chunks.length > 0) {
      return NextResponse.json(
        {
          chunks: chunks.map((c) => {
            // Only the family's own devices ever see the audio — it leaves
            // storage opened just-in-time for the long-poll.
            const plain = decrypt(c.data);
            return wireChunk({ ...c, data: plain ?? c.data });
          }),
          now: Date.now(),
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (session.state === 'ended' || Date.now() >= deadline) {
      return NextResponse.json(
        { chunks: [], now: Date.now(), ended: session.state === 'ended' },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
