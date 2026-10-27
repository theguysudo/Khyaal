import type { TalkbackChunk, TalkbackRole, TalkbackSession } from '@khayaal/shared';
import { randomId } from '@khayaal/engine';
import { getStore } from './store';

/**
 * Talkback — a consent-first walkie-talkie between the family dashboard and
 * the elder's phone.
 *
 * The rules that matter:
 *  - nobody's microphone opens without the other side tapping Allow;
 *  - the server decides which side a chunk came from (the caller's role), so
 *    a client cannot forge "from" and impersonate the other half;
 *  - audio is transient. Chunks live in the store for the length of the
 *    conversation and are dropped when the session ends.
 */

export const TALKBACK_AUDIO_MIME = 'audio/pcm;rate=16000';
/** ~48 KB of PCM — about 1.5 seconds at 16 kHz mono 16-bit. */
export const MAX_CHUNK_B64_CHARS = 64 * 1024;
export const MAX_LONG_POLL_MS = 15_000;
export const SESSION_TTL_MS = 30 * 60_000;

export interface TalkbackCaller {
  role: TalkbackRole;
  name: string;
}

/** Which side of the conversation is this caller on? */
export function callerRole(level: 'family' | 'device'): TalkbackRole {
  return level === 'family' ? 'family' : 'parent';
}

export function makeTalkbackSession(
  householdId: string,
  requester: TalkbackRole,
  requesterName: string,
  direction: 'to_parent' | 'to_family',
): TalkbackSession {
  const callee: TalkbackRole = direction === 'to_parent' ? 'parent' : 'family';
  return {
    id: `tb_${randomId()}`,
    householdId,
    requester,
    requesterName,
    callee,
    state: 'pending',
    createdTs: Date.now(),
    answeredTs: null,
    endedTs: null,
    consentGiven: false,
  };
}

/** The session the caller should be looking at: the newest one, if any. */
export async function currentSession(householdId: string): Promise<TalkbackSession | null> {
  const session = await getStore().getLatestTalkbackSession(householdId);
  if (!session) return null;
  // A request nobody answered for half an hour is not a request any more.
  if (
    session.state === 'pending' &&
    Date.now() - session.createdTs > SESSION_TTL_MS
  ) {
    await getStore().updateTalkbackSession(householdId, session.id, {
      state: 'ended',
      endedTs: Date.now(),
    });
    // Nobody answered, so nobody spoke — but drop the slices anyway: the
    // session is over and its audio must not outlive it.
    await getStore().deleteTalkbackChunks(householdId, session.id);
    return null;
  }
  return session;
}

export function isBase64(value: string): boolean {
  if (!value || value.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

/**
 * Audio belongs to a live conversation. Once a session has ended (or was
 * declined), its chunks are dead data — the store keeps them until retention
 * clears them, but no reader may have them again.
 */
export function readAliveChunks(chunks: TalkbackChunk[], session: TalkbackSession) {
  if (session.state === 'ended' || session.state === 'declined') return [];
  return chunks;
}

/** The public shape of a chunk on the wire. */
export function wireChunk(chunk: TalkbackChunk) {
  return {
    seq: chunk.seq,
    ts: chunk.ts,
    mime: chunk.mime,
    data: chunk.data,
    from: chunk.from,
  };
}
