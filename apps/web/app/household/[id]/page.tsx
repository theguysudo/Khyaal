'use client';

/**
 * The child dashboard — calm bento, richer controls. Dignity-first by
 * construction: this screen never receives raw signals from the API, only
 * aggregates (per-hour counts), a status, plain-language explanations and the
 * family's own actions. Everything the family composes here (messages, voice
 * reminders, check-in requests) rides the commands channel to her phone.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { BentoCard, CardTitle, CountUp, smooth, useSize } from '@/components/dashboard/bento';
import NightWatchCard from '@/components/dashboard/NightWatchCard';
import TalkbackCard from '@/components/dashboard/TalkbackCard';
import MovementCard from '@/components/dashboard/MovementCard';
import BlueprintMap from '@/components/dashboard/BlueprintMap';
import CsiScope from '@/components/dashboard/CsiScope';
import { fmtAgo, fmtClock, patchJSON, postJSON, TIER_META, useHouseholdState } from '@/lib/api';

/**
 * Focus rings shared by every actionable chip on the dashboard. Kept as full
 * literal strings (no runtime composition) so Tailwind's scanner sees each
 * class and generates it.
 */
const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white';
const FOCUS_ON_PAPER =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper';
const FOCUS_ON_RED =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b23a2f]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fdf3f1]';
const FOCUS_ON_PAPER_RED =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b23a2f]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper';

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
          <Link href="/login" className={`mt-5 inline-block rounded-full bg-ink px-5 py-2 text-sm text-paper transition-colors hover:bg-ink/85 ${FOCUS_ON_PAPER}`}>
            Your families
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
  const circle = hh.careCircle ?? [];

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
      className="min-h-screen px-4 pb-16 pt-6 transition-colors duration-700 motion-reduce:transition-none sm:px-8"
      style={{
        // The tint rides on background-color (which transition-colors can
        // actually animate); the paper wash above it is a static gradient.
        // Together they render pixel-identically to a hard-coded gradient —
        // but a tier change now cross-fades instead of snapping.
        backgroundColor: meta.soft,
        backgroundImage: 'linear-gradient(180deg, rgba(250,246,239,0) 0%, #faf6ef 40%)',
      }}
    >
      <div className="mx-auto max-w-5xl">
        {/* header */}
        <header className="flex items-center justify-between">
          <Link href="/login" className="flex items-center gap-2 rounded-full px-1 py-0.5">
            <span className="font-heading text-lg tracking-tight text-ink">Khayaal</span>
            <span className="text-clay">✳︎</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {hh.simTimeOffsetMs !== 0 && (
              <span className="rounded-full bg-dusk/10 px-3 py-1 text-xs text-dusk">demo clock · {fmtClock(bundle.simNowTs)}</span>
            )}
            <Link
              href={`/household/${id}/settings`}
              className={`rounded-full border border-ink/15 bg-white/70 px-4 py-1.5 text-ink/70 transition-colors hover:border-ink/25 hover:bg-white ${FOCUS}`}
            >
              Settings
            </Link>
          </div>
        </header>

        {/*
          tier-3 alert — the only thing allowed to shout.
          The section stays mounted and collapses through a grid row so the
          bento below glides aside instead of teleporting when a poll flips
          the tier; when collapsed it is inert, so the hidden buttons can
          neither be tabbed into nor clicked.
        */}
        <div
          className="grid transition-[grid-template-rows] duration-500 ease-out motion-reduce:transition-none"
          style={{ gridTemplateRows: isAlert ? '1fr' : '0fr' }}
          aria-hidden={!isAlert}
        >
          <div className="min-h-0 overflow-hidden">
            <section
              inert={!isAlert}
              className={`mt-6 rounded-[24px] border border-[#b23a2f]/25 border-l-4 border-l-[#b23a2f] bg-white p-5 shadow-[0_12px_44px_rgba(178,58,47,0.14)] transition-opacity duration-500 motion-reduce:transition-none sm:p-6 ${
                isAlert ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-xl">
                  <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#b23a2f]">
                    <span className="inline-block h-2 w-2 rounded-full bg-[#b23a2f]" aria-hidden />
                    Needs attention
                  </p>
                  <p className="mt-2 font-heading text-xl text-ink">{hh.parentName} hasn't responded to the nudge or the check-in.</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink/60">
                    {state.ack
                      ? `${state.ack.by} acknowledged at ${fmtClock(state.ack.ts)} — siblings notified.`
                      : hh.callPlan
                        ? `Plan: call ${hh.parentName} after ${hh.callPlan.callElderAfterMin} min, alert the circle after ${hh.callPlan.alertCircleAfterMin} min.`
                        : 'A call is usually the right next step.'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  <a
                    href="#"
                    onClick={(e) => e.preventDefault()}
                    title="Wire your number in settings — this demo cannot place calls"
                    className={`rounded-full bg-[#b23a2f] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#9e352b] ${FOCUS_ON_RED}`}
                  >
                    📞 Call {hh.parentName}
                  </a>
                  <button
                    onClick={ack}
                    disabled={acking}
                    className={`rounded-full border border-[#b23a2f]/35 bg-[#b23a2f]/[0.05] px-5 py-2.5 text-sm font-medium text-[#77231c] transition-colors hover:bg-[#f6dcd8]/70 disabled:opacity-50 ${FOCUS_ON_RED}`}
                  >
                    {state.ack ? 'Acknowledged ✓' : acking ? 'Noting…' : "I've checked in"}
                  </button>
                  <button
                    onClick={() => postJSON(`/api/v1/household/${id}/snooze`, { minutes: 60 })}
                    className={`rounded-full border border-ink/15 px-5 py-2.5 text-sm text-ink/60 transition-colors hover:border-ink/25 hover:bg-paper ${FOCUS}`}
                  >
                    Snooze 1 h
                  </button>
                </div>
              </div>
              {circle.length > 0 && (
                <p className="mt-3 border-t border-[#b23a2f]/15 pt-3 text-xs text-ink/50">
                  Care circle notified: {circle.map((m) => `${m.name} (${m.role})`).join(' · ')}
                </p>
              )}
            </section>
          </div>
        </div>

        {/* the bento */}
        <div className="mt-6 grid grid-cols-12 gap-4 sm:gap-5">
          <StatusCard bundle={bundle} />
          <TrendCard bundle={bundle} />
          <CommandsCard id={id} bundle={bundle} />
          <TalkbackCard id={id} parentName={hh.parentName} childName={hh.childName} />
          <RhythmCard bundle={bundle} />
          <LadderCard tier={state.tier} />
          <ExplainCard bundle={bundle} />
          <NightWatchCard events={bundle.sleepSound} />
          <MovementCard movement={bundle.movement} nowTs={bundle.simNowTs} />
          <BlueprintMap id={id} />
          <CsiScope id={id} />
          <AnalysisCard id={id} bundle={bundle} />
          <CircleCard id={id} bundle={bundle} />
          <PushCard id={id} />
          <EventsCard bundle={bundle} />
          <SourcesCard id={id} bundle={bundle} />
        </div>

        <p className="mt-10 text-center text-xs leading-relaxed text-ink/40">
          Khayaal never shows a feed, a map or a recording — this page only ever sees what you see. Signals are
          AES-256-GCM encrypted at rest and discarded after 7 days.
        </p>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------

function StatusCard({ bundle }: { bundle: ReturnType<typeof useHouseholdState>['bundle'] }) {
  if (!bundle) return null;
  const { state, household: hh } = bundle;
  const meta = TIER_META[state.tier];
  return (
    <BentoCard label="Current status" className="col-span-12 lg:col-span-5">
      <div className="flex h-full flex-col">
        <CardTitle note={state.learning ? undefined : `confidence ${Math.round(state.confidence * 100)}%`}>{meta.label}</CardTitle>
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
          {state.snoozeUntilTs && state.snoozeUntilTs > bundle.simNowTs && <> Quiet until {fmtClock(state.snoozeUntilTs)}.</>}
        </p>
      </div>
    </BentoCard>
  );
}

function TrendCard({ bundle }: { bundle: ReturnType<typeof useHouseholdState>['bundle'] }) {
  if (!bundle) return null;
  return (
    <BentoCard label="24 hour score trend" className="col-span-12 lg:col-span-7">
      <CardTitle note="last 24 h">The day so far</CardTitle>
      <TrendChart trend={bundle.state.scoreTrend} nowTs={bundle.simNowTs} />
    </BentoCard>
  );
}

function CommandsCard({ id, bundle }: { id: string; bundle: ReturnType<typeof useHouseholdState>['bundle'] }) {
  const [type, setType] = useState<'message' | 'reminder' | 'tts' | 'request_checkin'>('message');
  const [lang, setLang] = useState<'en' | 'hi'>('en');
  const [text, setText] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!bundle) return null;

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await postJSON(`/api/v1/household/${id}/commands`, { type, text: text.trim(), lang });
      setSent(text.trim());
      setText('');
      setTimeout(() => setSent(null), 2500);
    } finally {
      setBusy(false);
    }
  };

  const pending = bundle.commands;

  return (
    <BentoCard label="Reach her phone" className="col-span-12 lg:col-span-7">
      <CardTitle note={pending.length > 0 ? `${pending.length} awaiting her phone` : 'delivered over the commands channel'}>
        Reach her phone
      </CardTitle>
      <div className="mt-4 flex flex-wrap gap-2">
        {(
          [
            ['message', '💬 Message'],
            ['reminder', '⏰ Reminder'],
            ['tts', '🗣 Voice (spoken aloud)'],
            ['request_checkin', '🌼 Ask for check-in'],
          ] as const
        ).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setType(t)}
            aria-pressed={type === t}
            className={`rounded-full border px-4 py-1.5 text-[13px] transition-colors ${
              type === t
                ? 'border-clay bg-clay/10 text-claydeep'
                : 'border-ink/15 text-ink/60 hover:border-ink/25 hover:bg-paper'
            } ${FOCUS}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 280))}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={
            type === 'tts'
              ? lang === 'hi'
                ? 'हिंदी में लिखें — फ़ोन पर बोलकर सुनाया जाएगा…'
                : 'Will be spoken aloud on her phone…'
              : type === 'reminder'
                ? lang === 'hi'
                  ? 'सुबह 8 बजे दवा लेना…'
                  : 'Take your blood pressure pill at 8'
                : lang === 'hi'
                  ? 'एक छोटा, प्यारा संदेश…'
                  : 'A short, warm message…'
          }
          className="min-w-0 flex-1 rounded-full border border-ink/15 bg-paper px-4 py-2.5 text-sm text-ink outline-none transition-colors focus:border-clay focus:ring-2 focus:ring-clay/15"
        />
        <div className="flex flex-none overflow-hidden rounded-full border border-ink/15 text-xs">
          {(['en', 'hi'] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              aria-pressed={lang === l}
              className={`px-3 py-2.5 transition-colors ${lang === l ? 'bg-ink text-paper' : 'text-ink/50 hover:bg-paper'} ${FOCUS_ON_PAPER}`}
            >
              {l === 'en' ? 'EN' : 'हिं'}
            </button>
          ))}
        </div>
        <button
          onClick={send}
          disabled={busy || !text.trim()}
          className={`flex-none rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-ink/85 disabled:opacity-40 ${FOCUS}`}
        >
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
      {sent && <p className="mt-2 text-xs text-[#4c7a4f]">Sent ✓ — her phone picks it up on the next poll.</p>}
      {pending.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {pending.slice(-3).map((c) => (
            <li key={c.id} className="truncate text-xs text-ink/45">
              pending · {c.type}: “{c.text}”
            </li>
          ))}
        </ul>
      )}
    </BentoCard>
  );
}

function RhythmCard({ bundle }: { bundle: ReturnType<typeof useHouseholdState>['bundle'] }) {
  if (!bundle) return null;
  const activity = bundle.hourlyActivity;
  const max = Math.max(1, ...activity);
  const nowHour = new Date(bundle.simNowTs).getHours();
  return (
    <BentoCard label="Rhythm map" className="col-span-12 lg:col-span-5">
      <CardTitle note="today, hour by hour">Rhythm map</CardTitle>
      <div className="mt-4 flex h-20 items-end gap-[3px]">
        {activity.map((v, h) => (
          <div key={h} className="group relative flex-1">
            <div
              className="w-full rounded-t transition-all duration-500 motion-reduce:transition-none"
              style={{
                height: `${Math.max(4, (v / max) * 76)}px`,
                background: h === nowHour ? '#b95c38' : v === 0 ? '#e7e0d3' : '#7d8c6f',
                opacity: h > nowHour ? 0.35 : 1,
              }}
            />
            <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-ink px-1.5 py-0.5 text-[10px] text-paper group-hover:block">
              {h}:00 · {v}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink/45">
        Signal counts per hour — her ordinary day, drawn from harmless aggregates. No content, no location.
      </p>
    </BentoCard>
  );
}

function LadderCard({ tier }: { tier: number }) {
  return (
    <BentoCard label="Escalation ladder" className="col-span-12 lg:col-span-5">
      <CardTitle note="most days, step 3 never comes">Where things stand</CardTitle>
      <div className="mt-4 space-y-2.5">
        {[
          ['Quiet observation', 'signals only — nobody is contacted', 0],
          ['Gentle nudge', 'on her phone; nothing has left the house', 1],
          ['Check-in asked', 'one clear question, one tap to answer', 2],
          ['Family alerted', 'with last-known signals attached', 3],
        ].map(([label, desc, t], i) => {
          const active = tier >= (t as number);
          return (
            <div key={label as string} className="flex items-center gap-3">
              <span
                className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[11px] font-semibold transition-colors duration-500 motion-reduce:transition-none"
                style={{ background: active ? (i === 3 ? '#b23a2f' : i === 0 ? '#4c7a4f' : '#c98a2b') : '#efe9de', color: active ? 'white' : '#a2988a' }}
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
  );
}

function ExplainCard({ bundle }: { bundle: ReturnType<typeof useHouseholdState>['bundle'] }) {
  if (!bundle) return null;
  const { state } = bundle;
  const meta = TIER_META[state.tier];
  return (
    <BentoCard label="Why this score" className="col-span-12 lg:col-span-7">
      <CardTitle note="plain language, always">Why this score</CardTitle>
      <div className="mt-5 space-y-3.5">
        {state.learning && <p className="text-sm text-ink/60">Khayaal is still learning — nothing is being scored yet.</p>}
        {!state.learning && state.contributions.length === 0 && (
          <p className="text-sm text-ink/60">Everything we look for is present and ordinary. Nothing to explain.</p>
        )}
        {state.contributions.map((c, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="mt-1.5 h-2 w-24 flex-none overflow-hidden rounded-full bg-ink/10">
              <div
                className="h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none"
                style={{ width: `${Math.min(100, (c.effect / 30) * 100)}%`, background: meta.color }}
              />
            </div>
            <p className="text-sm leading-relaxed text-ink/75">{c.reason}</p>
          </div>
        ))}
        {!state.learning && (
          <p className="pt-1 text-xs leading-relaxed text-ink/40">
            A missing source lowers confidence — it never raises the score on its own. Signals are AES-256-GCM encrypted
            at rest and discarded after 7 days.
          </p>
        )}
      </div>
    </BentoCard>
  );
}

function AnalysisCard({ id, bundle }: { id: string; bundle: ReturnType<typeof useHouseholdState>['bundle'] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<'minimax' | 'nvidia' | 'openrouter'>('minimax');
  const [apiKey, setApiKey] = useState('');
  const [text, setText] = useState<string | null>(bundle?.household.lastAnalysis?.text ?? null);
  const [model, setModel] = useState<string | null>(bundle?.household.lastAnalysis?.model ?? null);
  if (!bundle) return null;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await postJSON<{ analysis: { text: string; model: string } }>(`/api/v1/household/${id}/analysis`, {
        provider,
        apiKey: apiKey || undefined,
      });
      setText(r.analysis.text);
      setModel(r.analysis.model);
      setApiKey('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <BentoCard label="AI behaviour analysis" className="col-span-12 lg:col-span-7">
      <CardTitle note={model ? `last: ${model}` : 'MiniMax · NVIDIA · OpenRouter'}>
        Behaviour analysis, read by an LLM
      </CardTitle>
      <p className="mt-2 text-xs leading-relaxed text-ink/45">
        Only privacy-safe aggregates leave the house: score trend, tier changes, hourly shape, recurring reasons.
        Never content — there is none.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as 'minimax' | 'nvidia' | 'openrouter')}
          className={`rounded-full border border-ink/15 bg-paper px-3 py-2 text-sm outline-none transition-colors focus:border-clay focus:ring-2 focus:ring-clay/15 ${FOCUS_ON_PAPER}`}
        >
          <option value="minimax">MiniMax</option>
          <option value="nvidia">NVIDIA NIM</option>
          <option value="openrouter">OpenRouter</option>
        </select>
        <input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="API key (or set env on the server)"
          className="min-w-[180px] flex-1 rounded-full border border-ink/15 bg-paper px-4 py-2 text-sm outline-none transition-colors focus:border-clay focus:ring-2 focus:ring-clay/15"
        />
        <button
          onClick={run}
          disabled={busy}
          className={`rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper transition-colors hover:bg-ink/85 disabled:opacity-40 ${FOCUS}`}
        >
          {busy ? 'Reading the week…' : 'Run analysis'}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-[#b23a2f]">{error}</p>}
      {text && (
        <div className="mt-4 whitespace-pre-wrap rounded-2xl bg-paper/80 p-4 text-[13.5px] leading-relaxed text-ink/80">{text}</div>
      )}
    </BentoCard>
  );
}

function CircleCard({ id, bundle }: { id: string; bundle: ReturnType<typeof useHouseholdState>['bundle'] }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'family' | 'neighbor'>('neighbor');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!bundle) return null;
  const circle = bundle.household.careCircle ?? [];

  const manage = async (action: 'add' | 'remove', memberEmail?: string) => {
    setBusy(true);
    setError(null);
    try {
      await postJSON(`/api/v1/household/${id}/circle`, {
        action,
        name,
        email: memberEmail ?? email,
        phone: action === 'add' ? phone.trim() || undefined : undefined,
        role,
      });
      setName('');
      setEmail('');
      setPhone('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <BentoCard label="Care circle" className="col-span-12 lg:col-span-5">
      <CardTitle note="neighbours who can check in">Care circle</CardTitle>
      <ul className="mt-4 space-y-2">
        {circle.length === 0 && (
          <li className="rounded-xl border border-dashed border-ink/20 p-3 text-xs leading-relaxed text-ink/45">
            Add family and trusted neighbours — when a real alert fires, they're notified too and can visit.
          </li>
        )}
        {circle.map((m) => (
          <li key={m.email} className="flex items-center justify-between rounded-xl border border-ink/10 bg-paper px-3.5 py-2.5 text-sm">
            <span>
              {m.name} <span className="text-xs text-ink/40">({m.role})</span>
              <span className="block text-xs text-ink/40">
                {m.email}
                {m.phone ? ` · ${m.phone}` : ''}
              </span>
            </span>
            <button
              onClick={() => manage('remove', m.email)}
              disabled={busy}
              className={`rounded-full px-2 py-1 text-xs text-ink/40 transition-colors hover:bg-[#f6dcd8]/60 hover:text-[#b23a2f] disabled:opacity-40 ${FOCUS_ON_PAPER_RED}`}
            >
              remove
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 space-y-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="w-full rounded-full border border-ink/15 bg-paper px-4 py-2 text-sm outline-none transition-colors focus:border-clay focus:ring-2 focus:ring-clay/15" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (they sign in with Google)" className="w-full rounded-full border border-ink/15 bg-paper px-4 py-2 text-sm outline-none transition-colors focus:border-clay focus:ring-2 focus:ring-clay/15" />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (for the alert call chain)" className="w-full rounded-full border border-ink/15 bg-paper px-4 py-2 text-sm outline-none transition-colors focus:border-clay focus:ring-2 focus:ring-clay/15" />
        <div className="flex items-center justify-between gap-2">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'family' | 'neighbor')}
            className={`rounded-full border border-ink/15 bg-paper px-3 py-2 text-sm outline-none transition-colors focus:border-clay focus:ring-2 focus:ring-clay/15 ${FOCUS_ON_PAPER}`}
          >
            <option value="neighbor">Neighbour</option>
            <option value="family">Family</option>
          </select>
          <button
            onClick={() => manage('add')}
            disabled={busy || !email.includes('@')}
            className={`rounded-full bg-ink px-4 py-2 text-sm text-paper transition-colors hover:bg-ink/85 disabled:opacity-40 ${FOCUS}`}
          >
            Add to circle
          </button>
        </div>
        {error && <p className="text-xs text-[#b23a2f]">{error}</p>}
        <p className="text-[11px] leading-relaxed text-ink/40">
          Circle members sign in at /login and claim this household with its pairing code. On a real alert they are
          notified alongside the family — a neighbour can be the fastest help there is. Phone numbers power the
          escalation call chain (free dialer hand-off, no SMS gateway needed).
        </p>
      </div>
    </BentoCard>
  );
}

