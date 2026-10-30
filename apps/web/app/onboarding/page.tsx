'use client';

/**
 * Onboarding — the numbered guided scenario ("The Quiet Ledger").
 *
 *   01 — SIGN IN       Google OAuth-first: the family stays with the account.
 *   02 — THE HOUSEHOLD  who she is, and the shape of her ordinary day.
 *   03 — THE WATCHERS   her phone (required), the room sensor, a neighbour.
 *   04 — FIRST LOOK     the serif verdict, then straight into the dashboard.
 *
 * Progress is checkpointed in localStorage keyed by household id, so a
 * half-finished setup resumes where it left off. Every API contract is the
 * pre-existing one: POST /api/v1/pair {action:'create'}, GET
 * /api/v1/household/{id}/pairing-code, POST .../sensor/connect (the relay
 * checks the sensor in automatically — nobody ever opens a terminal), and
 * GET /api/v1/server-info for the LAN address her phone pairs against.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fmtAgo, postJSON, useHouseholdState } from '@/lib/api';
import './onboarding.css';

const STEPS = [
  { key: 'signin', index: '01', label: 'Sign in' },
  { key: 'household', index: '02', label: 'The household' },
  { key: 'watchers', index: '03', label: 'The watchers' },
  { key: 'firstlook', index: '04', label: 'First look' },
] as const;
type StepKey = (typeof STEPS)[number]['key'];

interface SessionData {
  user: { sub: string; name: string; email: string; picture?: string } | null;
  households: { id: string; parentName: string; createdAtTs: number }[];
}

interface Household {
  id: string;
  parentName: string;
  pairingCode: string;
}

/** Resume checkpoint, keyed by household id. */
const CK_KEY = 'kh_onboarding_v1';
interface Checkpoint {
  parentName: string;
  pairingCode: string;
  completed: StepKey[];
  ts: number;
}
type Checkpoints = Record<string, Checkpoint>;

function loadCheckpoints(): Checkpoints {
  try {
    const raw = window.localStorage.getItem(CK_KEY);
    return raw ? (JSON.parse(raw) as Checkpoints) : {};
  } catch {
    return {};
  }
}

function saveCheckpoint(hhId: string, next: Checkpoint) {
  try {
    const all = loadCheckpoints();
    all[hhId] = next;
    window.localStorage.setItem(CK_KEY, JSON.stringify(all));
  } catch {
    /* private mode — resume simply won't work */
  }
}

