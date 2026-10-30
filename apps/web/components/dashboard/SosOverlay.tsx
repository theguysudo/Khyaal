'use client';

/**
 * The SOS takeover — the one screen in Khayaal that is allowed to be loud.
 *
 * iOS sheet behaviour: a full-bleed alarm backdrop and a sheet that slides up
 * on the ledger curve (cubic-bezier(.32,.72,0,1), 360ms). The sheet runs the
 * dark token set (.theme-dark in globals.css) — dark paper, warm ink — with
 * the elapsed time ticking in tabular mono. The siren uses WebAudio; browsers
 * only let audio start after a user gesture on the page, so the overlay arms
 * itself on the first tap and says so plainly instead of pretending it is
 * ringing when it cannot. The arm button is the design system's only pulsing
 * element: the btn-sos rest-pulse outline.
 *
 * "Stand down" resolves the SOS; "I've responded" records an acknowledgement
 * without silencing it. Neither is buried: this state is rare and urgent.
 */

import * as React from 'react';
import { postJSON, fmtAgo } from '@/lib/api';
import { IconSpeaker } from './icons';

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
  // The countdown — tabular mono, ticking once a second while the alarm runs.
  const elapsedS = sos.sinceTs ? Math.max(0, Math.floor((now - sos.sinceTs) / 1000)) : 0;
  const mm = String(Math.floor(elapsedS / 60)).padStart(2, '0');
  const ss = String(elapsedS % 60).padStart(2, '0');

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
    <div className="sheet-backdrop theme-dark fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Emergency">
      <div className="sheet w-full max-w-lg rounded-t-2xl border border-[#3B362F] bg-[#1E1B18] p-8 text-center text-[#F2EEE8] sm:rounded-2xl">
        <p className="t-meta text-[#E5645C]">
          {sos.origin === 'button' ? 'Button pressed' : 'Automatic — ladder timed out'}
        </p>
        <h2 className="t-display mt-3 text-[56px] text-[#F2EEE8]">SOS</h2>
        <p className="mt-3 t-body text-[#F2EEE8]">
          {parentName} raised the emergency alarm — {since}.
        </p>
        <p className="mt-2 font-mono text-[15px] tabular-nums text-[#E5645C]" aria-live="polite">
          T+{mm}:{ss} since raised
        </p>
        {sos.ack && (
          <p className="mt-2 inline-flex items-center gap-2 rounded-lg border border-[#3B362F] px-4 py-2 text-[15px] text-[#F2EEE8]">
            <span className="dot bg-[#7FB89B]" aria-hidden />
            {sos.ack.by} is responding.
          </p>
        )}
        {!armed ? (
          <button onClick={startSiren} className="btn-sos mt-6">
            <IconSpeaker className="h-4 w-4" />
            Tap to sound the siren on this device
          </button>
        ) : (
          <p className="mt-6 inline-flex items-center gap-2 text-[15px] font-semibold text-[#E5645C]">
            <span className="dot bg-[#E5645C]" aria-hidden />
            Siren sounding on this device
          </p>
        )}
        <div className="mt-5 grid gap-2.5">
          <button
            onClick={respond}
            disabled={busy !== null}
            className="kh-press rounded-lg border border-[#3B362F] px-5 py-3 text-[15px] font-semibold text-[#F2EEE8] transition-colors hover:border-[#F2EEE8] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFF7F0] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1E1B18]"
          >
            {busy === 'respond' ? 'Recording…' : "I'm responding"}
          </button>
          <button
            onClick={standDown}
            disabled={busy !== null}
            className="kh-press rounded-lg border border-[#3B362F] px-5 py-3 text-[15px] font-semibold text-[#F2EEE8] transition-colors hover:border-[#F2EEE8] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFF7F0] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1E1B18]"
          >
            {busy === 'resolve' ? 'Standing down…' : 'Stand down — she is safe'}
          </button>
        </div>
        <p className="mt-5 text-[13px] leading-relaxed text-[#A8A29E]">
          Every registered phone is ringing at full volume. Stand down only once someone has laid eyes on her.
        </p>
      </div>
    </div>
  );
}