function PushCard({ id }: { id: string }) {
  const [status, setStatus] = useState<'idle' | 'on' | 'unsupported' | 'denied'>('idle');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported');
      return;
    }
    navigator.serviceWorker
      .ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setStatus(sub ? 'on' : 'idle'))
      .catch(() => setStatus('idle'));
  }, []);

  const subscribe = async () => {
    setBusy(true);
    setNote(null);
    try {
      const info = await fetch('/api/v1/server-info').then((r) => r.json());
      const key = info.vapidPublicKey as string | null;
      if (!key) {
        setNote('Push keys are not configured on this server yet.');
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js');
      await reg.update();
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      }
      await postJSON(`/api/v1/household/${id}/push-subscribe`, sub.toJSON());
      setStatus('on');
      setNote("This browser will now receive urgent alerts — even with the tab closed.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setNote(/permission|denied/i.test(msg) ? 'Notification permission was denied in the browser.' : msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BentoCard label="Alerts on this device" className="col-span-12 lg:col-span-5">
      <CardTitle note="free browser push, no SMS gateway">Alerts on this device</CardTitle>
      <p className="mt-3 text-sm leading-relaxed text-ink/55">
        When an urgent alert fires, this laptop or tablet is nudged too — the notification arrives even with
        Khayaal closed, straight from the browser's own push channel.
      </p>
      <div className="mt-4 flex items-center gap-3">
        {status === 'unsupported' ? (
          <span className="text-sm text-ink/40">This browser can't receive push notifications.</span>
        ) : (
          <button
            onClick={subscribe}
            disabled={busy || status === 'on'}
            className={`rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-ink/85 disabled:opacity-40 ${FOCUS}`}
          >
            {status === 'on' ? 'Alerts are on ✓' : busy ? 'Enabling…' : 'Enable urgent alerts here'}
          </button>
        )}
      </div>
      {note && <p className="mt-3 text-xs leading-relaxed text-ink/50">{note}</p>}
    </BentoCard>
  );
}

function EventsCard({ bundle }: { bundle: ReturnType<typeof useHouseholdState>['bundle'] }) {
  if (!bundle) return null;
  return (
    <BentoCard label="Recent events" className="col-span-12 lg:col-span-5">
      <CardTitle note="audit trail">Quiet log</CardTitle>
      <ul className="mt-4 space-y-2 text-sm">
        {bundle.events.slice(-6).reverse().map((e) => (
          <li key={e.id} className="flex items-baseline gap-3 text-sm">
            <span className="flex-none text-xs tabular-nums text-ink/40">{fmtClock(e.ts)}</span>
            <span className="text-ink/75">{e.meta ?? (e.type === 'tier_change' ? `tier ${e.from} → ${e.to}` : e.type)}</span>
          </li>
        ))}
        {bundle.events.length === 0 && <li className="text-sm text-ink/40">A quiet day. Nothing to report.</li>}
      </ul>
    </BentoCard>
  );
}

/**
 * The scan comes back in one of a few shapes depending on which server wrote
 * it: a bare array (the original), or {networks, count, error, ts}. Rather
 * than guess, read every shape the API has ever produced and normalise to the
 * list, the reason it might be empty, and the moment it landed.
 */
function readScan(payload: unknown): {
  list: { ssid: string; rssi: number; secure: boolean }[] | null;
  error: string | null;
  ts: number | null;
} {
  const isList = (v: unknown): v is { ssid: string; rssi: number; secure: boolean }[] => Array.isArray(v);
  const body = (payload ?? {}) as Record<string, unknown>;
  const scan = body.scan ?? body;
  const errOf = (o: Record<string, unknown>) => (typeof o.error === 'string' ? o.error : null);
  const tsOf = (o: Record<string, unknown>) => (typeof o.ts === 'number' ? o.ts : null);

  if (isList(scan)) return { list: scan, error: null, ts: null };
  if (scan && typeof scan === 'object') {
    const inner = (scan as Record<string, unknown>).networks;
    if (isList(inner)) {
      const o = scan as Record<string, unknown>;
      return { list: inner, error: errOf(o), ts: tsOf(o) };
    }
  }
  // The wrapper itself may carry the list, when the server stores it flat.
  if (isList(body.networks)) {
    return { list: body.networks, error: errOf(body), ts: tsOf(body) };
  }
  return { list: null, error: null, ts: null };
}

/** The USB relay checks in every 3 s; a longer gap means it is not there. */
const RELAY_STALE_MS = 30_000;

function WiFiPanel({ id, sourceId }: { id: string; sourceId: string }) {
  const [networks, setNetworks] = useState<{ ssid: string; rssi: number; secure: boolean }[] | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [relayError, setRelayError] = useState<string | null>(null);
  const [relaySeenTs, setRelaySeenTs] = useState<number | null>(null);
  const [status, setStatus] = useState<{ connected?: boolean; ssid?: string; rssi?: number; ip?: string; ts?: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  /** When the scan on screen landed. A new scan must be newer than this. */
  const scanTsRef = useRef<number | null>(null);
  const relaySeenRef = useRef<number | null>(null);

  // The relay checks in every 3 s, so a gap longer than this means it is
  // gone — stopped, unplugged, or working from stale credentials.
  const relayAlive = (ts: number | null) => ts !== null && Date.now() - ts < RELAY_STALE_MS;

  const refresh = async () => {
    try {
      const r = await fetch(`/api/v1/household/${id}/sources/${sourceId}/wifi`).then((x) => x.json());
      const { list, error, ts } = readScan(r);
      // A leftover scan must never replace a newer one already on screen.
      if (list && (ts ?? 0) >= (scanTsRef.current ?? 0)) {
        setNetworks(list);
        if (ts !== null) scanTsRef.current = ts;
        setScanError(error);
      }
      setStatus(r.status ?? null);
      if (r.relay?.lastSeenTs) {
        relaySeenRef.current = r.relay.lastSeenTs;
        setRelaySeenTs(r.relay.lastSeenTs);
      }
      return list;
    } catch {
      /* panel stays with what it has */
      return null;
    }
  };
  useEffect(() => {
    void refresh();
    // Keep the relay's heartbeat line honest: it has to notice the relay
    // going away, not keep claiming the relay is fine.
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [id, sourceId]);

  const queue = async (action: string, payload?: Record<string, unknown>) => {
    setBusy(action);
    setNote(null);
    setRelayError(null);
    setScanError(null);
    try {
      const queued = await postJSON<{ ts?: number }>(
        `/api/v1/household/${id}/sources/${sourceId}/actions`,
        { action, ...payload },
      );
      // The server's clock when the action was queued. Anything that lands
      // after this moment is the answer to THIS request — a scan left over
      // from an earlier press must not pass itself off as the new one.
      const since = queued.ts ?? 0;

      if (action === 'wifi_scan') {
        setNote('Scanning — the USB relay types it to the sensor and waits for the list…');
        // The scan is a serial round-trip: give it room, then report honestly.
        // The list may land after the window closes (the relay posts when the
        // sensor finishes), so the final refresh below is what decides whether
        // we saw something — not the loop.
        let landed = false;
        for (let i = 0; i < 15; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          const r = await fetch(`/api/v1/household/${id}/sources/${sourceId}/wifi`).then((x) => x.json());
          const { list, error, ts } = readScan(r);
          if (r.relay?.lastSeenTs) {
            relaySeenRef.current = r.relay.lastSeenTs;
            setRelaySeenTs(r.relay.lastSeenTs);
          }
          if (list && (ts ?? 0) > since) {
            setNetworks(list);
            scanTsRef.current = ts ?? null;
            setScanError(error);
            setNote(null);
            landed = true;
            break;
          }
        }
        if (!landed) {
          // Never go quiet. Say which half is missing: the relay, or the
          // sensor behind it.
          setRelayError(
            relayAlive(relaySeenRef.current)
              ? 'The USB relay is running, but the sensor did not answer the scan. Check that the room sensor is plugged into this Mac and awake.'
              : 'No answer from the USB relay. It has to be running on this Mac — python3 firmware/tunnel/khayaal_serial_bridge.py. If it is already running, its credentials are out of date (the server keeps sources in memory): python3 firmware/tunnel/register_source.py',
          );
          setNote(null);
        }
        await refresh();
      } else if (action === 'wifi_connect' || action === 'wififorget') {
        setNote('Applying — checking in ~12 s…');
        let landed = false;
        for (let i = 0; i < 8; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          const r = await fetch(`/api/v1/household/${id}/sources/${sourceId}/wifi`).then((x) => x.json());
          const st = (r.status ?? null) as { ts?: number } | null;
          if (st && (st.ts ?? 0) > since) {
            setStatus(st);
            landed = true;
            break;
          }
        }
        if (!landed) {
          setRelayError(
            'The sensor did not report back after the change. The USB relay may not be running — python3 firmware/tunnel/khayaal_serial_bridge.py',
          );
        }
        setNote(null);
        await refresh();
      }
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(null);
    }
  };

  const bars = (rssi: number) => (rssi > -55 ? '▮▮▮▮' : rssi > -65 ? '▮▮▮' : rssi > -75 ? '▮▮' : '▮');

  return (
    <div className="mt-3 rounded-2xl border border-ink/10 bg-paper/70 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Wi-Fi, laptop-style — runs over the sensor's USB link</p>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
        <span className={status?.connected ? 'text-ink/80' : 'text-[#b23a2f]'}>
          {status?.connected
            ? `Connected to ${status.ssid} · ${bars(status.rssi ?? -80)} ${status.rssi ?? ''} dBm${status.ip ? ` · ${status.ip}` : ''}`
            : 'Not connected to any network'}
        </span>
        <button
          onClick={() => queue('wifi_scan')}
          disabled={busy !== null}
          className={`rounded-full border border-ink/15 px-3 py-1 text-xs text-ink/70 transition-colors hover:bg-ink hover:text-paper disabled:opacity-40 ${FOCUS_ON_PAPER}`}
        >
          {busy === 'wifi_scan' ? 'Scanning…' : 'Scan networks'}
        </button>
        {status?.connected && (
          <button
            onClick={() => queue('wififorget')}
            disabled={busy !== null}
            className={`rounded-full border border-ink/15 px-3 py-1 text-xs text-ink/70 transition-colors hover:bg-[#b23a2f] hover:text-paper disabled:opacity-40 ${FOCUS_ON_PAPER}`}
          >
            Forget Wi-Fi
          </button>
        )}
      </div>
      {note && <p className="mt-2 text-xs text-ink/50">{note}</p>}
      <p className="mt-1.5 text-[11px] text-ink/45">
        {relaySeenTs ? (
          relayAlive(relaySeenTs) ? (
            <>USB relay: checking in every 3 s — last {fmtAgo(relaySeenTs, Date.now())}.</>
          ) : (
            <>USB relay: not checking in — last seen {fmtAgo(relaySeenTs, Date.now())}.</>
          )
        ) : (
          <>USB relay: not checking in. Start it on this Mac — <code>python3 firmware/tunnel/khayaal_serial_bridge.py</code>.</>
        )}
      </p>
      {relayError && (
        <p className="mt-2 rounded-xl border border-[#b23a2f]/25 bg-[#f6dcd8]/50 px-3 py-2 text-xs leading-relaxed text-[#77231c]">
          {relayError}
        </p>
      )}
      {scanError && (
        <p className="mt-2 rounded-xl border border-[#b23a2f]/25 bg-[#f6dcd8]/50 px-3 py-2 text-xs leading-relaxed text-[#77231c]">
          The scan came back empty — {scanError}.
        </p>
      )}
      {networks && networks.length === 0 && !scanError && !relayError && (
        <p className="mt-2 text-xs text-ink/45">No networks found nearby.</p>
      )}
      {networks && networks.length > 0 && (
        <ul className="mt-3 divide-y divide-ink/5">
          {networks
            .slice()
            .sort((a, b) => b.rssi - a.rssi)
            .map((n) => (
              <li key={n.ssid}>
                <button
                  onClick={() => {
                    setSelected(n.ssid);
                    setPassword('');
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-paper ${selected === n.ssid ? 'bg-paper' : ''} ${FOCUS_ON_PAPER}`}
                >
                  <span className="text-ink/80">
                    {n.secure && <span className="mr-1.5 text-ink/40">🔒</span>}
                    {n.ssid}
                  </span>
                  <span className="text-xs text-ink/40">{bars(n.rssi)}</span>
                </button>
              </li>
            ))}
        </ul>
      )}
      {selected && (
        <div className="mt-3 flex gap-2">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && queue('wifi_connect', { ssid: selected, password })}
            placeholder={`Password for ${selected}`}
            className="min-w-0 flex-1 rounded-full border border-ink/15 bg-white px-4 py-2 text-sm outline-none transition-colors focus:border-clay focus:ring-2 focus:ring-clay/15"
          />
          <button
            onClick={() => queue('wifi_connect', { ssid: selected, password })}
            disabled={busy !== null || password.length < 8}
            className={`flex-none rounded-full bg-ink px-4 py-2 text-sm text-paper transition-colors hover:bg-ink/85 disabled:opacity-40 ${FOCUS}`}
          >
            {busy === 'wifi_connect' ? 'Joining…' : 'Connect'}
          </button>
        </div>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-ink/40">
        Needs the sensor's USB cable plugged into this Mac with the relay running:
        <code className="mx-1">python3 firmware/tunnel/khayaal_serial_bridge.py</code>
        — the dashboard queues the action, the relay types it to the sensor over USB and posts the scan
        results back. Passwords travel family-session → server → USB relay only; they are never stored.
      </p>
    </div>
  );
}

function SourcesCard({ id, bundle }: { id: string; bundle: ReturnType<typeof useHouseholdState>['bundle'] }) {
  const [created, setCreated] = useState<{ id: string; apiKey: string } | null>(null);
  const [host, setHost] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testedSrc, setTestedSrc] = useState<string | null>(null);
  const [wifiOpenFor, setWifiOpenFor] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);

  const [connectState, setConnectState] = useState<'idle' | 'waiting' | 'connected'>('idle');
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  const connectTimer = useRef<number | null>(null);

  useEffect(() => {
    fetch('/api/v1/server-info').then((r) => r.json()).then((i) => setHost(i.lanBaseUrl ?? 'http://localhost:3100')).catch(() => {});
    fetch(`/api/v1/household/${id}/pairing-code`).then((r) => (r.ok ? r.json() : null)).then((d) => d && setPairingCode(d.pairingCode)).catch(() => {});
    return () => {
      if (connectTimer.current) window.clearTimeout(connectTimer.current);
    };
  }, [id]);

  /**
   * One-click Connect: mint the source, park the pairing request, and the
   * USB relay running on this laptop types the identity into the board over
   * its serial port. The effect below watches the new source go live.
   */
  const connectSensor = async () => {
    if (!bundle) return;
    setError(null);
    setConnectState('waiting');
    setConnectSourceId(null);
    // If a relay should be checking in and is not, say so before waiting 60 s.
    // Most-recently-seen first: the relay polls as whichever sensor it last
    // paired, so the live one may not be the first in the list.
    const espSources = bundle.sources
      .filter((s) => s.type === 'esp32')
      .sort((a, b) => (b.lastSeenTs ?? 0) - (a.lastSeenTs ?? 0));
    let relayAlive = espSources.length === 0; // first-ever sensor: nothing to check against
    for (const s of espSources) {
      try {
        const w = await fetch(`/api/v1/household/${id}/sources/${s.id}/wifi`, { cache: 'no-store' });
        if (w.ok) {
          const d = (await w.json()) as { relay?: { lastSeenTs?: number | null } };
          const seen = d.relay?.lastSeenTs;
          if (seen && Date.now() - seen < RELAY_STALE_MS) {
            relayAlive = true;
            break;
          }
        }
      } catch {
        /* try the next source */
      }
    }
    if (!relayAlive) {
      setConnectState('idle');
      // The relay cannot poll a household it has no credentials for — that
      // happens after every server restart (sources live in memory). Give
      // the family the one command that fixes it, code included.
      setError(
        pairingCode
          ? `The USB relay is not checking in. Run this once on this laptop (it registers the relay into this family), then press Connect again:`
          : 'The USB relay is not checking in and no pairing code is on screen yet — open the Watchers card to get one, then run: python3 firmware/tunnel/khayaal_serial_bridge.py --pair-code <code>',
      );
      return;
    }
    try {
      const d = await postJSON<{ requestId: string }>(`/api/v1/household/${id}/sensor/connect`, {});
      setConnectSourceId(d.requestId);
      if (connectTimer.current) window.clearTimeout(connectTimer.current);
      connectTimer.current = window.setTimeout(() => {
        setConnectState((st) => {
          if (st !== 'waiting') return st;
          setError('The sensor did not come alive within 60 s. Check the board is plugged into this laptop (the green LED should pulse), and that the relay is running.');
          return 'idle';
        });
      }, 60_000);
    } catch (e) {
      setConnectState('idle');
      setError(e instanceof Error ? e.message : 'Failed');
    }
  };

  useEffect(() => {
    if (connectState !== 'waiting' || !connectSourceId || !bundle) return;
    const src = bundle.sources.find((s) => s.id === connectSourceId);
    if (src?.lastSeenTs && bundle.simNowTs - src.lastSeenTs < 30 * 60_000) {
      if (connectTimer.current) window.clearTimeout(connectTimer.current);
      setConnectState('connected');
    }
  }, [bundle, connectState, connectSourceId]);

  if (!bundle) return null;
  const addSensor = async () => {
    setBusy(true);
    setError(null);
    try {
      const src = await postJSON<{ id: string; apiKey: string }>(`/api/v1/household/${id}/sources`, {
        type: 'esp32',
        label: 'Room sensor (ESP32)',
      });
      setCreated({ id: src.id, apiKey: src.apiKey });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const fallTest = async (sourceId: string) => {
    setError(null);
    try {
      await postJSON(`/api/v1/household/${id}/sources/${sourceId}/actions`, { action: 'falltest' });
      setTestedSrc(sourceId);
      setTimeout(() => setTestedSrc(null), 6000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  };

  const serialBlock = created
    ? [
        `mode lan`,
        `host ${host}`,
        `hh ${id}`,
        `src ${created.id}`,
        `key ${created.apiKey}`,
      ].join('\n')
    : null;

  return (
    <BentoCard label="Sources" className="col-span-12">
      <CardTitle note="never a feed, never a map">The watchers</CardTitle>
      {pairingCode && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm">
          <span className="text-ink/60">
            Pairing code for a new phone or sensor:
            <span className="ml-2 font-mono text-lg tracking-[0.2em] text-clay">{pairingCode}</span>
          </span>
          <button
            onClick={async () => {
              try {
                const d = await postJSON<{ pairingCode: string }>(`/api/v1/household/${id}/pairing-code`, {});
                setPairingCode(d.pairingCode);
              } catch {
                /* keep showing the old one */
              }
            }}
            className={`ml-auto rounded-full border border-ink/15 px-3 py-1 text-xs text-ink/60 transition-colors hover:bg-ink hover:text-paper ${FOCUS}`}
          >
            regenerate
          </button>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        {bundle.sources.map((s) => {
          const fresh = s.lastSeenTs && bundle.simNowTs - s.lastSeenTs < 30 * 60_000;
          const isEsp = s.type === 'esp32';
          return (
            <span key={s.id} className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-paper px-4 py-2 text-sm text-ink/80">
              <span className="h-2 w-2 rounded-full" style={{ background: fresh ? '#4c7a4f' : '#c9b8a0' }} />
              {s.label}
              <span className="text-xs text-ink/40">{s.lastSeenTs ? fmtAgo(s.lastSeenTs, bundle.simNowTs) : 'not seen yet'}</span>
              {isEsp && (
                <>
                  <button
                    onClick={() => fallTest(s.id)}
                    className={`rounded-full border border-ink/15 px-2.5 py-0.5 text-xs text-ink/60 transition-colors hover:bg-ink hover:text-paper ${FOCUS_ON_PAPER}`}
                  >
                    {testedSrc === s.id ? 'firing…' : 'fall test'}
                  </button>
                  <button
                    onClick={() => setWifiOpenFor(wifiOpenFor === s.id ? null : s.id)}
                    aria-pressed={wifiOpenFor === s.id}
                    className={`rounded-full border border-ink/15 px-2.5 py-0.5 text-xs text-ink/60 transition-colors hover:bg-ink hover:text-paper ${FOCUS_ON_PAPER}`}
                  >
                    Wi-Fi
                  </button>
                </>
              )}
            </span>
          );
        })}
        <button
          onClick={connectSensor}
          disabled={connectState === 'waiting'}
          className={`rounded-full border border-ink bg-ink px-4 py-2 text-sm text-paper transition-colors hover:bg-ink/85 disabled:opacity-50 ${FOCUS}`}
        >
          {connectState === 'waiting' ? 'Connecting…' : 'Connect room sensor (plug in via USB)'}
        </button>
        <button
          onClick={addSensor}
          disabled={busy}
          className={`rounded-full border border-dashed border-ink/25 px-4 py-2 text-sm text-ink/55 transition-colors hover:border-ink/40 hover:bg-paper disabled:opacity-40 ${FOCUS}`}
        >
          {busy ? 'Pairing…' : '+ Add manually'}
        </button>
      </div>
      {connectState === 'waiting' && (
        <p className="mt-3 text-sm text-ink/60">
          Identity minted — the USB relay is typing it into the board. Keep the ESP32 plugged into this laptop; this
          finishes on its own.
        </p>
      )}
      {connectState === 'connected' && (
        <p className="mt-3 text-sm text-[#4c7a4f]">
          Room sensor connected — it is streaming live. Wave a hand in front of it and watch the blueprint.
        </p>
      )}
      {error && <p className="mt-3 text-sm leading-relaxed text-[#b23a2f]">{error}</p>}
      {error && pairingCode && error.startsWith('The USB relay is not checking in') && (
        <pre className="mt-2 overflow-x-auto rounded-xl bg-ink/90 px-4 py-3 font-mono text-[12.5px] text-paper/90">{`pkill -f khayaal_serial_bridge; python3 firmware/tunnel/khayaal_serial_bridge.py --pair-code ${pairingCode}`}</pre>
      )}
      {wifiOpenFor && <WiFiPanel id={id} sourceId={wifiOpenFor} />}
      {serialBlock && (
        <div className="mt-4 rounded-2xl border border-ink/10 bg-paper/70 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Paste into the sensor's serial monitor (115200) — the key is shown once</p>
          <pre className="mt-2 overflow-x-auto whitespace-pre text-[12.5px] leading-relaxed text-ink/80">{serialBlock}</pre>
          <p className="mt-2 text-[11px] leading-relaxed text-ink/40">
            Flash first with <code>bash firmware/test-pipeline.sh flash</code>. The sensor seals its traffic with
            AES-256-GCM under this key — <code>show</code> should say state=idle, wifi=up, encrypt=on.
          </p>
        </div>
      )}
    </BentoCard>
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
          <rect x="0" y={Y(100)} width={W} height={Y(72) - Y(100)} fill="#f6dcd8" opacity="0.5" />
          <rect x="0" y={Y(72)} width={W} height={Y(55) - Y(72)} fill="#f8e3d5" opacity="0.45" />
          <rect x="0" y={Y(55)} width={W} height={Y(35) - Y(55)} fill="#f7ecd7" opacity="0.6" />
          <rect x="0" y={Y(35)} width={W} height={Y(0) - Y(35)} fill="#e6efe2" opacity="0.5" />
          {[0, 35, 55, 72].map((b) => (
            <line key={b} x1="0" x2={W} y1={Y(b)} y2={Y(b)} className="stroke-ink/10" strokeWidth="1" strokeDasharray="3 4" />
          ))}
          <path d={`${d}L${last[0]},${CH}L${P[0][0]},${CH}Z`} fill="#7d8c6f" opacity="0.12" />
          <path
            d={d}
            pathLength={1}
            fill="none"
            stroke="#5f7053"
            strokeWidth="2.5"
            strokeLinecap="round"
            style={{ strokeDasharray: 1, strokeDashoffset: drawn || reduce ? 0 : 1, transition: reduce ? 'none' : 'stroke-dashoffset 1.4s cubic-bezier(.3,.8,.2,1) .2s' }}
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

void patchJSON;
