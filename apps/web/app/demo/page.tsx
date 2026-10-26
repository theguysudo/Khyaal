'use client';

/**
 * DEMO CONSOLE — the presenter's seat. Deliberately labeled as such: nothing
 * on this page would ever be shown to a family. It drives the real engine
 * over the real API: scenarios seed a believable week of signals, the
 * time-warp advances the simulated clock, and every tier change you see is
 * the actual state machine escalating.
 */

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { fmtClock, postJSON, TIER_META, useHouseholdState } from '@/lib/api';

type Scenario = 'normal' | 'slow' | 'emergency';

export default function DemoPage() {
  const [hhId, setHhId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [autoEscalate, setAutoEscalate] = useState(false);
  const [espSim, setEspSim] = useState(false);
  const espTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Quick-start: first (or freshly created) household.
  useEffect(() => {
    postJSON<{ household: { id: string } }>('/api/v1/pair', { action: 'demo' })
      .then((r) => setHhId(r.household.id))
      .catch(() => {});
  }, []);

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

  if (!hhId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#221b15]">
        <p className="animate-pulse text-sm text-paper/60">Preparing the demo household…</p>
      </main>
    );
  }

  const state = bundle?.state;
  const tier = state?.tier ?? 0;
  const meta = TIER_META[tier];
  const simClock = bundle ? fmtClock(bundle.simNowTs) : '—';
  const offsetH = bundle ? bundle.household.simTimeOffsetMs / 3600000 : 0;

  return (
    <main className="min-h-screen bg-[#221b15] px-4 py-6 text-paper sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#f6d9a0]">Demo console — not shown to families</p>
            <h1 className="mt-1 font-heading text-2xl tracking-tight">Run the story, watch the engine respond</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link href={`/household/${hhId}`} target="_blank" className="rounded-full bg-paper px-4 py-2 text-[#221b15] transition-opacity hover:opacity-85">
              Open child dashboard ↗
            </Link>
            <Link href="/" className="rounded-full border border-paper/25 px-4 py-2 text-paper/80 transition-colors hover:bg-paper/10">
              Back to site
            </Link>
          </div>
        </header>

        <div className="mt-8 grid gap-5 lg:grid-cols-[1.15fr_1fr]">
          {/* LEFT: controls */}
          <div className="space-y-5">
            {/* scenarios */}
            <section className="rounded-3xl border border-paper/12 bg-white/[0.04] p-6">
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-paper/50">One-click scenarios</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <ScenarioBtn title="Normal day" desc="An ordinary morning, nothing more" onClick={() => runScenario('normal')} busy={busy === 'normal'} tone="ok" />
                <ScenarioBtn title="Slow morning" desc="Up and about — but no unlock" onClick={() => runScenario('slow')} busy={busy === 'slow'} tone="warn" />
                <ScenarioBtn title="Possible emergency" desc="Silent since yesterday evening" onClick={() => runScenario('emergency')} busy={busy === 'emergency'} tone="bad" />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-paper/40">
                Each scenario seeds six days of believable signals and sets the simulated clock.
                Everything after that is the real engine scoring real absences.
              </p>
            </section>

            {/* time-warp */}
            <section className="rounded-3xl border border-paper/12 bg-white/[0.04] p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-paper/50">Time-warp</h2>
                <span className="rounded-full bg-paper/10 px-3 py-1 text-xs text-paper/70">sim clock {simClock}{offsetH !== 0 && ` · +${offsetH.toFixed(1)} h`}</span>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button onClick={() => postJSON(`/api/v1/household/${hhId}/config`, { simAdvanceMinutes: 10 })} className="rounded-full border border-paper/20 px-4 py-2 text-sm transition-colors hover:bg-paper/10">
                  +10 min
                </button>
                <button onClick={() => postJSON(`/api/v1/household/${hhId}/config`, { simAdvanceMinutes: 60 })} className="rounded-full border border-paper/20 px-4 py-2 text-sm transition-colors hover:bg-paper/10">
                  +1 h
                </button>
                <label className="flex cursor-pointer items-center gap-2 rounded-full border border-paper/20 px-4 py-2 text-sm">
                  <input type="checkbox" checked={autoEscalate} onChange={(e) => setAutoEscalate(e.target.checked)} className="accent-[#f6d9a0]" />
                  Auto-escalate (watch 1 → 2 → 3)
                </label>
                <button onClick={() => postJSON(`/api/v1/household/${hhId}/config`, { simResetTime: true })} className="rounded-full border border-paper/20 px-4 py-2 text-sm text-paper/60 transition-colors hover:bg-paper/10">
                  Reset clock
                </button>
              </div>
            </section>

            {/* manual signals */}
            <section className="rounded-3xl border border-paper/12 bg-white/[0.04] p-6">
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-paper/50">Inject a signal now</h2>
              <div className="mt-4 flex flex-wrap gap-2 text-sm">
                <button onClick={() => manualSignal('screen_event', 'unlock')} className="rounded-full border border-paper/20 px-4 py-2 transition-colors hover:bg-paper/10">🔓 She unlocked her phone</button>
                <button onClick={() => manualSignal('motion', 1)} className="rounded-full border border-paper/20 px-4 py-2 transition-colors hover:bg-paper/10">🚶 Movement in the house</button>
                <button onClick={() => manualSignal('charging', true)} className="rounded-full border border-paper/20 px-4 py-2 transition-colors hover:bg-paper/10">🔌 Plugged in to charge</button>
                <button onClick={() => manualSignal('location_zone', 'away')} className="rounded-full border border-paper/20 px-4 py-2 transition-colors hover:bg-paper/10">👜 Left home</button>
                <button onClick={() => manualSignal('location_zone', 'home')} className="rounded-full border border-paper/20 px-4 py-2 transition-colors hover:bg-paper/10">🏠 Back home</button>
              </div>
              <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-paper/80">
                <input type="checkbox" checked={espSim} onChange={(e) => setEspSim(e.target.checked)} className="accent-[#f6d9a0]" />
                Simulated CSI sensor — an ESP32 posting presence every 12 s
              </label>
            </section>
          </div>

          {/* RIGHT: live state + parent sim */}
          <div className="space-y-5">
            {/* gauge + tier */}
            <section className="rounded-3xl border border-paper/12 bg-white/[0.04] p-6">
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-paper/50">Live engine output</h2>
              <div className="mt-4 flex items-center gap-6">
                <Gauge score={state?.score ?? null} color={meta.color} />
                <div className="flex-1">
                  <p className="font-heading text-xl" style={{ color: meta.color }}>{meta.label}</p>
                  <p className="mt-1 text-sm text-paper/60">{state?.status ?? '—'}</p>
                  <p className="mt-2 text-xs text-paper/40">confidence {Math.round((state?.confidence ?? 1) * 100)}%</p>
                </div>
              </div>
              <TierTrack tier={tier} />
            </section>

            {/* parent phone sim */}
            <section className="rounded-3xl border border-paper/12 bg-white/[0.04] p-6">
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-paper/50">Her phone (simulated)</h2>
              <div className="mx-auto mt-4 w-full max-w-[280px] rounded-[28px] border border-paper/25 bg-[#2c241d] p-4 shadow-xl">
                <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-paper/20" />
                <p className="text-center text-xs text-paper/50">{bundle?.household.parentName}'s phone · {simClock}</p>
                {tier === 0 && (
                  <p className="mt-6 mb-6 text-center text-sm text-paper/60">Quiet. Nothing to open, nothing to do.</p>
                )}
                {tier === 1 && (
                  <div className="mt-4 rounded-2xl bg-white/95 p-4 text-center text-[#2a241d]">
                    <p className="text-xs text-ink/50">a gentle nudge</p>
                    <p className="mt-1 text-sm font-medium">Everything okay? 🌼</p>
                  </div>
                )}
                {(tier === 2 || tier === 3) && (
                  <div className="mt-4 rounded-2xl bg-white p-4 text-center text-[#2a241d]">
                    <p className="text-sm font-medium">Are you alright?</p>
                    <p className="mt-1 text-xs text-ink/50">One tap ends the matter.</p>
                    <button
                      onClick={() => postJSON(`/api/v1/household/${hhId}/checkin`)}
                      className="mt-3 w-full rounded-full bg-[#4c7a4f] py-2.5 text-sm font-semibold text-white"
                    >
                      I'm OK
                    </button>
                    <button
                      onClick={() => postJSON(`/api/v1/household/${hhId}/snooze`, { minutes: 60 })}
                      className="mt-2 w-full rounded-full border border-ink/15 py-2 text-xs text-ink/60"
                    >
                      Snooze 1 h
                    </button>
                  </div>
                )}
                <div className="mt-6 mb-1 flex justify-center gap-8 text-[10px] text-paper/30">
                  <span>Khayaal</span>
                  <span>background</span>
                </div>
              </div>
            </section>

            {/* event log */}
            <section className="rounded-3xl border border-paper/12 bg-white/[0.04] p-6">
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-paper/50">Event log (audit trail)</h2>
              <ul className="mt-4 space-y-2 text-sm">
                {(bundle?.events ?? []).slice(-8).reverse().map((e) => (
                  <li key={e.id} className="flex items-baseline gap-3">
                    <span className="shrink-0 text-xs text-paper/40">{fmtClock(e.ts)}</span>
                    <span className="text-paper/75">
                      {e.meta ?? (e.type === 'tier_change' ? `tier ${e.from} → ${e.to}` : e.type)}
                    </span>
                  </li>
                ))}
                {(bundle?.events ?? []).length === 0 && <li className="text-sm text-paper/40">Nothing yet — run a scenario.</li>}
              </ul>
            </section>
          </div>
        </div>

        <p className="mt-8 text-center text-xs leading-relaxed text-paper/35">
          Two-window demo: open the child dashboard in a second window, run “Possible emergency”
          here, and watch the alert arrive there in real time.
        </p>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------

function ScenarioBtn({ title, desc, onClick, busy, tone }: { title: string; desc: string; onClick: () => void; busy: boolean; tone: 'ok' | 'warn' | 'bad' }) {
  const ring = { ok: 'hover:border-[#7d8c6f]', warn: 'hover:border-[#c98a2b]', bad: 'hover:border-[#b23a2f]' }[tone];
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`rounded-2xl border border-paper/15 bg-paper/[0.04] p-4 text-left transition-colors ${ring} disabled:opacity-50`}
    >
      <p className="text-sm font-semibold text-paper">{busy ? 'Seeding…' : title}</p>
      <p className="mt-1 text-xs leading-snug text-paper/50">{desc}</p>
    </button>
  );
}

