'use client';

/**
 * KHAYAAL NEIGHBOUR — the rung of the ladder below the family.
 *
 * A neighbour sees one bit: all well, or SOS active. When it is active this
 * console becomes an alarm — full-screen on the dark token set (SOS context),
 * siren armed by tap (the browser only allows sound after a gesture), with
 * three actions: I'm responding, call the family, and silence-for-me (this
 * phone only — it never stands the household's SOS down, that is the family's
 * call).
 *
 * Joining takes the household's pairing code. There is no feed here, no
 * score, no trend, no room — a neighbour is trusted with "does someone need
 * to walk over", and with nothing else.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { IconHome, IconPhone, IconSpeaker } from '@/components/dashboard/icons';

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
  const elapsedS = status?.sos.sinceTs ? Math.max(0, Math.floor((nowTs - status.sos.sinceTs) / 1000)) : 0;
  const mm = String(Math.floor(elapsedS / 60)).padStart(2, '0');
  const ss = String(elapsedS % 60).padStart(2, '0');

  return (
    <main className={`min-h-screen transition-colors duration-300 ${sosActive ? 'theme-dark bg-[#141210] text-[#F2EEE8]' : 'bg-[#FAF8F5] text-[#1A1815]'}`}>
      <div className="mx-auto max-w-md px-5 py-10">
        <p className="t-meta opacity-60">Khayaal · Neighbour</p>

        {!hhId && (
          <section className="mt-8">
            <h1 className="t-display text-[34px]">Be the nearby answer</h1>
            <p className="mt-3 text-[15px] leading-relaxed opacity-70">
              Enter the family&apos;s pairing code and you will hear their alarm if it ever rings. You see one
              thing only — whether someone needs to walk over. Never their day.
            </p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="mt-6 w-full rounded-lg border border-[#D6CFC4] bg-white px-4 py-3 text-[15px] outline-none focus:border-[#B4451C]"
            />
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-digit pairing code"
              inputMode="numeric"
              className="mt-2.5 w-full rounded-lg border border-[#D6CFC4] bg-white px-4 py-3 font-mono text-lg tracking-[0.3em] outline-none focus:border-[#B4451C]"
            />
            <button
              onClick={pair}
              disabled={busy !== null || code.length !== 6}
              className="btn-primary mt-4 w-full"
            >
              {busy === 'pair' ? 'Joining…' : 'Join this family'}
            </button>
            {error && <p className="mt-3 text-[15px] text-[#B3261E]">{error}</p>}
            <p className="mt-8 text-center text-[13px] opacity-50">
              <Link href="/" className="underline">What is Khayaal?</Link>
            </p>
          </section>
        )}

        {hhId && !status && <p className="mt-10 text-[15px] opacity-60">Connecting…</p>}

        {status && (
          <section className="mt-8">
            <h1 className="t-section text-[26px]">{status.householdName}</h1>
            <div className="ledger-row mt-4 rounded-lg border border-[#E7E2DA] bg-white px-4 py-3 text-[15px] dark:border-[#2C2823] dark:bg-[#1E1B18]">
              <span className="opacity-70">On duty</span>
              <button
                onClick={() => setOnDuty(!onDuty)}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                  onDuty ? 'bg-[#2F6B4F] text-[#FFF7F0]' : 'bg-[#E7E2DA] text-[#57534E]'
                }`}
              >
                <span className="dot" style={{ background: onDuty ? '#FFF7F0' : '#8A857D' }} aria-hidden />
                {onDuty ? 'Available' : 'Off duty'}
              </button>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed opacity-50">
              Off duty only silences this phone — the family is not told. Your availability is your business.
            </p>

            {!sosActive && (
              <div className="mt-8 rounded-lg border border-[#E7E2DA] bg-white p-8 text-center">
                <IconHome className="mx-auto h-8 w-8 text-[#2F6B4F]" aria-hidden />
                <p className="t-section mt-3 text-[22px]">All well today</p>
                <p className="mt-1 text-[15px] opacity-60">{status.status}</p>
              </div>
            )}

            {sosActive && (
              <div className="mt-6 rounded-lg border border-[#3B362F] bg-[#1E1B18] p-7 text-center">
                <p className="t-meta text-[#E5645C]">
                  {status.sos.origin === 'button' ? 'Button pressed' : 'Automatic'}
                </p>
                <h2 className="t-display mt-2 text-[56px] text-[#F2EEE8]">SOS</h2>
                <p className="mt-2 font-mono text-[15px] tabular-nums text-[#E5645C]">
                  T+{mm}:{ss} since raised
                </p>
                <p className="mt-2 text-[15px] text-[#A8A29E]">
                  {status.parentName} raised the alarm — {status.sos.sinceTs ? fmtAgo(status.sos.sinceTs, nowTs) : 'just now'}
                </p>
                {status.sos.ack && (
                  <p className="mt-2 inline-flex items-center gap-2 text-[15px] text-[#F2EEE8]">
                    <span className="dot bg-[#7FB89B]" aria-hidden />
                    {status.sos.ack.by} is responding.
                  </p>
                )}

                {ringing && !armed && (
                  <button onClick={startSiren} className="btn-sos mt-5">
                    <IconSpeaker className="h-4 w-4" />
                    Tap to sound the siren
                  </button>
                )}
                {ringing && armed && (
                  <p className="mt-5 inline-flex items-center gap-2 text-[15px] font-semibold text-[#E5645C]">
                    <span className="dot bg-[#E5645C]" aria-hidden />
                    Siren sounding
                  </p>
                )}
                {ringing && (
                  <button onClick={() => setSilenced(true)} className="mt-2 w-full rounded-lg border border-[#3B362F] px-5 py-2 text-[13px] opacity-80 transition-colors hover:border-[#A8A29E]">
                    Silence on this phone only
                  </button>
                )}

                <button
                  onClick={() => act('respond')}
                  disabled={busy !== null}
                  className="mt-4 w-full rounded-lg bg-[#F2EEE8] px-5 py-3 text-[15px] font-semibold text-[#141210] transition-transform hover:scale-[0.98] disabled:opacity-40"
                >
                  {busy === 'respond' ? 'Recording…' : "I'm responding"}
                </button>
                {status.contacts.length > 0 && (
                  <div className="mt-3 grid gap-2">
                    {status.contacts.map((c) => (
                      <a
                        key={c.phone}
                        href={`tel:${c.phone}`}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#3B362F] px-5 py-2.5 text-[15px] font-semibold text-[#F2EEE8] transition-colors hover:border-[#A8A29E]"
                      >
                        <IconPhone className="h-4 w-4" />
                        Call {c.name}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mt-8 rounded-lg border border-[#E7E2DA] bg-white p-6 dark:border-[#2C2823] dark:bg-[#1E1B18]">
              <p className="t-meta opacity-50">If you go</p>
              <ol className="mt-3">
                {CHECKLIST.map((step, i) => (
                  <li key={step} className="flex items-baseline gap-3 border-b border-[#E7E2DA] py-2.5 text-[15px] leading-relaxed last:border-b-0 dark:border-[#2C2823]">
                    <span className="font-mono text-[13px] opacity-50">0{i + 1}</span>
                    <span className="opacity-80">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
            <p className="mt-6 text-center font-mono text-[13px] opacity-50">Paired · {paired ?? 'this household'}</p>
          </section>
        )}
      </div>
    </main>
  );
}
