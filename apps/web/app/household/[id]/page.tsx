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
import { useEffect, useState } from 'react';
import { BentoCard, CardTitle, CountUp, smooth, useSize } from '@/components/dashboard/bento';
import { fmtAgo, fmtClock, patchJSON, postJSON, TIER_META, useHouseholdState } from '@/lib/api';

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
          <Link href="/login" className="mt-5 inline-block rounded-full bg-ink px-5 py-2 text-sm text-paper">
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
      className="min-h-screen px-4 pb-16 pt-6 transition-colors duration-700 sm:px-8"
      style={{ background: `linear-gradient(180deg, ${meta.soft} 0%, #faf6ef 40%)` }}
    >
      <div className="mx-auto max-w-5xl">
        {/* header */}
        <header className="flex items-center justify-between">
          <Link href="/login" className="flex items-center gap-2">
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
                <p className="mt-1.5 font-heading text-xl text-ink">{hh.parentName} hasn't responded to the nudge or the check-in.</p>
                <p className="mt-1 text-sm text-ink/60">
                  {state.ack
                    ? `${state.ack.by} acknowledged at ${fmtClock(state.ack.ts)} — siblings notified.`
                    : hh.callPlan
                      ? `Plan: call ${hh.parentName} after ${hh.callPlan.callElderAfterMin} min, alert the circle after ${hh.callPlan.alertCircleAfterMin} min.`
                      : 'A call is usually the right next step.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <a href="#" onClick={(e) => e.preventDefault()} title="Wire your number in settings — this demo cannot place calls" className="rounded-full bg-[#b23a2f] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90">
                  📞 Call {hh.parentName}
                </a>
                <button onClick={ack} disabled={acking} className="rounded-full border border-[#b23a2f]/40 px-5 py-2.5 text-sm font-medium text-[#77231c] transition-colors hover:bg-[#f6dcd8]/60 disabled:opacity-50">
                  {state.ack ? 'Acknowledged ✓' : acking ? 'Noting…' : "I've checked in"}
                </button>
                <button onClick={() => postJSON(`/api/v1/household/${id}/snooze`, { minutes: 60 })} className="rounded-full border border-ink/15 px-5 py-2.5 text-sm text-ink/60 transition-colors hover:bg-paper">
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
        )}

        {/* the bento */}
        <div className="mt-6 grid grid-cols-12 gap-4">
          <StatusCard bundle={bundle} />
          <TrendCard bundle={bundle} />
          <CommandsCard id={id} bundle={bundle} />
          <RhythmCard bundle={bundle} />
          <LadderCard tier={state.tier} />
          <ExplainCard bundle={bundle} />
          <SleepSoundCard bundle={bundle} />
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
            className={`rounded-full border px-4 py-1.5 text-[13px] transition-colors ${type === t ? 'border-clay bg-clay/10 text-claydeep' : 'border-ink/15 text-ink/60 hover:bg-paper'}`}
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
          className="flex-1 rounded-full border border-ink/15 bg-paper px-4 py-2.5 text-sm text-ink outline-none focus:border-clay"
        />
        <div className="flex overflow-hidden rounded-full border border-ink/15 text-xs">
          {(['en', 'hi'] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`px-3 py-2.5 transition-colors ${lang === l ? 'bg-ink text-paper' : 'text-ink/50 hover:bg-paper'}`}
            >
              {l === 'en' ? 'EN' : 'हिं'}
            </button>
          ))}
        </div>
        <button onClick={send} disabled={busy || !text.trim()} className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-40">
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
              className="w-full rounded-t transition-all duration-500"
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
                className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[11px] font-semibold transition-colors duration-500"
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
              <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.min(100, (c.effect / 30) * 100)}%`, background: meta.color }} />
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

function SleepSoundCard({ bundle }: { bundle: ReturnType<typeof useHouseholdState>['bundle'] }) {
  if (!bundle) return null;
  const events = bundle.sleepSound;
  return (
    <BentoCard label="Night watch" className="col-span-12 lg:col-span-5">
      <CardTitle note="on-device · nothing recorded">Night watch</CardTitle>
      <ul className="mt-4 space-y-2 text-sm">
        {events.length === 0 && (
          <li className="text-ink/45">
            No night events yet. Her phone can watch over the night opt-in — it listens for loud sounds only, on-device,
            and shares just the classification.
          </li>
        )}
        {events.slice().reverse().map((s, i) => (
          <li key={i} className="flex items-baseline gap-3">
            <span className="flex-none text-xs tabular-nums text-ink/40">{fmtClock(s.ts)}</span>
            <span className="text-ink/75">
              {s.type === 'sleep_event'
                ? s.value === 'asleep'
                  ? '🌙 Sleeping peacefully'
                  : s.value === 'woke'
                    ? '☀️ Awake this morning'
                    : s.value === 'restless'
                      ? '😕 Restless night stretch'
                      : '🌅 Up for the day'
                : s.value === 'loud'
                  ? '📢 A loud sound was heard'
                  : s.value === 'noise'
                    ? '🔉 Some noise nearby'
                    : '🔇 All quiet'}
            </span>
          </li>
        ))}
      </ul>
    </BentoCard>
  );
}

function AnalysisCard({ id, bundle }: { id: string; bundle: ReturnType<typeof useHouseholdState>['bundle'] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<'openrouter' | 'nvidia'>('openrouter');
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
      <CardTitle note={model ? `last: ${model}` : 'OpenRouter · NVIDIA'}>
        Behaviour analysis, read by an LLM
      </CardTitle>
      <p className="mt-2 text-xs leading-relaxed text-ink/45">
        Only privacy-safe aggregates leave the house: score trend, tier changes, hourly shape, recurring reasons.
        Never content — there is none.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select value={provider} onChange={(e) => setProvider(e.target.value as 'openrouter' | 'nvidia')} className="rounded-full border border-ink/15 bg-paper px-3 py-2 text-sm outline-none">
          <option value="openrouter">OpenRouter</option>
          <option value="nvidia">NVIDIA NIM</option>
        </select>
        <input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="API key (or set env on the server)"
          className="min-w-[180px] flex-1 rounded-full border border-ink/15 bg-paper px-4 py-2 text-sm outline-none focus:border-clay"
        />
        <button onClick={run} disabled={busy} className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-40">
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
            <button onClick={() => manage('remove', m.email)} disabled={busy} className="text-xs text-ink/40 transition-colors hover:text-[#b23a2f]">
              remove
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 space-y-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="w-full rounded-full border border-ink/15 bg-paper px-4 py-2 text-sm outline-none focus:border-clay" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (they sign in with Google)" className="w-full rounded-full border border-ink/15 bg-paper px-4 py-2 text-sm outline-none focus:border-clay" />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (for the alert call chain)" className="w-full rounded-full border border-ink/15 bg-paper px-4 py-2 text-sm outline-none focus:border-clay" />
        <div className="flex items-center justify-between gap-2">
          <select value={role} onChange={(e) => setRole(e.target.value as 'family' | 'neighbor')} className="rounded-full border border-ink/15 bg-paper px-3 py-2 text-sm outline-none">
            <option value="neighbor">Neighbour</option>
            <option value="family">Family</option>
          </select>
          <button onClick={() => manage('add')} disabled={busy || !email.includes('@')} className="rounded-full bg-ink px-4 py-2 text-sm text-paper transition-opacity hover:opacity-90 disabled:opacity-40">
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
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-40"
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

function WiFiPanel({ id, sourceId }: { id: string; sourceId: string }) {
  const [networks, setNetworks] = useState<{ ssid: string; rssi: number; secure: boolean }[] | null>(null);
  const [status, setStatus] = useState<{ connected?: boolean; ssid?: string; rssi?: number; ip?: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const r = await fetch(`/api/v1/household/${id}/sources/${sourceId}/wifi`).then((x) => x.json());
      setNetworks(r.networks ?? null);
      setStatus(r.status ?? null);
    } catch {
      /* panel stays with what it has */
    }
  };
  useEffect(() => {
    void refresh();
  }, [id, sourceId]);

  const queue = async (action: string, payload?: Record<string, unknown>) => {
    setBusy(action);
    setNote(null);
    try {
      await postJSON(`/api/v1/household/${id}/sources/${sourceId}/actions`, { action, ...payload });
      if (action === 'wifi_scan') {
        setNote('Scanning — the sensor reports back within ~10 s…');
        for (let i = 0; i < 8; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          const r = await fetch(`/api/v1/household/${id}/sources/${sourceId}/wifi`).then((x) => x.json());
          if (r.networks) {
            setNetworks(r.networks);
            setNote(null);
            break;
          }
        }
      } else if (action === 'wifi_connect' || action === 'wififorget') {
        setNote('Applying — checking in ~12 s…');
        for (let i = 0; i < 8; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          const r = await fetch(`/api/v1/household/${id}/sources/${sourceId}/wifi`).then((x) => x.json());
          if (r.status && (action === 'wififorget' || (r.status.ts ?? true))) {
            if (r.status) setStatus(r.status);
            break;
          }
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
        <button onClick={() => queue('wifi_scan')} disabled={busy !== null} className="rounded-full border border-ink/15 px-3 py-1 text-xs text-ink/70 transition-colors hover:bg-ink hover:text-paper disabled:opacity-40">
          {busy === 'wifi_scan' ? 'Scanning…' : 'Scan networks'}
        </button>
        {status?.connected && (
          <button onClick={() => queue('wififorget')} disabled={busy !== null} className="rounded-full border border-ink/15 px-3 py-1 text-xs text-ink/70 transition-colors hover:bg-[#b23a2f] hover:text-paper disabled:opacity-40">
            Forget Wi-Fi
          </button>
        )}
      </div>
      {note && <p className="mt-2 text-xs text-ink/50">{note}</p>}
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
                  className={`flex w-full items-center justify-between px-2 py-2 text-left text-sm transition-colors hover:bg-paper ${selected === n.ssid ? 'bg-paper' : ''}`}
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
            className="flex-1 rounded-full border border-ink/15 bg-white px-4 py-2 text-sm outline-none focus:border-clay"
          />
          <button
            onClick={() => queue('wifi_connect', { ssid: selected, password })}
            disabled={busy !== null || password.length < 8}
            className="rounded-full bg-ink px-4 py-2 text-sm text-paper transition-opacity hover:opacity-90 disabled:opacity-40"
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

  useEffect(() => {
    fetch('/api/v1/server-info').then((r) => r.json()).then((i) => setHost(i.lanBaseUrl ?? 'http://localhost:3100')).catch(() => {});
  }, []);

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
                    className="rounded-full border border-ink/15 px-2.5 py-0.5 text-xs text-ink/60 transition-colors hover:bg-ink hover:text-paper"
                  >
                    {testedSrc === s.id ? 'firing…' : 'fall test'}
                  </button>
                  <button
                    onClick={() => setWifiOpenFor(wifiOpenFor === s.id ? null : s.id)}
                    className="rounded-full border border-ink/15 px-2.5 py-0.5 text-xs text-ink/60 transition-colors hover:bg-ink hover:text-paper"
                  >
                    Wi-Fi
                  </button>
                </>
              )}
            </span>
          );
        })}
        <button
          onClick={addSensor}
          disabled={busy}
          className="rounded-full border border-dashed border-ink/25 px-4 py-2 text-sm text-ink/55 transition-colors hover:bg-paper disabled:opacity-40"
        >
          {busy ? 'Pairing…' : '+ Add room sensor (ESP32)'}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-[#b23a2f]">{error}</p>}
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
