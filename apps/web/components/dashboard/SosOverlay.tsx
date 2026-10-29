'use client';

/**
 * The SOS takeover — the one screen in Khayaal that is allowed to be loud.
 *
 * When `state.sos.active` flips true this paints over the whole dashboard:
 * red, unmissable, showing who pressed and who is already responding. The
 * siren uses WebAudio; browsers only let audio start after a user gesture on
 * the page, so the overlay arms itself on the first tap and says so plainly
 * instead of pretending it is ringing when it cannot.
 *
 * "Stand down" resolves the SOS; "I've responded" records an acknowledgement
 * without silencing it. Neither is buried: this state is rare and urgent.
 */

import * as React from 'react';
import { postJSON } from '@/lib/api';
import { fmtAgo } from '@/lib/api';

interface Props {
  householdId: string;
  parentName: string;
  sos: { active: boolean; origin: 'button' | 'auto' | null; sinceTs: number | null; ack: { by: string; ts: number } | null };
  childName: string;
}

export default function SosOverlay({ householdId, parentName, sos, childName }: Props) {
  const [armed, setArmed] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  const audioRef = React.useRef<{ ctx: AudioContext; stop: () => void } | null>(null);

  React.useEffect(() => {
    if (!sos.active) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [sos.active]);

  // Two-tone emergency interval — the classic alternating hi/lo wail, built
  // from oscillators so there is no audio file to ship.
  const startSiren = React.useCallback(() => {
    if (audioRef.current) return;
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const gain = ctx.createGain();
      gain.gain.value = 0.18;
      gain.connect(ctx.destination);
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.connect(gain);
      osc.start();
      let high = false;
      const toggle = window.setInterval(() => {
        high = !high;
        osc.frequency.setTargetAtTime(high ? 880 : 620, ctx.currentTime, 0.02);
      }, 500);
      audioRef.current = {
        ctx,
        stop: () => {
          window.clearInterval(toggle);
          try { osc.stop(); ctx.close(); } catch { /* already closed */ }
        },
      };
      setArmed(true);
    } catch {
      /* no audio available — the visual takeover still runs */
    }
  }, []);

  React.useEffect(() => {
    if (!sos.active && audioRef.current) {
      audioRef.current.stop();
      audioRef.current = null;
    }
  }, [sos.active]);

  if (!sos.active) return null;

  const since = sos.sinceTs ? fmtAgo(sos.sinceTs, now) : 'just now';

  const standDown = async () => {
    setBusy('resolve');
    try {
      await postJSON(`/api/v1/household/${householdId}/sos/resolve`, { by: childName });
    } catch { /* the overlay stays; the next poll reflects reality */ }
    setBusy(null);
  };

  const respond = async () => {
    setBusy('respond');
    try {
      await postJSON(`/api/v1/household/${householdId}/sos/respond`, { by: childName });
    } catch { /* as above */ }
    setBusy(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-err-900/95 p-6 backdrop-blur-sm">
      <div
        className="w-full max-w-lg rounded-xl border border-white/15 bg-err-700 p-8 text-center text-white shadow-unt-2xl"
        style={{ boxShadow: '0 24px 48px -12px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.14)' }}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-err-200">
          {sos.origin === 'button' ? 'Button pressed' : 'Automatic — ladder timed out'}
        </p>
        <h2 className="mt-3 text-5xl font-semibold tracking-[-0.02em]">SOS</h2>
        <p className="mt-3 text-lg leading-relaxed">
          {parentName} raised the emergency alarm — {since}.
        </p>
        {sos.ack && (
          <p className="mt-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium">
            {sos.ack.by} is responding.
          </p>
        )}
        {!armed ? (
          <button
            onClick={startSiren}
            className={`kh-press mt-6 w-full rounded-lg bg-white px-5 py-3 text-sm font-semibold text-err-700 shadow-xs transition hover:bg-err-50`}
          >
            🔊 Tap to sound the siren on this device
          </button>
        ) : (
          <p className="mt-6 animate-pulse text-sm font-semibold text-err-100 motion-reduce:animate-none">● Siren sounding on this device</p>
        )}
        <div className="mt-5 grid gap-2.5">
          <button
            onClick={respond}
            disabled={busy !== null}
            className="kh-press rounded-lg border border-white/30 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-err-700"
          >
            {busy === 'respond' ? 'Recording…' : "I'm responding"}
          </button>
          <button
            onClick={standDown}
            disabled={busy !== null}
            className="kh-press rounded-lg border border-white/30 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-err-700"
          >
            {busy === 'resolve' ? 'Standing down…' : 'Stand down — she is safe'}
          </button>
        </div>
        <p className="mt-5 text-xs leading-relaxed text-err-100/85">
          Every registered phone is ringing at full volume. Stand down only once someone has laid eyes on her.
        </p>
      </div>
    </div>
  );
}
