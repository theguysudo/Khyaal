'use client';

/**
 * Onboarding: a child creates the household, tells Khayaal about the parent,
 * and receives the pairing code the parent's phone will enter (Phase 2 app).
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { postJSON } from '@/lib/api';

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<'form' | 'done'>('form');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; pairingCode: string; parentName: string } | null>(null);

  const [parentName, setParentName] = useState('');
  const [childName, setChildName] = useState('');
  const [wakeHour, setWakeHour] = useState(7);
  const [wakeMinute, setWakeMinute] = useState(15);
  const [chargeHour, setChargeHour] = useState(22);
  const [quietStart, setQuietStart] = useState(22);
  const [quietEnd, setQuietEnd] = useState(6);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await postJSON<{ household: { id: string; pairingCode: string; parentName: string } }>('/api/v1/pair', {
        action: 'create',
        parentName,
        childName,
        wakeHour: wakeHour + wakeMinute / 60,
        chargeStartHour: chargeHour,
        quietStart,
        quietEnd,
      });
      setCreated(r.household);
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-paper px-4 py-10 sm:px-8" style={{ background: 'linear-gradient(180deg, #f3ecdf 0%, #faf6ef 30%)' }}>
      <div className="mx-auto max-w-xl">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="font-heading text-lg tracking-tight text-ink">Khayaal</span>
            <span className="text-clay">✳︎</span>
          </Link>
          <Link href="/demo" className="text-sm text-ink/50 transition-opacity hover:opacity-70">
            just exploring? try the demo →
          </Link>
        </header>

        {step === 'form' ? (
          <section className="mt-10">
            <h1 className="font-heading text-[clamp(28px,4vw,38px)] leading-tight tracking-tight text-ink">
              Who are we keeping in mind?
            </h1>
            <p className="mt-2 text-[15px] text-ink/60">
              Two minutes now, and Khayaal knows her ordinary. Nothing here ever asks anything of her.
            </p>

            <div className="mt-8 space-y-5 rounded-3xl border border-ink/10 bg-white p-7 shadow-[0_2px_20px_rgba(42,36,29,0.05)]">
              <Field label="Her name" hint="What the family calls her">
                <input value={parentName} onChange={(e) => setParentName(e.target.value)} placeholder="Amma" className="kh-input" />
              </Field>
              <Field label="Your name" hint="Shown on acknowledgements">
                <input value={childName} onChange={(e) => setChildName(e.target.value)} placeholder="Aditya" className="kh-input" />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="She usually wakes around" hint="Learns the true time within days">
                  <div className="flex gap-2">
                    <select value={wakeHour} onChange={(e) => setWakeHour(+e.target.value)} className="kh-input">
                      {Array.from({ length: 12 }, (_, i) => i + 4).map((h) => (
                        <option key={h} value={h}>{h} AM</option>
                      ))}
                    </select>
                    <select value={wakeMinute} onChange={(e) => setWakeMinute(+e.target.value)} className="kh-input">
                      {[0, 15, 30, 45].map((m) => (
                        <option key={m} value={m}>:{String(m).padStart(2, '0')}</option>
                      ))}
                    </select>
                  </div>
                </Field>
                <Field label="Phone goes on charge around" hint="The overnight signal">
                  <select value={chargeHour} onChange={(e) => setChargeHour(+e.target.value)} className="kh-input">
                    {Array.from({ length: 6 }, (_, i) => i + 19).map((h) => (
                      <option key={h} value={h}>{h > 12 ? h - 12 : h} PM</option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Quiet hours start" hint="No family alerts after this">
                  <select value={quietStart} onChange={(e) => setQuietStart(+e.target.value)} className="kh-input">
                    {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                      <option key={h} value={h}>{h}:00</option>
                    ))}
                  </select>
                </Field>
                <Field label="Quiet hours end" hint="Unless it is severe">
                  <select value={quietEnd} onChange={(e) => setQuietEnd(+e.target.value)} className="kh-input">
                    {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                      <option key={h} value={h}>{h}:00</option>
                    ))}
                  </select>
                </Field>
              </div>

              {error && <p className="text-sm text-[#b23a2f]">{error}</p>}
              <button
                onClick={submit}
                disabled={busy || !parentName.trim()}
                className="w-full rounded-full bg-ink py-3 text-[15px] font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {busy ? 'Setting things up…' : 'Create our household'}
              </button>
              <p className="text-center text-xs leading-relaxed text-ink/40">
                Khayaal asks her nothing. The only person who does anything here is you.
              </p>
            </div>
          </section>
        ) : (
          created && (
            <section className="mt-10 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#e6efe2] text-3xl">🌼</div>
              <h1 className="mt-6 font-heading text-[clamp(28px,4vw,38px)] tracking-tight text-ink">
                {created.parentName} is being looked after.
              </h1>
              <p className="mt-3 text-[15px] text-ink/60">
                For the first hours Khayaal only listens and learns — no scores, no alerts, no noise.
              </p>

              <div className="mx-auto mt-8 max-w-sm rounded-3xl border border-ink/10 bg-white p-7 shadow-[0_2px_20px_rgba(42,36,29,0.05)]">
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink/45">Pairing code for her phone</p>
                <p className="mt-3 font-heading text-4xl tracking-[0.2em] text-clay">{created.pairingCode}</p>
                <p className="mt-3 text-xs leading-relaxed text-ink/45">
                  The Android app (Phase 2) asks for this code once. Everything after that is silent.
                </p>
              </div>

              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link href={`/household/${created.id}`} className="rounded-full bg-ink px-6 py-2.5 text-sm text-paper transition-opacity hover:opacity-90">
                  Open the family dashboard
                </Link>
                <Link href="/demo" className="rounded-full border border-ink/15 px-6 py-2.5 text-sm text-ink/70 transition-colors hover:bg-white">
                  Try the demo console
                </Link>
              </div>
            </section>
          )
        )}
      </div>

      <style jsx global>{`
        .kh-input {
          width: 100%;
          border-radius: 14px;
          border: 1px solid rgba(42, 36, 29, 0.15);
          background: #faf6ef;
          padding: 10px 14px;
          font-size: 14px;
          color: #2a241d;
          outline: none;
          transition: border-color 0.15s;
        }
        .kh-input:focus { border-color: #b95c38; }
      `}</style>
    </main>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-ink/80">{label}</span>
      {hint && <span className="ml-2 text-xs text-ink/40">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
