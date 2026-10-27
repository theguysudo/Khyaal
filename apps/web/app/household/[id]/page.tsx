'use client';

/**
 * The child dashboard as a calm bento. Privacy by construction: this screen
 * never receives raw signals from the API — a status, a score trend, a
 * last-active time and plain-language explanations. If the API ever tried to
 * send a location trail, there is nothing here to draw it with.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';
import { useState } from 'react';
import { BentoCard, CardTitle, CountUp, smooth, useSize } from '@/components/dashboard/bento';
import { fmtAgo, fmtClock, postJSON, TIER_META, useHouseholdState } from '@/lib/api';

export default function DashboardPage() {
  const { id } = useParams<{ id: string }>();
  const { bundle, error } = useHouseholdState(id);
  const [acking, setAcking] = useState(false);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper px-6">
        <div className="max-w-sm rounded-3xl border border-ink/10 bg-white p-8 text-center shadow-sm">
          <p className="font-heading text-xl text-ink">We couldn't reach this household</p>
          <p className="mt-2 text-sm text-ink/60">{error}</p>
          <Link href="/onboarding" className="mt-5 inline-block rounded-full bg-ink px-5 py-2 text-sm text-paper">
            Set up a household
          </Link>
        </div>
      </main>
    );
  }
  if (!bundle) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper">
        <p className="animate-pulse text-sm text-ink/50">Listening for signals…</p>
      </main>
    );
  }

  const { state, household: hh } = bundle;
  const meta = TIER_META[state.tier];
  const isAlert = state.tier === 3;

  const ack = async () => {
    setAcking(true);
    try {
      await postJSON(`/api/v1/household/${id}/ack`, { by: hh.childName });
    } finally {
      setAcking(false);
    }
  };

  return (
    <main
      className="min-h-screen px-4 pb-16 pt-6 transition-colors duration-700 sm:px-8"
      style={{ background: `linear-gradient(180deg, ${meta.soft} 0%, #faf6ef 40%)` }}
    >
      <div className="mx-auto max-w-5xl">
        {/* header */}
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="font-heading text-lg tracking-tight text-ink">Khayaal</span>
            <span className="text-clay">✳︎</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {hh.simTimeOffsetMs !== 0 && (
              <span className="rounded-full bg-dusk/10 px-3 py-1 text-xs text-dusk">demo clock · {fmtClock(bundle.simNowTs)}</span>
            )}
            <Link href={`/household/${id}/settings`} className="rounded-full border border-ink/15 bg-white/70 px-4 py-1.5 text-ink/70 transition-colors hover:bg-white">
              Settings
            </Link>
          </div>
        </header>

        {/* tier-3 alert — the only thing allowed to shout */}
        {isAlert && (
          <section className="mt-6 rounded-[24px] border-2 border-[#b23a2f]/40 bg-white p-5 shadow-[0_10px_40px_rgba(178,58,47,0.12)] sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#b23a2f]">Needs attention</p>
                <p className="mt-1.5 font-heading text-xl text-ink">
                  {hh.parentName} hasn't responded to the nudge or the check-in.
                </p>
                <p className="mt-1 text-sm text-ink/60">
                  {state.ack
                    ? `${state.ack.by} acknowledged at ${fmtClock(state.ack.ts)} — siblings notified.`
                    : 'Last-known signals are in "Why this score" below. A call is usually the right next step.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  title="Wire your number in settings — this demo cannot place calls"
                  className="rounded-full bg-[#b23a2f] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                  📞 Call {hh.parentName}
                </a>
                <button
                  onClick={ack}
                  disabled={acking}
                  className="rounded-full border border-[#b23a2f]/40 px-5 py-2.5 text-sm font-medium text-[#77231c] transition-colors hover:bg-[#f6dcd8]/60 disabled:opacity-50"
                >
                  {state.ack ? 'Acknowledged ✓' : acking ? 'Noting…' : "I've checked in"}
                </button>
                <button
                  onClick={() => postJSON(`/api/v1/household/${id}/snooze`, { minutes: 60 })}
                  className="rounded-full border border-ink/15 px-5 py-2.5 text-sm text-ink/60 transition-colors hover:bg-paper"
                >
                  Snooze 1 h
                </button>
              </div>
            </div>
          </section>
        )}

        {/* the bento */}
        <div className="mt-6 grid grid-cols-12 gap-4">
          {/* status */}
          <BentoCard label="Current status" className={`col-span-12 lg:col-span-5`}>
            <div className="flex h-full flex-col">
              <CardTitle note={state.learning ? undefined : `confidence ${Math.round(state.confidence * 100)}%`}>
                {meta.label}
              </CardTitle>
              <div className="mt-4 flex items-end gap-2">
                {state.score === null ? (
                  <span className="font-heading text-[56px] leading-none text-ink/30">···</span>
                ) : (
                  <span className="font-heading text-[56px] leading-none" style={{ color: meta.color }}>
                    <CountUp value={state.score} />
                  </span>
                )}
                <span className="pb-1.5 text-sm text-ink/45">/ 100 wellbeing</span>
              </div>
              <p className="mt-4 font-heading text-[22px] leading-snug text-ink">
                {state.learning ? `Learning ${hh.parentName}'s rhythm…` : state.status}
              </p>
              <p className="mt-auto pt-5 text-sm leading-relaxed text-ink/55">
                Last activity {fmtAgo(state.lastActiveTs, bundle.simNowTs)}
                {state.lastActiveTs ? ` — around ${fmtClock(state.lastActiveTs)}` : ''}.
                {state.snoozeUntilTs && state.snoozeUntilTs > bundle.simNowTs && (
                  <> Quiet until {fmtClock(state.snoozeUntilTs)}.</>
                )}
              </p>
            </div>
          </BentoCard>

          {/* trend */}
          <BentoCard label="24 hour score trend" className="col-span-12 lg:col-span-7">
            <CardTitle note="last 24 h">The day so far</CardTitle>
            <TrendChart trend={state.scoreTrend} nowTs={bundle.simNowTs} />
          </BentoCard>

          {/* ladder */}
          <BentoCard label="Escalation ladder" className="col-span-12 lg:col-span-5">
            <CardTitle note="most days, step 3 never comes">Where things stand</CardTitle>
            <div className="mt-5 space-y-2.5">
              {[
                ['Quiet observation', 'signals only — nobody is contacted', 0],
                ['Gentle nudge', 'on her phone; nothing has left the house', 1],
                ['Check-in asked', 'one clear question, one tap to answer', 2],
                ['Family alerted', 'with last-known signals attached', 3],
              ].map(([label, desc, t], i) => {
                const active = state.tier >= (t as number);
                return (
                  <div key={label as string} className="flex items-center gap-3">
                    <span
                      className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[11px] font-semibold transition-colors duration-500"
                      style={{ background: active ? (i === 3 ? '#b23a2f' : i === 0 ? '#4c7a4f' : '#c98a2b') : '#efe9de', color: active ? '#fff' : '#a2988a' }}
                    >
                      {i}
                    </span>
                    <div className="min-w-0">
                      <p className={`text-sm font-medium ${active ? 'text-ink' : 'text-ink/40'}`}>{label as string}</p>
                      <p className="truncate text-xs text-ink/40">{desc as string}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </BentoCard>

          {/* explainability */}
          <BentoCard label="Why this score" className="col-span-12 lg:col-span-7">
            <CardTitle note="plain language, always">Why this score</CardTitle>
            <div className="mt-5 space-y-3.5">
              {state.learning && (
                <p className="text-sm text-ink/60">Khayaal is still learning — nothing is being scored yet.</p>
              )}
              {!state.learning && state.contributions.length === 0 && (
                <p className="text-sm text-ink/60">Everything we look for is present and ordinary. Nothing to explain.</p>
              )}
              {state.contributions.map((c, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="mt-1.5 h-2 w-24 flex-none overflow-hidden rounded-full bg-ink/10">
                    <div
                      className="h-full rounded-full transition-[width] duration-700"
                      style={{ width: `${Math.min(100, (c.effect / 30) * 100)}%`, background: meta.color }}
                    />
                  </div>
                  <p className="text-sm leading-relaxed text-ink/75">{c.reason}</p>
                </div>
              ))}
              {!state.learning && (
                <p className="pt-1 text-xs leading-relaxed text-ink/40">
                  A missing source lowers confidence — it never raises the score on its own. Signals are scored, then discarded.
                </p>
              )}
            </div>
          </BentoCard>

          {/* sources + events */}
          <BentoCard label="Recent events" className="col-span-12 lg:col-span-5">
            <CardTitle note="audit trail">Quiet log</CardTitle>
            <ul className="mt-4 space-y-2.5">
              {bundle.events.slice(-6).reverse().map((e) => (
                <li key={e.id} className="flex items-baseline gap-3 text-sm">
                  <span className="flex-none text-xs tabular-nums text-ink/40">{fmtClock(e.ts)}</span>
                  <span className="text-ink/75">{e.meta ?? (e.type === 'tier_change' ? `tier ${e.from} → ${e.to}` : e.type)}</span>
                </li>
              ))}
              {bundle.events.length === 0 && <li className="text-sm text-ink/40">A quiet day. Nothing to report.</li>}
            </ul>
          </BentoCard>

          <BentoCard label="Sources" className="col-span-12">
            <CardTitle note="never a feed, never a map">The watchers</CardTitle>
            <div className="mt-4 flex flex-wrap gap-2.5">
              {bundle.sources.map((s) => {
                const fresh = s.lastSeenTs && bundle.simNowTs - s.lastSeenTs < 30 * 60_000;
                return (
                  <span key={s.id} className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-paper px-4 py-2 text-sm text-ink/80">
                    <span className="h-2 w-2 rounded-full" style={{ background: fresh ? '#4c7a4f' : '#c9b8a0' }} />
                    {s.label}
                    <span className="text-xs text-ink/40">{s.lastSeenTs ? fmtAgo(s.lastSeenTs, bundle.simNowTs) : 'not seen yet'}</span>
                  </span>
                );
              })}
            </div>
          </BentoCard>
        </div>

        <p className="mt-10 text-center text-xs leading-relaxed text-ink/40">
          Khayaal never shows a feed, a map or a recording — this page only ever sees what you see.
        </p>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------

function TrendChart({ trend, nowTs }: { trend: { ts: number; score: number }[]; nowTs: number }) {
  const [ref, { w: W, h: H }] = useSize();
  const [drawn, setDrawn] = useState(false);
  const reduce = useReducedMotionSafe();

  const CH = 150;
  React.useEffect(() => {
    if (!W) return;
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setDrawn(true)));
    return () => cancelAnimationFrame(r);
  }, [W]);

  const points = trend.slice(-96);
  if (W > 0 && points.length < 2) {
    return (
      <div ref={ref} className="flex min-h-[150px] items-center justify-center rounded-[18px] bg-paper/60 text-sm text-ink/40">
        The trend will appear as the day unfolds.
      </div>
    );
  }

  const t0 = points[0]?.ts ?? 0;
  const t1 = Math.max(points[points.length - 1]?.ts ?? 1, nowTs);
  const X = (ts: number) => 10 + ((ts - t0) / Math.max(1, t1 - t0)) * (W - 20);
  const Y = (s: number) => 14 + (1 - s / 100) * (CH - 28);
  const P = points.map((p) => [X(p.ts), Y(p.score)] as [number, number]);
  const d = W ? smooth(P) : '';
  const last = P[P.length - 1];

  return (
    <div ref={ref} className="relative mt-3 min-h-[150px] flex-1">
      {W > 0 && (
        <svg width={W} height={CH} className="block" role="img" aria-label="Wellbeing score over the last 24 hours">
          {/* tier bands */}
          <rect x="0" y={Y(100)} width={W} height={Y(72) - Y(100)} fill="#f6dcd8" opacity="0.5" />
          <rect x="0" y={Y(72)} width={W} height={Y(55) - Y(72)} fill="#f8e3d5" opacity="0.45" />
          <rect x="0" y={Y(55)} width={W} height={Y(35) - Y(55)} fill="#f7ecd7" opacity="0.55" />
          <rect x="0" y={Y(35)} width={W} height={Y(0) - Y(35)} fill="#e6efe2" opacity="0.5" />
          {[0, 35, 55, 72].map((b) => (
            <line key={b} x1="0" x2={W} y1={Y(b)} y2={Y(b)} className="stroke-ink/10" strokeWidth="1" strokeDasharray="3 4" />
          ))}
          <path d={`${d}L${last[0]},${CH}L${P[0][0]},${CH}Z`} fill="#7d8c6f" opacity="0.1" />
          <path
            d={d}
            pathLength={1}
            fill="none"
            stroke="#5f7053"
            strokeWidth="2.5"
            strokeLinecap="round"
            style={{
              strokeDasharray: 1,
              strokeDashoffset: drawn || reduce ? 0 : 1,
              transition: reduce ? 'none' : 'stroke-dashoffset 1.4s cubic-bezier(.3,.8,.2,1) .2s',
            }}
          />
          <circle cx={last[0]} cy={last[1]} r="4.5" fill="#5f7053" className="stroke-white" strokeWidth="2" />
          <text x={W - 4} y={Y(72) - 5} textAnchor="end" fontSize="10" className="fill-ink/40">
            72 · escalate
          </text>
        </svg>
      )}
    </div>
  );
}

function useReducedMotionSafe() {
  const [reduce, setReduce] = useState(false);
  React.useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduce(m.matches);
  }, []);
  return reduce;
}