function clearCheckpoint(hhId: string) {
  try {
    const all = loadCheckpoints();
    delete all[hhId];
    window.localStorage.setItem(CK_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

export default function OnboardingPage() {
  const [step, setStep] = useState<StepKey>('signin');
  const [session, setSession] = useState<SessionData | undefined>(undefined);
  const [welcome, setWelcome] = useState(false);
  const [hh, setHh] = useState<Household | null>(null);
  const [checkpoints, setCheckpoints] = useState<Checkpoints>({});

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('welcome') === '1') setWelcome(true);
    setCheckpoints(loadCheckpoints());
    fetch('/api/v1/my/households', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: SessionData) => setSession(d))
      .catch(() => setSession({ user: null, households: [] }));
  }, []);

  const signedIn = !!session?.user;

  // Guards: nobody walks past sign-in, and no step past 02 without a household.
  const active: StepKey = useMemo(() => {
    if (session !== undefined && !signedIn) return 'signin';
    if (!hh && (step === 'watchers' || step === 'firstlook')) return 'household';
    return step;
  }, [session, signedIn, step, hh]);

  // The freshest checkpoint for a household this account actually owns.
  const resume = useMemo(() => {
    if (!signedIn || !session) return null;
    const mine = session.households.map((h) => h.id);
    const entries = Object.entries(checkpoints).filter(([id]) => mine.includes(id));
    if (entries.length === 0) return null;
    const [id, ck] = entries.sort((a, b) => b[1].ts - a[1].ts)[0];
    return { id, ck };
  }, [signedIn, session, checkpoints]);

  const startFresh = () => {
    if (resume) {
      clearCheckpoint(resume.id);
      setCheckpoints(loadCheckpoints());
    }
  };

  const resumeRun = () => {
    if (!resume) return;
    setHh({ id: resume.id, parentName: resume.ck.parentName, pairingCode: resume.ck.pairingCode });
    const done = resume.ck.completed;
    setStep(done.includes('watchers') ? 'firstlook' : 'watchers');
  };

  const stepIndex = (k: StepKey) => STEPS.findIndex((s) => s.key === k);

  return (
    <main className="onb">
      <div className="onb-wrap">
        <header className="onb-topbar">
          <Link href="/" className="onb-wordmark">
            Khayaal
          </Link>
          <Link href="/login" className="onb-toplink">
            Your families
          </Link>
        </header>

        {/* Persistent progress indicator */}
        <nav className="onb-progress" aria-label="Onboarding progress">
          {STEPS.map((s) => {
            const si = stepIndex(s.key);
            const ai = stepIndex(active);
            const state = si < ai ? 'done' : si === ai ? 'current' : 'todo';
            return (
              <button
                key={s.key}
                type="button"
                className="onb-progress-item"
                data-state={state}
                data-clickable={state === 'done' && (s.key !== 'watchers' || !!hh)}
                onClick={state === 'done' ? () => setStep(s.key) : undefined}
                aria-current={state === 'current' ? 'step' : undefined}
              >
                <span className="onb-progress-index">{s.index}</span>
                <span className="onb-progress-label">{s.label}</span>
              </button>
            );
          })}
        </nav>

        {resume && !hh && active !== 'firstlook' && (
          <div className="onb-note onb-rise" data-tone="signal" style={{ marginTop: 20 }} role="status">
            <span className="onb-status" data-tone="signal">
              <span className="onb-dot" />
              Saved
            </span>
            <div className="onb-notebody">
              <p className="onb-notetitle">Halfway done</p>
              <p style={{ margin: 0 }}>
                You were setting up {resume.ck.parentName}&rsquo;s household. Pick up where you
                left off, or start the questions again.
              </p>
              <div className="onb-actions" style={{ marginTop: 12 }}>
                <button type="button" className="btn-secondary" onClick={resumeRun}>
                  Resume
                </button>
                <button type="button" className="btn-ghost" onClick={startFresh}>
                  Start fresh
                </button>
              </div>
            </div>
          </div>
        )}

        {active === 'signin' && (
          <SignInStep
            session={session}
            welcome={welcome}
            onContinue={() => setStep('household')}
          />
        )}

        {active === 'household' && (
          <HouseholdStep
            session={session}
            onCreated={(created) => {
              setHh(created);
              saveCheckpoint(created.id, {
                parentName: created.parentName,
                pairingCode: created.pairingCode,
                completed: ['signin', 'household'],
                ts: Date.now(),
              });
              setCheckpoints(loadCheckpoints());
              setStep('watchers');
            }}
            onNeedSignIn={() => setStep('signin')}
          />
        )}

        {active === 'watchers' && hh && (
          <WatchersStep
            hh={hh}
            onContinue={() => {
              saveCheckpoint(hh.id, {
                parentName: hh.parentName,
                pairingCode: hh.pairingCode,
                completed: ['signin', 'household', 'watchers'],
                ts: Date.now(),
              });
              setCheckpoints(loadCheckpoints());
              setStep('firstlook');
            }}
          />
        )}

        {active === 'firstlook' && hh && (
          <FirstLookStep hh={hh} onBack={() => setStep('watchers')} />
        )}

        <footer className="onb-footer">
          <p className="onb-meta">
            Khayaal asks her nothing. The only person who does anything here is you.
          </p>
        </footer>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// 01 — SIGN IN
// ---------------------------------------------------------------------------

function SignInStep({
  session,
  welcome,
  onContinue,
}: {
  session: SessionData | undefined;
  welcome: boolean;
  onContinue: () => void;
}) {
  return (
    <section className="onb-rise" style={{ '--d': '60ms' } as React.CSSProperties}>
      <div className="onb-sechead">
        <span className="onb-secindex">01</span>
        <span className="onb-seclabel">Sign in</span>
        <span className="onb-secrule" />
      </div>

      {session === undefined ? (
        <p className="onb-meta onb-mono">···</p>
      ) : session.user ? (
        <>
          <h1 className="onb-h1" style={{ marginTop: 24 }}>
            You&rsquo;re signed in.
          </h1>
          <p className="onb-body" style={{ marginTop: 8 }}>
            Everything about her stays with this account — no one else ever sees it.
          </p>
          <div className="onb-panel" style={{ marginTop: 24 }}>
            <div className="onb-row">
              <span className="onb-rowlabel">Signed in as</span>
              <span className="onb-rowvalue">{session.user.name}</span>
            </div>
            <div className="onb-row">
              <span className="onb-rowlabel">Account</span>
              <span className="onb-rowvalue">{session.user.email}</span>
            </div>
          </div>
          <div className="onb-actions" style={{ marginTop: 24 }}>
            <button type="button" className="btn-primary" onClick={onContinue}>
              Continue
            </button>
          </div>
        </>
      ) : (
        <>
          <h1 className="onb-h1" style={{ marginTop: 24 }}>
            First, a Google sign-in.
          </h1>
          <p className="onb-body" style={{ marginTop: 8 }}>
            The family stays with the account — sign in once, and every sign-in after this
            lands you straight back with her.
          </p>
          {welcome && (
            <div className="onb-note" data-tone="calm" style={{ marginTop: 20 }} role="status">
              <span className="onb-status" data-tone="calm">
                <span className="onb-dot" />
                Ready
              </span>
              <div className="onb-notebody">
                <p style={{ margin: 0 }}>
                  Your account is ready. A few questions about her days, and Khayaal takes it
                  from there.
                </p>
              </div>
            </div>
          )}
          <div className="onb-actions" style={{ marginTop: 24 }}>
            <a href="/api/auth/google/start?mode=signup" className="btn-primary">
              Continue with Google
            </a>
          </div>
          <p className="onb-meta" style={{ marginTop: 16 }}>
            Setting up a family that already exists?{' '}
            <a href="/api/auth/google/start" style={{ color: 'var(--ink)' }}>
              Log in instead
            </a>{' '}
            — you&rsquo;ll be taken straight to it.
          </p>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// 02 — THE HOUSEHOLD
// ---------------------------------------------------------------------------

function HouseholdStep({
  session,
  onCreated,
  onNeedSignIn,
}: {
  session: SessionData | undefined;
  onCreated: (hh: Household) => void;
  onNeedSignIn: () => void;
}) {
  const [parentName, setParentName] = useState('');
  const [childName, setChildName] = useState('');
  const [wakeHour, setWakeHour] = useState(7);
  const [wakeMinute, setWakeMinute] = useState(15);
  const [chargeHour, setChargeHour] = useState(22);
  const [quietStart, setQuietStart] = useState(22);
  const [quietEnd, setQuietEnd] = useState(6);
  const [nameError, setNameError] = useState<string | null>(null);
  const [quietError, setQuietError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ title: string; body: string; auth?: boolean } | null>(
    null,
  );

  const submit = async () => {
    if (!parentName.trim()) {
      setNameError('A name to call her — a nickname is fine.');
      return;
    }
    setNameError(null);
    if (quietStart === quietEnd) {
      setQuietError('Quiet hours can’t start and end at the same time.');
      return;
    }
    setQuietError(null);
    setBusy(true);
    setFailure(null);
    try {
      const r = await postJSON<{ household: Household }>('/api/v1/pair', {
        action: 'create',
        parentName,
        childName,
        wakeHour: wakeHour + wakeMinute / 60,
        chargeStartHour: chargeHour,
        quietStart,
        quietEnd,
      });
      onCreated(r.household);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong';
      if (msg.includes('Sign in')) {
        setFailure({
          title: 'One step missing',
          body: 'The family belongs to a Google account. Sign in first, then we’ll set it up.',
          auth: true,
        });
      } else {
        setFailure({
          title: 'We couldn’t reach the server',
          body: 'Nothing was created yet. Check the connection and try again.',
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const hourLabel = (h: number) => (h === 24 ? '12 AM' : h >= 12 ? `${h - 12} PM` : `${h} AM`);

  return (
    <section className="onb-rise" style={{ '--d': '60ms' } as React.CSSProperties}>
      <div className="onb-sechead">
        <span className="onb-secindex">02</span>
        <span className="onb-seclabel">The household</span>
        <span className="onb-secrule" />
      </div>

      <h1 className="onb-h1" style={{ marginTop: 24 }}>
        Who are we keeping in mind?
      </h1>
      <p className="onb-body" style={{ marginTop: 8 }}>
        Two minutes now, and Khayaal knows her ordinary. Nothing here ever asks anything of her.
      </p>

      {session?.households && session.households.length > 0 && (
        <div className="onb-panel" style={{ marginTop: 24 }}>
          <div className="onb-rows">
            {session.households.map((h) => (
              <div className="onb-row" key={h.id}>
                <Link href={`/household/${h.id}`} className="onb-rowlink">
                  <span>The {h.parentName} household</span>
                  <span className="onb-mono" style={{ color: 'var(--ink-3)' }}>
                    {new Date(h.createdAtTs).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                    })}
                    {' →'}
                  </span>
                </Link>
              </div>
            ))}
          </div>
          <p className="onb-meta" style={{ marginTop: 12 }}>
            …or set up another one below.
          </p>
        </div>
      )}

      <div className="onb-panel onb-stack" style={{ marginTop: 24 }}>
        <label className="onb-field">
          <span className="onb-fieldlabel">
            Her name
            <span className="onb-fieldhint">What the family calls her</span>
          </span>
          <input
            value={parentName}
            onChange={(e) => {
              setParentName(e.target.value);
              if (nameError) setNameError(null);
            }}
            placeholder="Amma"
            className="onb-input"
            aria-invalid={nameError ? 'true' : undefined}
            autoComplete="off"
          />
          {nameError && (
            <span className="onb-fielderror">
              <span className="onb-dot" style={{ background: 'var(--alarm)' }} />
              {nameError}
            </span>
          )}
        </label>

        <label className="onb-field">
          <span className="onb-fieldlabel">
            Your name
            <span className="onb-fieldhint">Shown on acknowledgements</span>
          </span>
          <input
            value={childName}
            onChange={(e) => setChildName(e.target.value)}
            placeholder="Aditya"
            className="onb-input"
            autoComplete="off"
          />
        </label>

        <div className="onb-grid2">
          <label className="onb-field">
            <span className="onb-fieldlabel">
              She wakes around
              <span className="onb-fieldhint">Learns the true time</span>
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                value={wakeHour}
                onChange={(e) => setWakeHour(+e.target.value)}
                className="onb-input"
                aria-label="Wake hour"
              >
                {Array.from({ length: 8 }, (_, i) => i + 4).map((h) => (
                  <option key={h} value={h}>
                    {h} AM
                  </option>
                ))}
              </select>
              <select
                value={wakeMinute}
                onChange={(e) => setWakeMinute(+e.target.value)}
                className="onb-input"
                aria-label="Wake minute"
              >
                {[0, 15, 30, 45].map((m) => (
                  <option key={m} value={m}>
                    :{String(m).padStart(2, '0')}
                  </option>
                ))}
              </select>
            </div>
          </label>

          <label className="onb-field">
            <span className="onb-fieldlabel">
              Phone charges at
              <span className="onb-fieldhint">The overnight signal</span>
            </span>
            <select
              value={chargeHour}
              onChange={(e) => setChargeHour(+e.target.value)}
              className="onb-input"
            >
              {Array.from({ length: 6 }, (_, i) => i + 19).map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="onb-grid2">
          <label className="onb-field">
            <span className="onb-fieldlabel">
              Quiet hours start
              <span className="onb-fieldhint">No family alerts after</span>
            </span>
            <select
              value={quietStart}
              onChange={(e) => {
                setQuietStart(+e.target.value);
                if (quietError) setQuietError(null);
              }}
              className="onb-input"
              aria-invalid={quietError ? 'true' : undefined}
            >
              {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </label>

          <label className="onb-field">
            <span className="onb-fieldlabel">
              Quiet hours end
              <span className="onb-fieldhint">Unless it is severe</span>
            </span>
            <select
              value={quietEnd}
              onChange={(e) => {
                setQuietEnd(+e.target.value);
                if (quietError) setQuietError(null);
              }}
              className="onb-input"
              aria-invalid={quietError ? 'true' : undefined}
            >
              {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </label>
        </div>
        {quietError && (
          <span className="onb-fielderror">
            <span className="onb-dot" style={{ background: 'var(--alarm)' }} />
            {quietError}
          </span>
        )}

        {failure && (
          <div className="onb-note" data-tone="alarm" role="alert">
            <span className="onb-status" data-tone="alarm">
              <span className="onb-dot" />
              Held
            </span>
            <div className="onb-notebody">
              <p className="onb-notetitle">{failure.title}</p>
              <p style={{ margin: 0 }}>{failure.body}</p>
              {failure.auth && (
                <div className="onb-actions" style={{ marginTop: 12 }}>
                  <button type="button" className="btn-secondary" onClick={onNeedSignIn}>
                    Back to sign in
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="btn-primary btn-block"
        >
          {busy ? 'Setting things up…' : 'Create our household'}
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 03 — THE WATCHERS
// ---------------------------------------------------------------------------

function WatchersStep({ hh, onContinue }: { hh: Household; onContinue: () => void }) {
  // One poll drives every status on this step: sources carry lastSeenTs, and
  // the household's pairing code is re-read fresh (family access).
  const { bundle } = useHouseholdState(hh.id, 3000);
  const [liveCode, setLiveCode] = useState<string | null>(null);
  const [lanBaseUrl, setLanBaseUrl] = useState<string | null>(null);
  const [sensorState, setSensorState] = useState<
    'idle' | 'connecting' | 'listening' | 'failed'
  >('idle');
  const [sensorNote, setSensorNote] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/v1/household/${hh.id}/pairing-code`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setLiveCode(d.pairingCode))
      .catch(() => {});
    fetch('/api/v1/server-info', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setLanBaseUrl(d.lanBaseUrl ?? null))
      .catch(() => {});
  }, [hh.id]);

  const sources = bundle?.sources ?? [];
  const phone = sources.find((s) => s.type === 'phone');
  const sensor = sources.find((s) => s.type === 'esp32' && s.lastSeenTs !== null);
  const neighbour = sources.find((s) => s.type === 'neighbour');
  const nowTs = bundle?.realNowTs ?? Date.now();

  const code = liveCode ?? hh.pairingCode;

  const copy = (what: string, value: string) => {
    navigator.clipboard?.writeText(value).then(
      () => {
        setCopied(what);
        window.setTimeout(() => setCopied(null), 1600);
      },
      () => {},
    );
  };

  const connectSensor = async () => {
    setSensorState('connecting');
    setSensorNote(null);
    try {
      await postJSON(`/api/v1/household/${hh.id}/sensor/connect`, {});
      setSensorState('listening');
      setSensorNote(
        'Plug the sensor into this laptop via USB — it checks in by itself, usually within a minute. There is nothing to type or run.',
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong';
      setSensorState('failed');
      setSensorNote(
        msg.includes('Slow down')
          ? 'One moment — we just woke the sensor service. Try again in a minute.'
          : 'We couldn’t start the sensor listener just now. You can try again, or connect the sensor later from the dashboard — nothing else depends on it.',
      );
    }
  };

  const sensorConnected = !!sensor;
  const sensorStatusTone = sensorConnected ? 'calm' : sensorState === 'failed' ? 'alarm' : 'watch';
  const sensorStatusWord = sensorConnected
    ? `checked in · ${fmtAgo(sensor!.lastSeenTs, nowTs)}`
    : sensorState === 'listening'
      ? 'listening'
      : sensorState === 'connecting'
        ? 'connecting'
        : sensorState === 'failed'
          ? 'paused'
          : 'not connected';

  return (
    <section className="onb-rise" style={{ '--d': '60ms' } as React.CSSProperties}>
      <div className="onb-sechead">
        <span className="onb-secindex">03</span>
        <span className="onb-seclabel">The watchers</span>
        <span className="onb-secrule" />
      </div>

      <h1 className="onb-h1" style={{ marginTop: 24 }}>
        Give her watchers.
      </h1>
      <p className="onb-body" style={{ marginTop: 8 }}>
        One phone is all it takes. The sensor and a neighbour make the net finer — every one of
        them is optional except her phone.
      </p>

      {/* Her phone — the one required watcher */}
      <div className="onb-panel" style={{ marginTop: 24 }}>
        <div className="onb-row">
          <span className="onb-rowlabel">Her phone</span>
          <span className="onb-status" data-tone={phone?.lastSeenTs ? 'calm' : 'watch'}>
            <span className="onb-dot" />
            {phone?.lastSeenTs ? `checked in · ${fmtAgo(phone.lastSeenTs, nowTs)}` : 'waiting for her phone'}
          </span>
        </div>
        <div className="onb-row">
          <span className="onb-rowlabel">Pairing code</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="onb-code onb-mono" style={{ fontSize: 22 }}>
              {code}
            </span>
            <button
              type="button"
              className="btn-ghost onb-copybtn"
              onClick={() => copy('code', code)}
            >
              {copied === 'code' ? 'Copied' : 'Copy'}
            </button>
          </span>
        </div>
        {lanBaseUrl && (
          <div className="onb-row">
            <span className="onb-rowlabel">Server address</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="onb-rowvalue" style={{ fontSize: 13 }}>
                {lanBaseUrl}
              </span>
              <button
                type="button"
                className="btn-ghost onb-copybtn"
                onClick={() => copy('url', lanBaseUrl)}
              >
                {copied === 'url' ? 'Copied' : 'Copy'}
              </button>
            </span>
          </div>
        )}
        <div className="onb-row">
          <span className="onb-rowlabel">Her app</span>
          <a href="/khayaal-debug.apk" className="btn-secondary" style={{ minHeight: 40 }}>
            Install on this phone
          </a>
        </div>
        <p className="onb-meta" style={{ marginTop: 12 }}>
          Open this page in her phone&rsquo;s browser to install. The app asks for this code
          once — everything after that is silent. It pre-fills 10.0.2.2:3100, which only works
          inside the Android emulator; on her physical phone, use the server address above
          (both on the same Wi-Fi).
        </p>
      </div>

      {/* The room sensor — optional */}
      <div className="onb-panel" style={{ marginTop: 24 }}>
        <div className="onb-row">
          <span className="onb-rowlabel">Room sensor</span>
          <span className="onb-status" data-tone={sensorStatusTone}>
            <span className="onb-dot" />
            {sensorStatusWord}
          </span>
        </div>
        <p className="onb-body" style={{ marginTop: 12, fontSize: 15 }}>
          A small sensor that reads the room&rsquo;s stillness. Plug it into this laptop via
          USB and press connect — Khayaal introduces it to the household itself.
        </p>
        {!sensorConnected && (
          <div className="onb-actions" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={connectSensor}
              disabled={sensorState === 'connecting'}
            >
              {sensorState === 'connecting'
                ? 'Waking the sensor service…'
                : sensorState === 'listening'
                  ? 'Still listening'
                  : 'Connect the sensor'}
            </button>
          </div>
        )}
        {sensorState === 'listening' && !sensorConnected && (
          <div className="onb-note" data-tone="watch" style={{ marginTop: 16 }} role="status">
            <span className="onb-status" data-tone="watch">
              <span className="onb-dot" />
              Listening
            </span>
            <div className="onb-notebody">
              <p style={{ margin: 0 }}>{sensorNote}</p>
            </div>
          </div>
        )}
        {sensorConnected && (
          <div className="onb-note" data-tone="calm" style={{ marginTop: 16 }} role="status">
            <span className="onb-status" data-tone="calm">
              <span className="onb-dot" />
              Watching
            </span>
            <div className="onb-notebody">
              <p style={{ margin: 0 }}>
                The sensor checked in on its own. It is watching the room now.
              </p>
            </div>
          </div>
        )}
        {sensorState === 'failed' && (
          <div className="onb-note" data-tone="alarm" style={{ marginTop: 16 }} role="alert">
            <span className="onb-status" data-tone="alarm">
              <span className="onb-dot" />
              Paused
            </span>
            <div className="onb-notebody">
              <p style={{ margin: 0 }}>{sensorNote}</p>
            </div>
          </div>
        )}
      </div>

      {/* A neighbour — optional */}
      <div className="onb-panel" style={{ marginTop: 24 }}>
        <div className="onb-row">
          <span className="onb-rowlabel">A neighbour</span>
          <span className="onb-status" data-tone={neighbour ? 'calm' : 'idle'}>
            <span className="onb-dot" />
            {neighbour ? 'invited' : 'not invited'}
          </span>
        </div>
        <p className="onb-body" style={{ marginTop: 12, fontSize: 15 }}>
          When nobody in the family can answer, a neighbour can. They open one page on their
          own phone and enter the code — they see a single bit, is she okay or not, and they
          answer the call when the family can&rsquo;t.
        </p>
        <div className="onb-row" style={{ marginTop: 8 }}>
          <span className="onb-rowlabel">Their key in</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="onb-rowvalue" style={{ fontSize: 18, letterSpacing: '0.12em' }}>
              {code}
            </span>
            <button
              type="button"
              className="btn-ghost onb-copybtn"
              onClick={() => copy('nb', code)}
            >
              {copied === 'nb' ? 'Copied' : 'Copy'}
            </button>
          </span>
        </div>
        <div className="onb-row">
          <span className="onb-rowlabel">Their page</span>
          <a href="/neighbour" target="_blank" rel="noreferrer" className="onb-rowlink" style={{ width: 'auto' }}>
            <span>/neighbour →</span>
          </a>
        </div>
        <p className="onb-meta" style={{ marginTop: 12 }}>
          Send them the link while you&rsquo;re together — they pick their own name and pair
          with the code above.
        </p>
      </div>

      <div className="onb-actions" style={{ marginTop: 24 }}>
        <button type="button" className="btn-primary" onClick={onContinue}>
          Continue
        </button>
        <Link href={`/household/${hh.id}`} className="btn-ghost" style={{ minHeight: 40 }}>
          Add these later from the dashboard
        </Link>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 04 — FIRST LOOK
// ---------------------------------------------------------------------------

function FirstLookStep({ hh, onBack }: { hh: Household; onBack: () => void }) {
  const { bundle } = useHouseholdState(hh.id, 4000);
  const baseline = bundle?.baseline;
  const watcherCount = bundle?.sources.length ?? 0;

  const fmtHour = (h: number) => {
    const hh24 = Math.floor(h) % 24;
    const m = Math.round((h - Math.floor(h)) * 60);
    const label = hh24 === 0 ? '12 AM' : hh24 >= 12 ? `${hh24 - 12} PM` : `${hh24} AM`;
    return m ? `${label.replace(' ', `:${String(m).padStart(2, '0')} `)}` : label;
  };

  return (
    <section className="onb-rise" style={{ '--d': '60ms' } as React.CSSProperties}>
      <div className="onb-sechead">
        <span className="onb-secindex">04</span>
        <span className="onb-seclabel">First look</span>
        <span className="onb-secrule" />
      </div>

      <h1 className="onb-verdict" style={{ marginTop: 32 }}>
        {hh.parentName} is being looked after.
      </h1>
      <p className="onb-body" style={{ marginTop: 12 }}>
        Scoring started this instant. Her rhythm is seeded from what you told us, and it keeps
        learning from every ordinary day.
      </p>

      <div className="onb-panel" style={{ marginTop: 24 }}>
        <div className="onb-row">
          <span className="onb-rowlabel">Household</span>
          <span className="onb-rowvalue">The {hh.parentName} household</span>
        </div>
        <div className="onb-row">
          <span className="onb-rowlabel">Watchers</span>
          <span className="onb-rowvalue">
            {watcherCount === 0 ? 'pairing…' : `${watcherCount} connected`}
          </span>
        </div>
        {baseline && (
          <div className="onb-row">
            <span className="onb-rowlabel">Her rhythm</span>
            <span className="onb-rowvalue">
              wakes ~{fmtHour(baseline.wakeHour)} · charges ~{fmtHour(baseline.chargingStartHour)}
            </span>
          </div>
        )}
      </div>

      <div className="onb-actions" style={{ marginTop: 24 }}>
        <Link
          href={`/household/${hh.id}`}
          className="btn-primary"
          onClick={() => clearCheckpoint(hh.id)}
        >
          Open {hh.parentName}&rsquo;s dashboard
        </Link>
        <Link href="/demo" className="btn-ghost" style={{ minHeight: 40 }}>
          Demo console
        </Link>
        <button type="button" className="btn-ghost onb-copybtn" onClick={onBack}>
          Back to the watchers
        </button>
      </div>
    </section>
  );
}
