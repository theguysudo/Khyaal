'use client';

/**
 * Onboarding: a child creates the household, tells Khayaal about the parent,
 * and receives the pairing code the parent's phone will enter (Phase 2 app).
 * The server's LAN address is shown next to the code — 10.0.2.2 only works
 * inside the Android emulator; a physical phone needs this address.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { postJSON } from '@/lib/api';

function AuthButtons() {
  const [me, setMe] = useState<{ name: string } | null>(null);
  useEffect(() => {
    fetch('/api/v1/my/households', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setMe(d.user))
      .catch(() => {});
  }, []);
  if (me) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="hidden text-ink/50 sm:inline">signed in as {me.name.split(' ')[0]}</span>
        <Link href="/login" className="rounded-full border border-ink/15 bg-white px-4 py-1.5 text-ink/70 transition-colors hover:bg-mist">
          Your families
        </Link>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <a href="/api/auth/google/start?mode=signup" className="rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-paper transition-opacity hover:opacity-90">
        Sign up
      </a>
      <a href="/api/auth/google/start" className="rounded-full border border-ink/15 bg-white px-4 py-1.5 text-sm text-ink/70 transition-colors hover:bg-mist">
        Login
      </a>
    </div>
  );
}

interface MyFamilies {
  user: { sub: string; name: string } | null;
  households: { id: string; parentName: string }[];
}

/** Signed-out visitors see this instead of the form — families belong to a
 *  Google account so a returning sign-in lands straight back in theirs. */
function SignInFirst({ welcome }: { welcome: boolean }) {
  return (
    <section className="mt-10 rounded-3xl border border-ink/10 bg-white p-8 text-center shadow-[0_2px_20px_rgba(42,36,29,0.05)]">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#e6efe2] text-2xl">🌼</div>
      <h2 className="mt-5 font-heading text-[clamp(22px,3vw,28px)] tracking-tight text-ink">
        {welcome ? 'Welcome to Khayaal.' : 'First, sign in with Google.'}
      </h2>
      <p className="mx-auto mt-3 max-w-sm text-[14.5px] leading-relaxed text-ink/60">
        {welcome
          ? 'Your account is ready. A few questions about her days, and Khayaal takes it from there. Everything about her stays with this account.'
          : 'Your families live with your Google account. Sign up once, and every sign-in after this lands you straight back in them.'}
      </p>
      <a
        href="/api/auth/google/start?mode=signup"
        className="mt-6 inline-flex items-center justify-center gap-3 rounded-full border border-ink/15 bg-white px-6 py-3 text-[15px] font-medium text-ink shadow-[0_2px_20px_rgba(42,36,29,0.06)] transition-transform hover:-translate-y-0.5"
      >
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.7-.4-3.9z" />
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.7l6.2 5.2C41.4 35.4 44 30.2 44 24c0-1.3-.1-2.7-.4-3.9z" />
        </svg>
        Sign up with Google
      </a>
      <p className="mt-4 text-xs text-ink/40">
        Already have a family? <a href="/api/auth/google/start" className="underline decoration-ink/20 underline-offset-2 hover:text-ink">Log in instead</a> — you'll be taken straight to it.
      </p>
    </section>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<'form' | 'done'>('form');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; pairingCode: string; parentName: string } | null>(null);
  const [lanBaseUrl, setLanBaseUrl] = useState<string | null>(null);
  const [families, setFamilies] = useState<MyFamilies | null>(null);
  const [welcome, setWelcome] = useState(false);

  // The address a physical phone needs: this machine's LAN IP, not localhost.
  useEffect(() => {
    fetch('/api/v1/server-info')
      .then((r) => r.json())
      .then((d) => setLanBaseUrl(d.lanBaseUrl ?? null))
      .catch(() => {});
    fetch('/api/v1/my/households', { cache: 'no-store' })
      .then((r) => r.json())
      .then(setFamilies)
      .catch(() => {});
    if (new URLSearchParams(window.location.search).get('welcome') === '1') setWelcome(true);
  }, []);

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
          {/* Sign up / Login — offered before anyone registers a family */}
          <AuthButtons />
        </header>

        {step === 'form' ? (
          families && !families.user ? (
            <SignInFirst welcome={welcome} />
          ) : (
          <section className="mt-10">
            <h1 className="font-heading text-[clamp(28px,4vw,38px)] leading-tight tracking-tight text-ink">
              Who are we keeping in mind?
            </h1>
            <p className="mt-2 text-[15px] text-ink/60">
              Two minutes now, and Khayaal knows her ordinary. Nothing here ever asks anything of her.
            </p>

            {families && families.households.length > 0 && (
              <div className="mt-6 space-y-2">
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink/45">Your families</p>
                {families.households.map((hh) => (
                  <Link
                    key={hh.id}
                    href={`/household/${hh.id}`}
                    className="flex items-center justify-between rounded-2xl border border-ink/10 bg-white px-5 py-3.5 transition-transform hover:-translate-y-0.5"
                  >
                    <span className="font-heading text-[15px] text-ink">The {hh.parentName} household</span>
                    <span className="text-clay">→</span>
                  </Link>
                ))}
                <p className="pt-1 text-xs text-ink/40">…or set up another one below.</p>
              </div>
            )}

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
          )
        ) : (
          created && (
            <section className="mt-10 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#e6efe2] text-3xl">🌼</div>
              <h1 className="mt-6 font-heading text-[clamp(28px,4vw,38px)] tracking-tight text-ink">
                {created.parentName} is being looked after.
              </h1>
              <p className="mt-3 text-[15px] text-ink/60">
                Scoring starts right away — Khayaal seeds her rhythm from what you
                told us and keeps learning from every ordinary day.
              </p>

              <div className="mx-auto mt-8 max-w-sm rounded-3xl border border-ink/10 bg-white p-7 shadow-[0_2px_20px_rgba(42,36,29,0.05)]">
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink/45">Pairing code for her phone</p>
                <p className="mt-3 font-heading text-4xl tracking-[0.2em] text-clay">{created.pairingCode}</p>
                {lanBaseUrl && (
                  <>
                    <p className="mt-5 text-[12px] font-semibold uppercase tracking-[0.14em] text-ink/45">Server address for the app</p>
                    <p className="mt-2 cursor-pointer rounded-lg bg-paper px-3 py-2 font-mono text-sm text-ink/80 transition-colors hover:bg-mist"
                       title="Tap to copy"
                       onClick={() => navigator.clipboard?.writeText(lanBaseUrl)}>
                      {lanBaseUrl}
                    </p>
                    <p className="mt-3 text-xs leading-relaxed text-ink/45">
                      The app pre-fills <span className="font-mono">10.0.2.2:3100</span> — that only works on the
                      Android emulator. On her physical phone, replace it with the address above
                      (phone and this computer on the same Wi-Fi).
                    </p>
                    <a
                      href="/khayaal-debug.apk"
                      className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-paper transition-opacity hover:opacity-90"
                    >
                      ⬇ Install the app on this phone
                    </a>
                    <p className="mt-2 text-[11px] leading-relaxed text-ink/40">
                      Open this page in her phone's browser → tap install → allow "unknown apps".
                    </p>
                  </>
                )}
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
