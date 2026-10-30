'use client';

/**
 * DEMO CONSOLE — the evaluator's seat, in the Quiet Ledger grammar. Nothing
 * on this page would ever be shown to a family. It drives the real engine
 * over the real API: scenarios seed a believable week of signals, the
 * time-warp advances the simulated clock, and every tier change you see is
 * the actual state machine escalating.
 *
 * Mechanics preserved verbatim from the previous console: the kh_demo cookie
 * mint (POST /api/v1/pair {action:'demo'}), 1.5s state polling, the three
 * scenarios, time-warp + auto-escalate, manual signal injection, the ESP32
 * presence simulator, the tier track, the her-phone simulation, and the
 * event ledger.
 */

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { fmtClock, postJSON, useHouseholdState } from '@/lib/api';
import '../onboarding/onboarding.css';

type Scenario = 'normal' | 'slow' | 'emergency';

/* Spec tokens — the shared lib's TIER_META still carries the old palette,
   so the ledger colors are mapped here, dot+word always. */
const TIER_INK: Record<number, string> = {
  0: '#2F6B4F',
  1: '#9A6A1B',
  2: '#B4451C',
  3: '#B3261E',
  4: '#B3261E',
};
const TIER_WORD: Record<number, string> = {
  0: 'Quiet',
  1: 'Nudge sent',
  2: 'Check-in asked',
  3: 'Needs attention',
  4: 'SOS ringing',
};

