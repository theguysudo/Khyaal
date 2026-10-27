'use client';

/**
 * Talkback — a walkie-talkie between the family dashboard and her phone.
 *
 * The rule that makes this acceptable in an eldercare product: **nobody's
 * microphone opens without the other side tapping Allow.** The requester
 * waits; the callee gets a popup with two big buttons; only then does audio
 * flow. Either side can start one.
 */

import * as React from 'react';
import { BentoCard, CardTitle } from './bento';
import { MicCapture, PcmPlayer, TALKBACK_MIME } from './talkback-audio';

interface TalkbackSession {
  id: string;
  householdId: string;
  requester: 'family' | 'parent';
  requesterName: string;
  callee: 'family' | 'parent';
  state: 'pending' | 'active' | 'declined' | 'ended';
  createdTs: number;
  answeredTs: number | null;
  endedTs: number | null;
  consentGiven: boolean;
}

const POLL_MS = 1200;

export default function TalkbackCard({
  id,
  parentName,
  childName,
}: {
  id: string;
  parentName: string;
  childName: string;
}) {
  const [session, setSession] = React.useState<TalkbackSession | null>(null);
  const [showConsent, setShowConsent] = React.useState(false);
  const [talking, setTalking] = React.useState(false);
  const [muted, setMuted] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const [heard, setHeard] = React.useState(0);
  const [sent, setSent] = React.useState(0);

  const micRef = React.useRef<MicCapture | null>(null);
  const playerRef = React.useRef<PcmPlayer | null>(null);
  const lastSeqRef = React.useRef(0);
  const sessionIdRef = React.useRef<string | null>(null);
  const busyRef = React.useRef(false);

  // --- polling ---------------------------------------------------------------
  React.useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/v1/household/${id}/talkback/session`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!alive) return;
        const next: TalkbackSession | null = data.session ?? null;
        setSession(next);

        // An incoming request shows the consent popup — once.
        if (
          next &&
          next.state === 'pending' &&
          next.callee === 'family' &&
          next.id !== sessionIdRef.current
        ) {
          sessionIdRef.current = next.id;
          setShowConsent(true);
        }
        if (!next || next.state === 'ended' || next.state === 'declined') {
          if (next?.state === 'ended' && sessionIdRef.current === next.id) {
            sessionIdRef.current = null;
            stopEverything();
            setNote('The talkback ended.');
          }
        }
      } catch {
        /* the panel keeps what it has */
      }
    };
    void poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // --- chunk receiver (long-poll) -------------------------------------------
  React.useEffect(() => {
    let alive = true;
    let timer: number | undefined;

    const receive = async () => {
      if (!alive) return;
      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        timer = window.setTimeout(receive, 400);
        return;
      }
      try {
        const res = await fetch(
          `/api/v1/household/${id}/talkback/chunks?after=${lastSeqRef.current}&sessionId=${sessionId}`,
          { cache: 'no-store' },
        );
        if (!res.ok) throw new Error('chunks failed');
        const data = await res.json();
        if (!alive) return;
        if (Array.isArray(data.chunks)) {
          for (const chunk of data.chunks) {
            lastSeqRef.current = Math.max(lastSeqRef.current, chunk.seq);
            // Only the other side's voice is played back.
            if (chunk.from !== 'family') {
              playerRef.current?.play(chunk.data);
              setHeard((n) => n + 1);
            }
          }
        }
      } catch {
        /* the next tick retries */
      }
      if (alive) timer = window.setTimeout(receive, 250);
    };

    void receive();
    return () => {
      alive = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [id]);

  React.useEffect(() => {
    playerRef.current = new PcmPlayer();
    micRef.current = new MicCapture();
    return () => {
      micRef.current?.stop();
      playerRef.current?.stop();
    };
  }, []);

  const stopEverything = React.useCallback(() => {
    micRef.current?.stop();
    playerRef.current?.stop();
    setTalking(false);
    lastSeqRef.current = 0;
  }, []);

  // --- actions ---------------------------------------------------------------
  const request = async (direction: 'to_parent' | 'to_family') => {
    setNote(null);
    try {
      const res = await fetch(`/api/v1/household/${id}/talkback/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not start the talkback');
      setSession(data.session);
      sessionIdRef.current = data.session?.id ?? null;
      lastSeqRef.current = 0;
      setNote(
        direction === 'to_parent'
          ? `Asked ${parentName} to talk. She will see a popup — nothing is recorded until she allows it.`
          : 'Asked your family to talk.',
      );
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not start the talkback');
    }
  };

  const answer = async (allow: boolean) => {
    const current = session;
    setShowConsent(false);
    if (!current) return;
    try {
      const res = await fetch(`/api/v1/household/${id}/talkback/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: current.id, allow }),
      });
      const data = await res.json();
      setSession(data.session);
      if (!allow) {
        sessionIdRef.current = null;
        setNote('You declined the talkback.');
      } else {
        setNote('Connected — hold the button to talk.');
      }
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not answer');
    }
  };

  const endCall = async () => {
    const current = session;
    stopEverything();
    sessionIdRef.current = null;
    setSession((s) => (s ? { ...s, state: 'ended' } : null));
    try {
      await fetch(`/api/v1/household/${id}/talkback/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(current ? { sessionId: current.id } : {}),
      });
    } catch {
      /* the server will time the session out anyway */
    }
    setNote('The talkback ended.');
  };

  const startTalking = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const ok = await micRef.current?.start((base64) => {
        const sessionId = sessionIdRef.current;
        if (!sessionId) return;
        void fetch(`/api/v1/household/${id}/talkback/chunk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, mime: TALKBACK_MIME, data: base64 }),
        }).then(() => setSent((n) => n + 1)).catch(() => undefined);
      });
      if (!ok) {
        setNote('The microphone is blocked — allow it in your browser to talk.');
        return;
      }
      setTalking(true);
    } finally {
      busyRef.current = false;
    }
  };

  const stopTalking = () => {
    micRef.current?.stop();
    setTalking(false);
  };

  // --- render ----------------------------------------------------------------
  const isActive = session?.state === 'active';
  const isPending = session?.state === 'pending';
  const incoming = isPending && session?.callee === 'family';

  return (
    <BentoCard label="Talkback" className="col-span-12 lg:col-span-5">
      <CardTitle note="consent first · push to talk">Talk to her</CardTitle>

      <p className="mt-2 text-xs leading-relaxed text-ink/50">
        A walkie-talkie for the house. Her phone asks first — if she allows it, you can talk live. If she declines,
        nothing was recorded and nothing was heard.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        {!isActive && !isPending && (
          <>
            <button
              onClick={() => request('to_parent')}
              className="rounded-full bg-clay px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-90"
            >
              📞 Ask {parentName} to talk
            </button>
            <button
              onClick={() => request('to_family')}
              className="rounded-full border border-ink/15 px-4 py-2.5 text-sm text-ink/60 transition-colors hover:bg-paper"
            >
              Call the family
            </button>
          </>
        )}

        {isPending && (
          <span className="inline-flex items-center gap-2 rounded-full bg-paper px-4 py-2.5 text-sm text-ink/65">
            <span className="h-2 w-2 animate-pulse rounded-full bg-clay" />
            Waiting for {session?.callee === 'parent' ? parentName : 'the family'} to allow it…
          </span>
        )}

        {isActive && (
          <>
            <button
              onMouseDown={startTalking}
              onMouseUp={stopTalking}
              onMouseLeave={stopTalking}
              onTouchStart={startTalking}
              onTouchEnd={stopTalking}
              aria-label="Hold to talk"
              className={`select-none rounded-full px-7 py-3 text-sm font-medium transition-all active:scale-95 ${
                talking
                  ? 'bg-[#b23a2f] text-white shadow-[0_8px_28px_rgba(178,58,47,.4)]'
                  : 'bg-ink text-paper hover:opacity-90'
              }`}
            >
              {talking ? '🎙 talking… release to stop' : '🎙 hold to talk'}
            </button>
            <button
              onClick={() => setMuted((m) => !m)}
              className="rounded-full border border-ink/15 px-4 py-2.5 text-sm text-ink/60 transition-colors hover:bg-paper"
            >
              {muted ? '🔇 muted' : '🔊 microphone on'}
            </button>
            <button
              onClick={endCall}
              className="rounded-full border border-[#b23a2f]/40 px-4 py-2.5 text-sm text-[#77231c] transition-colors hover:bg-[#f6dcd8]/60"
            >
              hang up
            </button>
          </>
        )}
      </div>

      {isActive && (
        <div className="mt-3 flex items-center gap-4 text-[11px] text-ink/40">
          <span>sent {sent} slices</span>
          <span>heard {heard} slices</span>
          <span className="inline-flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${talking ? 'animate-pulse bg-[#b23a2f]' : 'bg-ink/20'}`} />
            {talking ? 'your microphone is open' : 'your microphone is closed'}
          </span>
        </div>
      )}

      {note && <p className="mt-3 text-xs leading-relaxed text-ink/50">{note}</p>}

      {/* the consent popup */}
      {showConsent && incoming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 px-5 backdrop-blur-[2px]">
          <div className="w-full max-w-sm rounded-[26px] border border-ink/10 bg-paper p-6 text-center shadow-[0_24px_70px_rgba(42,36,29,.28)]">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-clay/12 text-2xl">
              📞
            </div>
            <h3 className="mt-4 font-heading text-xl text-ink">
              {session?.requesterName ?? 'Someone'} wants to talk
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink/60">
              You will hear {session?.requesterName ?? 'them'} live, like a walkie-talkie. Nothing is recorded, and you
              can hang up at any time.
            </p>
            <div className="mt-5 flex flex-col gap-2.5">
              <button
                onClick={() => answer(true)}
                className="rounded-full bg-ink px-5 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-90"
              >
                Allow the talkback
              </button>
              <button
                onClick={() => answer(false)}
                className="rounded-full border border-ink/15 px-5 py-3 text-sm text-ink/60 transition-colors hover:bg-white"
              >
                Not now
              </button>
            </div>
            <p className="mt-4 text-[11px] leading-relaxed text-ink/40">
              Khayaal never records a conversation. The audio passes through and is gone.
            </p>
          </div>
        </div>
      )}
    </BentoCard>
  );
}