function Gauge({ score, color }: { score: number | null; color: string }) {
  const R = 52;
  const C = Math.PI * R; // half circle
  const pct = score === null ? 0 : score / 100;
  return (
    <div className="relative h-[74px] w-[140px]">
      <svg viewBox="0 0 140 74" className="h-full w-full">
        <path d="M 18 66 A 52 52 0 0 1 122 66" fill="none" stroke="#ffffff18" strokeWidth="10" strokeLinecap="round" />
        <path
          d="M 18 66 A 52 52 0 0 1 122 66"
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${C * pct} ${C}`}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex items-end justify-center pb-0.5">
        <span className="font-heading text-3xl text-paper">{score ?? '—'}</span>
      </div>
    </div>
  );
}

function TierTrack({ tier }: { tier: number }) {
  const labels = ['Quiet', 'Nudge', 'Check-in', 'Alert'];
  return (
    <div className="mt-5 flex gap-2">
      {labels.map((l, i) => (
        <div key={l} className="flex-1">
          <div className="h-1.5 rounded-full transition-colors duration-500" style={{ background: i <= tier && i > 0 ? '#c98a2b' : i === 0 && tier === 0 ? '#7d8c6f' : '#ffffff22' }} />
          <p className={`mt-1.5 text-[10px] ${i === tier ? 'text-paper' : 'text-paper/40'}`}>{l}</p>
        </div>
      ))}
    </div>
  );
}