export default function DemoPage() {
  const [hhId, setHhId] = useState<string | null>(null);
  const [mintError, setMintError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [autoEscalate, setAutoEscalate] = useState(false);
  const [espSim, setEspSim] = useState(false);
  const espTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Quick-start: first (or freshly created) household. The response sets the
  // household-bound kh_demo cookie — the whole authorization for this page.
  const mintDemo = () => {
    setMintError(null);
    postJSON<{ household: { id: string } }>('/api/v1/pair', { action: 'demo' })
      .then((r) => setHhId(r.household.id))
      .catch(() => setMintError('The demo household couldn’t be prepared.'));
  };
  useEffect(mintDemo, []);

  const { bundle } = useHouseholdState(hhId ?? 'none', 1500);

  // Simulated ESP32 presence sensor — feeds the same /ingest endpoint the
  // real firmware uses. A drop-in replacement, not a special path.
  useEffect(() => {
    if (espTimer.current) clearInterval(espTimer.current);
    if (!espSim || !hhId || !bundle) return;
    const src = bundle.sources.find((s) => s.type === 'esp32');
    if (!src) return;
    espTimer.current = setInterval(async () => {
      const moving = Math.random() > 0.4;
      await postJSON('/api/v1/ingest', {
        householdId: hhId,
        sourceId: src.id,
        type: 'presence',
        value: moving ? 'motion' : 'idle',
        ts: Date.now() + (bundle?.household.simTimeOffsetMs ?? 0),
      }).catch(() => {});
    }, 12000);
    return () => {
      if (espTimer.current) clearInterval(espTimer.current);
    };
  }, [espSim, hhId, bundle?.sources, bundle?.household.simTimeOffsetMs]);

  const runScenario = async (scenario: Scenario) => {
    if (!hhId) return;
    setBusy(scenario);
    setAutoEscalate(false);
    try {
      await postJSON(`/api/v1/household/${hhId}/demo`, { scenario });
    } finally {
      setBusy(null);
    }
  };

  // Auto-escalate: nudge the simulated clock every few seconds so the full
  // ladder 1 -> 2 -> 3 plays out in under half a minute.
  useEffect(() => {
    if (autoTimer.current) clearInterval(autoTimer.current);
    if (!autoEscalate || !hhId) return;
    autoTimer.current = setInterval(() => {
      if (!bundle || bundle.state.tier >= 3) {
        setAutoEscalate(false);
        return;
      }
      postJSON(`/api/v1/household/${hhId}/config`, { simAdvanceMinutes: 12 }).catch(() => {});
    }, 2500);
    return () => {
      if (autoTimer.current) clearInterval(autoTimer.current);
    };
  }, [autoEscalate, hhId, bundle?.state.tier]);

  const manualSignal = async (type: string, value: unknown) => {
    if (!hhId || !bundle) return;
    const src = bundle.sources.find((s) => s.type === 'phone');
    if (!src) return;
    await postJSON('/api/v1/ingest', {
      householdId: hhId,
      sourceId: src.id,
      type,
      value,
      ts: bundle.simNowTs,
    }).catch(() => {});
  };

  const warp = (body: Record<string, unknown>) => {
    if (!hhId) return;
    postJSON(`/api/v1/household/${hhId}/config`, body).catch(() => {});
  };

  if (mintError) {
    return (
      <main className="onb">
        <div className="onb-wrap" style={{ paddingTop: 80 }}>
          <div className="onb-note" data-tone="alarm" role="alert">
            <span className="onb-status" data-tone="alarm">
              <span className="onb-dot" />
              Held
            </span>
            <div className="onb-notebody">
              <p className="onb-notetitle">The demo household couldn’t be prepared</p>
              <p style={{ margin: 0 }}>
                The server didn’t answer. Nothing is broken — try once more.
              </p>
              <div className="onb-actions" style={{ marginTop: 12 }}>
                <button type="button" className="btn-secondary" onClick={mintDemo}>
                  Try again
                </button>
                <Link href="/" className="btn-ghost onb-copybtn">
                  Back to the site
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!hhId) {
    return (
      <main className="onb">
        <div className="onb-wrap" style={{ paddingTop: 80 }}>
          <p className="onb-meta onb-mono">Preparing the demo household ···</p>
        </div>
      </main>
    );
  }

  const state = bundle?.state;
  const tier = state?.tier ?? 0;
  const simClock = bundle ? fmtClock(bundle.simNowTs) : '—';
  const offsetH = bundle ? bundle.household.simTimeOffsetMs / 3600000 : 0;
  const events = bundle?.events ?? [];

  return (
    <main className="onb">
      <div className="onb-wrap onb-wrap-wide">
        <header className="onb-topbar">
          <Link href="/" className="onb-wordmark">
            Khayaal
          </Link>
          <div className="onb-actions" style={{ gap: 8 }}>
            <Link
              href={`/household/${hhId}`}
              target="_blank"
              className="btn-secondary"
              style={{ minHeight: 40 }}
            >
              Open household dashboard ↗
            </Link>
            <Link href="/" className="btn-ghost" style={{ minHeight: 40 }}>
              Back to site
            </Link>
          </div>
        </header>

        <div className="onb-rise" style={{ marginTop: 32 }}>
          <p
            className="onb-mono"
            style={{ fontSize: 13, letterSpacing: '0.08em', color: 'var(--signal)', margin: 0 }}
          >
            DEMO CONSOLE — NOT SHOWN TO FAMILIES
          </p>
          <h1 className="onb-h1" style={{ marginTop: 8 }}>
            Run the story. Watch the engine respond.
          </h1>
          <p className="onb-body" style={{ marginTop: 8 }}>
            This is the evaluator&rsquo;s fast path: one household, pre-seeded and
            household-scoped to this browser for a day. Everything below is the real engine
            scoring real signals — nothing here is staged.
          </p>
        </div>

        <div className="onb-cols2" style={{ marginTop: 8 }}>
            {/* LEFT column */}
            <div>
              {/* 01 — Scenarios */}
              <section className="onb-rise" style={{ '--d': '60ms' } as React.CSSProperties}>
                <div className="onb-sechead">
                  <span className="onb-secindex">01</span>
                  <span className="onb-seclabel">Scenarios</span>
                  <span className="onb-secrule" />
                </div>
                <div className="onb-panel">
                  <div className="onb-rows">
                    {(
                      [
                        {
                          key: 'normal' as Scenario,
                          title: 'Normal day',
                          desc: 'An ordinary morning, nothing more.',
                        },
                        {
                          key: 'slow' as Scenario,
                          title: 'Slow morning',
                          desc: 'Up and about — but no unlock.',
                        },
                        {
                          key: 'emergency' as Scenario,
                          title: 'Possible emergency',
                          desc: 'Silent since yesterday evening.',
                        },
                      ] as const
                    ).map((sc) => (
                      <div className="onb-row" key={sc.key}>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>
                            {sc.title}
                          </span>
                          <span style={{ display: 'block', fontSize: 13, color: 'var(--ink-3)' }}>
                            {sc.desc}
                          </span>
                        </span>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => runScenario(sc.key)}
                          disabled={busy === sc.key}
                        >
                          {busy === sc.key ? 'Seeding…' : 'Run'}
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="onb-meta" style={{ marginTop: 12 }}>
                    Each scenario seeds six days of believable signals and sets the simulated
                    clock. Everything after that is the real engine scoring real absences.
                  </p>
                </div>
              </section>

              {/* 02 — Time-warp */}
              <section className="onb-rise" style={{ '--d': '120ms' } as React.CSSProperties}>
                <div className="onb-sechead">
                  <span className="onb-secindex">02</span>
                  <span className="onb-seclabel">Time-warp</span>
                  <span className="onb-secrule" />
                </div>
                <div className="onb-panel">
                  <div className="onb-row">
                    <span className="onb-rowlabel">Sim clock</span>
                    <span className="onb-rowvalue">
                      {simClock}
                      {offsetH !== 0 ? ` · +${offsetH.toFixed(1)} h` : ''}
                    </span>
                  </div>
                  <div className="onb-row">
                    <span className="onb-rowlabel">Advance</span>
                    <span className="onb-actions" style={{ gap: 8 }}>
                      <button type="button" className="btn-secondary" onClick={() => warp({ simAdvanceMinutes: 10 })}>
                        +10 min
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => warp({ simAdvanceMinutes: 60 })}>
                        +1 h
                      </button>
                      <button type="button" className="btn-ghost onb-copybtn" onClick={() => warp({ simResetTime: true })}>
                        Reset
                      </button>
                    </span>
                  </div>
                  <div className="onb-row">
                    <span className="onb-rowlabel">Ladder</span>
                    <Toggle
                      on={autoEscalate}
                      label="Auto-escalate 1 → 2 → 3"
                      onClick={() => setAutoEscalate((v) => !v)}
                    />
                  </div>
                </div>
              </section>

              {/* 03 — Signals */}
              <section className="onb-rise" style={{ '--d': '180ms' } as React.CSSProperties}>
                <div className="onb-sechead">
                  <span className="onb-secindex">03</span>
                  <span className="onb-seclabel">Inject a signal</span>
                  <span className="onb-secrule" />
                </div>
                <div className="onb-panel">
                  <div className="onb-rows">
                    {(
                      [
                        { label: 'She unlocked her phone', type: 'screen_event', value: 'unlock' },
                        { label: 'Movement in the house', type: 'motion', value: 1 },
                        { label: 'Plugged in to charge', type: 'charging', value: true },
                        { label: 'Left home', type: 'location_zone', value: 'away' },
                        { label: 'Back home', type: 'location_zone', value: 'home' },
                      ] as const
                    ).map((sig) => (
                      <div className="onb-row" key={sig.label}>
                        <span className="onb-status" data-tone="idle" style={{ color: 'var(--ink)' }}>
                          <span className="onb-dot" />
                          {sig.label}
                        </span>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => manualSignal(sig.type, sig.value)}
                          disabled={!bundle}
                        >
                          Post
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="onb-row" style={{ marginTop: 4 }}>
                    <span className="onb-rowlabel">Room sensor</span>
                    <Toggle
                      on={espSim}
                      label="Simulated presence, every 12 s"
                      onClick={() => setEspSim((v) => !v)}
                    />
                  </div>
                </div>
              </section>
            </div>

            {/* RIGHT column */}
            <div>
              {/* 04 — Engine */}
              <section className="onb-rise" style={{ '--d': '90ms' } as React.CSSProperties}>
                <div className="onb-sechead">
                  <span className="onb-secindex">04</span>
                  <span className="onb-seclabel">Engine output</span>
                  <span className="onb-secrule" />
                </div>
                <div className="onb-panel">
                  <div className="onb-row">
                    <span className="onb-rowlabel">Wellbeing</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span className="onb-mono" style={{ fontSize: 26 }}>
                        {state?.score ?? '—'}
                      </span>
                      <span
                        className="onb-status"
                        data-tone={tier === 0 ? 'calm' : tier === 1 ? 'watch' : 'alarm'}
                      >
                        <span className="onb-dot" style={{ background: TIER_INK[tier] }} />
                        {TIER_WORD[tier]}
                      </span>
                    </span>
                  </div>
                  <div className="onb-row">
                    <span className="onb-rowlabel">Status</span>
                    <span className="onb-rowvalue" style={{ fontFamily: 'var(--serif)', fontSize: 15 }}>
                      {state?.status || '—'}
                    </span>
                  </div>
                  <div className="onb-row">
                    <span className="onb-rowlabel">Confidence</span>
                    <span className="onb-rowvalue">
                      {Math.round((state?.confidence ?? 1) * 100)}%
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
                    {Object.keys(TIER_WORD).map((k) => {
                      const t = Number(k);
                      return (
                        <span
                          key={k}
                          className="onb-status"
                          data-tone={t === tier ? 'signal' : 'idle'}
                          style={{ color: t === tier ? 'var(--ink)' : 'var(--ink-3)' }}
                        >
                          <span
                            className="onb-dot"
                            style={t <= tier ? { background: TIER_INK[t] } : undefined}
                          />
                          {TIER_WORD[t]}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </section>

              {/* 05 — Her phone */}
              <section className="onb-rise" style={{ '--d': '150ms' } as React.CSSProperties}>
                <div className="onb-sechead">
                  <span className="onb-secindex">05</span>
                  <span className="onb-seclabel">Her phone, simulated</span>
                  <span className="onb-secrule" />
                </div>
                <div className="onb-panel">
                  <div className="onb-row">
                    <span className="onb-rowlabel">Screen</span>
                    <span className="onb-rowvalue">
                      {bundle?.household.parentName}&rsquo;s phone · {simClock}
                    </span>
                  </div>
                  {tier === 0 && (
                    <p className="onb-body" style={{ fontSize: 15, marginTop: 12 }}>
                      Quiet. Nothing to open, nothing to do.
                    </p>
                  )}
                  {tier === 1 && (
                    <div
                      style={{
                        marginTop: 12,
                        border: '1px solid var(--rule-strong)',
                        borderLeft: '2px solid var(--watch)',
                        borderRadius: 8,
                        padding: '12px 16px',
                        background: 'var(--paper)',
                      }}
                    >
                      <p className="onb-meta" style={{ margin: 0 }}>
                        a gentle nudge
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: 15, fontWeight: 600 }}>
                        Everything okay?
                      </p>
                    </div>
                  )}
                  {(tier === 2 || tier === 3) && (
                    <div
                      style={{
                        marginTop: 12,
                        border: '1px solid var(--rule-strong)',
                        borderLeft: '2px solid var(--alarm)',
                        borderRadius: 8,
                        padding: '12px 16px',
                        background: 'var(--paper)',
                      }}
                    >
                      <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Are you alright?</p>
                      <p className="onb-meta" style={{ margin: '4px 0 0' }}>
                        One tap ends the matter.
                      </p>
                      <div className="onb-actions" style={{ marginTop: 12 }}>
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => postJSON(`/api/v1/household/${hhId}/checkin`)}
                        >
                          I&rsquo;m OK
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => postJSON(`/api/v1/household/${hhId}/snooze`, { minutes: 60 })}
                        >
                          Snooze 1 h
                        </button>
                      </div>
                    </div>
                  )}
                  <p className="onb-meta" style={{ marginTop: 12 }}>
                    Tier 4 hands the screen to the SOS sheet on the household dashboard.
                  </p>
                </div>
              </section>

              {/* 06 — Event ledger */}
              <section className="onb-rise" style={{ '--d': '210ms' } as React.CSSProperties}>
                <div className="onb-sechead">
                  <span className="onb-secindex">06</span>
                  <span className="onb-seclabel">Event ledger</span>
                  <span className="onb-secrule" />
                </div>
                <div className="onb-panel">
                  <div className="onb-rows">
                    {events.length === 0 && (
                      <p className="onb-body" style={{ fontSize: 15, margin: 0 }}>
                        Nothing yet — run a scenario.
                      </p>
                    )}
                    {events
                      .slice(-8)
                      .reverse()
                      .map((e) => (
                        <div className="onb-row" key={e.id}>
                          <span className="onb-rowvalue" style={{ color: 'var(--ink-3)' }}>
                            {fmtClock(e.ts)}
                          </span>
                          <span className="onb-rowvalue" style={{ textAlign: 'left', fontFamily: 'var(--sans)', fontSize: 14 }}>
                            {e.meta ??
                              (e.type === 'tier_change' ? `tier ${e.from} → ${e.to}` : e.type)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              </section>
            </div>
        </div>

        <div className="onb-note" data-tone="signal" style={{ marginTop: 32 }}>
          <span className="onb-status" data-tone="signal">
            <span className="onb-dot" />
            Two windows
          </span>
          <div className="onb-notebody">
            <p style={{ margin: 0 }}>
              Open the household dashboard in a second window, run &ldquo;Possible
              emergency&rdquo; here, and watch the alert arrive there in real time.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------

function Toggle({
  on,
  label,
  onClick,
}: {
  on: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="btn-secondary" aria-pressed={on} onClick={onClick}>
      <span className="onb-status" data-tone={on ? 'calm' : 'idle'}>
        <span className="onb-dot" />
        {label} · {on ? 'on' : 'off'}
      </span>
    </button>
  );
}
