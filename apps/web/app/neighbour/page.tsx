'use client';

/**
 * KHAYAAL NEIGHBOUR — the rung of the ladder below the family.
 *
 * A neighbour sees one bit: all well, or SOS active. When it is active this
 * console becomes an alarm — full-screen, siren armed by tap (the browser
 * only allows sound after a gesture), with three actions: I'm responding,
 * call the family, and silence-for-me (this phone only — it never stands
 * the household's SOS down, that is the family's call).
 *
 * Joining takes the household's pairing code. There is no feed here, no
 * score, no trend, no room — a neighbour is trusted with "does someone need
 * to walk over", and with nothing else.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

interface SosState {
  active: boolean;
  origin: 'button' | 'auto' | null;
  sinceTs: number | null;
  ack: { by: string; ts: number } | null;
}
interface Status {
  householdName: string;
  parentName: string;
  allWell: boolean;
  status: string;
  sos: SosState;
  contacts: { name: string; phone: string }[];
  serverTs: number;
}

const CHECKLIST = [
  'Knock loudly — call her name.',
  'Listen at the door before using a key.',
  'If she answers: stay until she is steady.',
  'If not: call the family, then emergency services.',
  "Don't move her if she is hurt — wait for help.",
];

function fmtAgo(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return `${Math.floor(s / 3600)} h ago`;
}

export default function NeighbourPage() {
  const [hhId, setHhId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [paired, setPaired] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [onDuty, setOnDuty] = useState(true);
  const [silenced, setSilenced] = useState(false);
  const [armed, setArmed] = useState(false);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const audioRef = useRef<{ ctx: AudioContext; stop: () => void } | null>(null);

  // The household this console belongs to — the pair response sets the
  // signed kh_neighbour cookie and tells us the id to poll with.
  useEffect(() => {
    const saved = window.localStorage.getItem('kh_neighbour_hh');
    if (saved) setHhId(saved);
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!hhId) return;
    let gone = false;
    const poll = async () => {
      try {
        const r = await fetch(`/api/v1/neighbour/status?hh=${encodeURIComponent(hhId)}`, { cache: 'no-store' });
        if (r.status === 403) {
          // revoked or never paired — drop back to the join screen
          window.localStorage.removeItem('kh_neighbour_hh');
          setHhId(null);
          return;
        }
        if (r.ok && !gone) setStatus(await r.json());
      } catch { /* keep the last status */ }
    };
    void poll();
    const t = window.setInterval(poll, 3000);
    return () => { gone = true; window.clearInterval(t); };
  }, [hhId]);

  const startSiren = () => {
    if (audioRef.current) return;
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const gain = ctx.createGain();
      gain.gain.value = 0.22;
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
        stop: () => { window.clearInterval(toggle); try { osc.stop(); ctx.close(); } catch { /* closed */ } },
      };
      setArmed(true);
    } catch { /* visual alarm still runs */ }
  };

  useEffect(() => {
    if (!silenced && audioRef.current) { audioRef.current.stop(); audioRef.current = null; setArmed(false); }
  }, [silenced]);
  useEffect(() => {
    if (!status?.sos.active && audioRef.current) { audioRef.current.stop(); audioRef.current = null; setArmed(false); }
  }, [status?.sos.active]);

  const pair = async () => {
    setBusy('pair');
    setError(null);
    try {
      const r = await fetch('/api/v1/neighbour/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairingCode: code.trim(), name: name.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Pairing failed');
      window.localStorage.setItem('kh_neighbour_hh', d.householdId);
      setHhId(d.householdId);
      setPaired(d.householdName);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pairing failed');
    } finally {
      setBusy(null);
    }
  };

  const act = async (path: 'respond') => {
    if (!hhId) return;
    setBusy(path);
    try {
      await fetch(`/api/v1/household/${hhId}/sos/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ by: name.trim() || 'A neighbour' }),
      });
      const r = await fetch(`/api/v1/neighbour/status?hh=${encodeURIComponent(hhId)}`, { cache: 'no-store' });
      if (r.ok) setStatus(await r.json());
    } finally {
      setBusy(null);
    }
  };

  const sosActive = status?.sos.active === true && !(onDuty === false);
  const ringing = sosActive && !silenced;

  return (
    <main className={`min-h-screen transition-colors duration-500 ${sosActive ? 'bg-[#4a0e08] text-[#fdf1ee]' : 'bg-paper text-ink'}`}>
      <div className="mx-auto max-w-md px-5 py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] opacity-60">Khayaal · Neighbour</p>

        {!hhId && (
          <section className="mt-8">
            <h1 className="text-3xl font-semibold tracking-tight">Be the nearby answer</h1>
            <p className="mt-3 text-sm leading-relaxed opacity-70">
              Enter the family&apos;s pairing code and you will hear their alarm if it ever rings. You see one
              thing only — whether someone needs to walk over. Never their day.
            </p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="mt-6 w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm outline-none focus:border-clay"
            />
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-digit pairing code"
              inputMode="numeric"
              className="mt-2.5 w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 font-mono text-lg tracking-[0.3em] outline-none focus:border-clay"
            />
            <button
              onClick={pair}
              disabled={busy !== null || code.length !== 6}
              className="kh-press mt-4 w-full rounded-full bg-ink px-5 py-3 text-sm font-semibold text-paper transition hover:bg-ink/85 disabled:opacity-40"
            >
              {busy === 'pair' ? 'Joining…' : 'Join this family'}
            </button>
            {error && <p className="mt-3 text-sm text-[#b23a2f]">{error}</p>}
            <p className="mt-8 text-center text-xs opacity-50">
              <Link href="/" className="underline">What is Khayaal?</Link>
            </p>
          </section>
        )}

        {hhId && !status && <p className="mt-10 text-sm opacity-60">Connecting…</p>}

        {status && (
          <section className="mt-8">
            <h1 className="text-2xl font-semibold tracking-tight">{status.householdName}</h1>
            <div className="mt-4 flex items-center justify-between rounded-2xl border border-current/10 bg-white/60 px-4 py-3 text-sm dark:bg-black/10">
              <span className="opacity-70">On duty</span>
              <button
                onClick={() => setOnDuty(!onDuty)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${onDuty ? 'bg-[#4c7a4f] text-white' : 'bg-ink/10 text-ink/60'}`}
              >
                {onDuty ? 'Available' : 'Off duty'}
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed opacity-50">
              Off duty only silences this phone — the family is not told. Your availability is your business.
            </p>

            {!sosActive && (
              <div className="mt-8 rounded-3xl border border-current/10 bg-white/70 p-8 text-center">
                <p className="text-4xl">🏠</p>
                <p className="mt-3 text-xl font-semibold">All well today</p>
                <p className="mt-1 text-sm opacity-60">{status.status}</p>
              </div>
            )}

            {sosActive && (
              <div className="mt-6 rounded-3xl border border-white/20 bg-[#5c130a] p-7 text-center text-[#fdf1ee]">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#f4b8ac]">
                  {status.sos.origin === 'button' ? 'Button pressed' : 'Automatic'}
                </p>
                <h2 className="mt-2 text-5xl font-semibold">SOS</h2>
                <p className="mt-2 text-sm text-[#f4b8ac]">
                  {status.parentName} raised the alarm — {status.sos.sinceTs ? fmtAgo(status.sos.sinceTs, nowTs) : 'just now'}
                </p>
                {status.sos.ack && <p className="mt-2 text-sm">{status.sos.ack.by} is responding.</p>}

                {ringing && !armed && (
                  <button onClick={startSiren} className="kh-press mt-5 w-full rounded-full bg-[#fdf1ee] px-5 py-3 text-sm font-semibold text-[#5c130a]">
                    🔊 Tap to sound the siren
                  </button>
                )}
                {ringing && armed && <p className="mt-5 animate-pulse text-sm font-semibold text-[#f4b8ac]">● Siren sounding</p>}
                {ringing && (
                  <button onClick={() => setSilenced(true)} className="mt-2 w-full rounded-full border border-white/25 px-5 py-2 text-xs opacity-80">
                    Silence on this phone only
                  </button>
                )}

                <button
                  onClick={() => act('respond')}
                  disabled={busy !== null}
                  className="kh-press mt-4 w-full rounded-full bg-[#fdf1ee] px-5 py-3 text-sm font-semibold text-[#5c130a] disabled:opacity-40"
                >
                  {busy === 'respond' ? 'Recording…' : "I'm responding"}
                </button>
                {status.contacts.length > 0 && (
                  <div className="mt-3 grid gap-2">
                    {status.contacts.map((c) => (
                      <a
                        key={c.phone}
                        href={`tel:${c.phone}`}
                        className="rounded-full border border-white/25 px-5 py-2.5 text-sm font-semibold"
                      >
                        📞 Call {c.name}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mt-8 rounded-3xl border border-current/10 bg-white/60 p-6 dark:bg-black/10">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-50">If you go</p>
              <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed opacity-80">
                {CHECKLIST.map((step) => <li key={step}>{step}</li>)}
              </ol>
            </div>
            <p className="mt-6 text-center text-xs opacity-50">Paired · {paired ?? 'this household'}</p>
          </section>
        )}
      </div>
    </main>
  );
}
