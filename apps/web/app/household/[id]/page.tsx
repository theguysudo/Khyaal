'use client';

/**
 * The child dashboard — the Quiet Ledger edition.
 *
 * A printed ledger, not a SaaS console: warm paper, three inks, hairline
 * rules, numbered editorial sections (01 — SIGNALS … 05 — SOURCES), one warm
 * accent. The serif verdict is the loudest element on the page and the
 * odometer wellbeing counter rolls directly beneath it. Data lives in
 * full-width ledger rows — caps label left, tabular-mono value right, status
 * always as a 6px dot and a word. Panels are raised paper on a 1px rule; they
 * never carry a shadow or any soft-effect surface.
 *
 * Dignity-first by construction: this screen never receives raw signals from
 * the API, only aggregates (per-hour counts), a status, plain-language
 * explanations and the family's own actions. Everything the family composes
 * here (messages, voice reminders, check-in requests) rides the commands
 * channel to her phone.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import '../motion.css';
import { BentoCard, CardTitle, SectionHead, Seg, smooth, useSize } from '@/components/dashboard/bento';
import { CounterCard, Odometer } from '@/components/dashboard/Odometer';
import {
  BADGE,
  BTN_DANGER,
  BTN_PRIMARY,
  BTN_SECONDARY,
  FOCUS,
  FOCUS_ON_RED,
  INPUT,
  TIER_UI,
} from '@/components/dashboard/kh';
import {
  IconBell,
  IconCheckin,
  IconLock,
  IconMessage,
  IconPhone,
  IconVoice,
} from '@/components/dashboard/icons';
import NightWatchCard from '@/components/dashboard/NightWatchCard';
import TalkbackCard from '@/components/dashboard/TalkbackCard';
import MovementCard from '@/components/dashboard/MovementCard';
import SmartwatchPanel from '@/components/dashboard/SmartwatchPanel';
import SosOverlay from '@/components/dashboard/SosOverlay';
import BlueprintMap from '@/components/dashboard/BlueprintMap';
import CsiScope from '@/components/dashboard/CsiScope';
import { fmtAgo, fmtClock, patchJSON, postJSON, TIER_META, useHouseholdState } from '@/lib/api';

/** The header's anchor nav — the numbered sections of the ledger. */
const NAV_LINKS = [
  { label: 'Signals', href: '#kh-signals', index: '01' },
  { label: 'Watchers', href: '#kh-watchers', index: '02' },
  { label: 'Talk', href: '#kh-talk', index: '03' },
  { label: 'Night', href: '#kh-night', index: '04' },
] as const;

/** The serif verdict, one line per tier — meaning matches TIER_META labels. */
function verdictFor(tier: number, parentName: string, learning: boolean): string {
  if (learning) return `Khayaal is learning ${parentName}’s rhythm.`;
  switch (tier) {
    case 1:
      return `${parentName} got a gentle nudge.`;
    case 2:
      return `${parentName} was asked to check in.`;
    case 3:
      return `${parentName} needs attention.`;
    case 4:
      return 'The alarm is ringing.';
    default:
      return `${parentName} is doing fine.`;
  }
}

/**
 * The mobile tab bar — the iOS 26 floating tab bar flattened to editorial:
 * a fixed paper bar with a hairline top rule, mono indices 01–04, active =
 * 2px signal underline. No blur. The section nearest the top of the viewport
 * is the active one.
 */
function LedgerTabBar() {
  const [active, setActive] = useState<string>('kh-signals');

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id);
        }
      },
      { rootMargin: '-20% 0px -60% 0px' },
    );
    NAV_LINKS.forEach(({ href }) => {
      const el = document.getElementById(href.slice(1));
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  return (
    <nav className="ledger-tabbar lg:hidden" aria-label="Sections">
      {NAV_LINKS.map((l) => (
        <a key={l.href} href={l.href} className={active === l.href.slice(1) ? 'active' : ''} aria-current={active === l.href.slice(1) ? 'true' : undefined}>
          <span>{l.index}</span>
          <span className="t-word">{l.label}</span>
        </a>
      ))}
    </nav>
  );
}

export default function DashboardPage() {
  const { id } = useParams<{ id: string }>();
  const { bundle, error } = useHouseholdState(id);
  const [acking, setAcking] = useState(false);

  if (error) {
    return (
      <main className="kh-dash flex min-h-screen items-center justify-center px-6">
        <div className="ledger-panel max-w-sm p-8 text-center">
          <p className="t-section text-[#1A1815]">We couldn't reach this household</p>
          <p className="mt-2 text-sm text-[#57534E]">{error}</p>
          <Link href="/login" className={`${BTN_PRIMARY} mt-5`}>
            Your families
          </Link>
        </div>
      </main>
    );
  }
  if (!bundle) {
    return (
      <main className="kh-dash flex min-h-screen items-center justify-center">
        <p className="text-sm text-[#8A857D]">Listening for signals…</p>
      </main>
    );
  }

  const { state, household: hh } = bundle;
  const meta = TIER_META[state.tier];
  const ui = TIER_UI[state.tier];
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
    <main className="kh-dash relative min-h-screen pb-24 lg:pb-16">
      <div className="mx-auto max-w-[1120px] px-4 pt-5 sm:px-8">
        {/*
          The header — ledger anatomy: the ✳︎ logomark square, the Khayaal /
          Overview breadcrumb in ink, the live tier as dot + word, and the
          numbered-section anchors. Hairline rule beneath, no shadow.
        */}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E7E2DA] pb-4">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-[#B4451C] text-[15px] text-[#FFF7F0]"
            >
              ✳︎
            </span>
            <span className="text-[13px] font-medium text-[#57534E]">
              Khayaal <span className="mx-0.5 text-[#D6CFC4]">/</span>{' '}
              <strong className="font-semibold text-[#1A1815]">Overview</strong>
            </span>
            <span className={`kh-tier-ease ml-1 hidden sm:inline-flex ${BADGE}`}>
              <span className={`dot ${ui.dot}`} aria-hidden />
              <span className={ui.pill}>{meta.label}</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <nav aria-label="Sections" className="mr-2 hidden items-center gap-5 lg:flex">
              {NAV_LINKS.map((l) => (
                <a key={l.href} href={l.href} className="text-[13px] font-medium tracking-[0.08em] text-[#57534E] uppercase transition-colors hover:text-[#1A1815]">
                  <span className="mr-1.5 font-mono text-[#8A857D]">{l.index}</span>
                  {l.label}
                </a>
              ))}
            </nav>
            {hh.simTimeOffsetMs !== 0 && (
              <span className={`${BADGE} text-[#8A857D]`}>
                <span className="font-mono">demo clock · {fmtClock(bundle.simNowTs)}</span>
              </span>
            )}
            <a href="#kh-talk" className={`${BTN_PRIMARY} px-3.5`}>
              Reach her
            </a>
            <Link href={`/household/${id}/settings`} className={`${BTN_SECONDARY} px-3.5`}>
              Settings
            </Link>
          </div>
        </header>

        {/*
          The verdict — one serif sentence under the household header, the
          single loudest element on the page, with the odometer wellbeing
          counter beneath it (the signature interaction, unchanged).
        */}
        <div className="mt-8">
          <p className="t-display max-w-3xl text-[34px] sm:text-[48px]">{verdictFor(state.tier, hh.parentName, state.learning)}</p>
          <div className="mt-4 flex items-end gap-3">
            {state.score === null ? (
              <span className="kh-odo-digits text-[44px] font-semibold leading-none tracking-[-0.02em] text-[#D6CFC4]">···</span>
            ) : (
              <Odometer value={state.score} className="text-[44px]" />
            )}
            <span className="pb-1 font-mono text-[13px] text-[#8A857D]">/ 100 wellbeing</span>
          </div>
        </div>

        {/*
          tier-3 alert — the only thing allowed to shout, on the alarm hue.
          The section stays mounted and collapses through a grid row so the
          ledger below glides aside instead of teleporting when a poll flips
          the tier; when collapsed it is inert, so the hidden buttons can
          neither be tabbed into nor clicked.
        */}
        <div
          className="grid transition-[grid-template-rows] duration-[360ms] ease-[cubic-bezier(.32,.72,0,1)] motion-reduce:transition-none"
          style={{ gridTemplateRows: isAlert ? '1fr' : '0fr' }}
          aria-hidden={!isAlert}
        >
          <div className="min-h-0 overflow-hidden">
            <section
              inert={!isAlert}
              className={`ledger-panel mt-6 border-l-4 border-l-[#B3261E] p-5 transition-opacity duration-[360ms] sm:p-6 ${isAlert ? 'opacity-100' : 'opacity-0'} motion-reduce:transition-none`}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-xl">
                  <p className="flex items-center gap-2 text-[13px] font-medium uppercase tracking-[0.08em] text-[#B3261E]">
                    <span className="dot bg-[#B3261E]" aria-hidden />
                    Needs attention
                  </p>
                  <p className="mt-2 text-lg font-semibold leading-snug text-[#1A1815]">
                    {hh.parentName} hasn't responded to the nudge or the check-in.
                  </p>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-[#57534E]">
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
                    className={BTN_DANGER}
                  >
                    <IconPhone className="h-4 w-4" />
                    Call {hh.parentName}
                  </a>
                  <button
                    onClick={ack}
                    disabled={acking}
                    className={`${BTN_SECONDARY} kh-press ${FOCUS_ON_RED}`}
                  >
                    {state.ack ? 'Acknowledged' : acking ? 'Noting…' : "I've checked in"}
                  </button>
                  <button
                    onClick={() => postJSON(`/api/v1/household/${id}/snooze`, { minutes: 60 })}
                    className={BTN_SECONDARY}
                  >
                    Snooze 1 h
                  </button>
                </div>
              </div>
              {circle.length > 0 && (
                <p className="mt-3 border-t border-[#E7E2DA] pt-3 text-[13px] text-[#57534E]">
                  Care circle notified: {circle.map((m) => `${m.name} (${m.role})`).join(' · ')}
                </p>
              )}
            </section>
          </div>
        </div>

        {/* ------------------------------------------------ 01 — SIGNALS */}
        <div className="kh-enter mt-12">
          <SectionHead index="01" label="Signals" note="aggregates only — never a feed" id="kh-signals" />
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-5">
              <StatusCard bundle={bundle} />
            </div>
            <div className="min-w-0 lg:col-span-7">
              <TrendCard bundle={bundle} />
            </div>
            <div className="min-w-0 lg:col-span-5">
              <RhythmCard bundle={bundle} />
            </div>
            <div className="min-w-0 lg:col-span-7">
              <ExplainCard bundle={bundle} />
            </div>
            <div className="min-w-0 lg:col-span-5">
              <LadderCard tier={state.tier} />
            </div>
            <div className="min-w-0 lg:col-span-7">
              <AnalysisCard id={id} bundle={bundle} />
            </div>
          </div>
        </div>

        {/* ------------------------------------------------ 02 — THE WATCHERS */}
        <div className="kh-enter mt-12">
          <SectionHead index="02" label="The watchers" note="rooms and wrists, never cameras" id="kh-watchers" />
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-7">
              <BlueprintMap id={id} />
            </div>
            <div className="min-w-0 lg:col-span-5">
              <CsiScope id={id} />
            </div>
            <div className="min-w-0 lg:col-span-5">
              <MovementCard movement={bundle.movement} nowTs={bundle.simNowTs} />
            </div>
            <div className="min-w-0 lg:col-span-7">
              <SmartwatchPanel householdId={id} />
            </div>
          </div>
        </div>

        {/* ------------------------------------------------ 03 — TALK */}
        <div className="kh-enter mt-12">
          <SectionHead index="03" label="Talk" note="everything here rides the commands channel" id="kh-talk" />
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div id="kh-reach-her" className="min-w-0 scroll-mt-6 lg:col-span-7">
              <CommandsCard id={id} bundle={bundle} />
            </div>
            <div className="min-w-0 lg:col-span-5">
              <TalkbackCard id={id} parentName={hh.parentName} childName={hh.childName} />
            </div>
            <div id="kh-care-circle" className="min-w-0 scroll-mt-6 lg:col-span-7">
              <CircleCard id={id} bundle={bundle} />
            </div>
            <div className="min-w-0 lg:col-span-5">
              <PushCard id={id} />
            </div>
          </div>
        </div>

        {/* ------------------------------------------------ 04 — NIGHT WATCH */}
        <div className="kh-enter mt-12">
          <SectionHead index="04" label="Night watch" note="on-device, nothing recorded" id="kh-night" />
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div id="kh-rhythm" className="min-w-0 scroll-mt-6 lg:col-span-7">
              <NightWatchCard events={bundle.sleepSound} />
            </div>
            <div className="min-w-0 lg:col-span-5">
              <EventsCard bundle={bundle} />
            </div>
          </div>
        </div>

        {/* ------------------------------------------------ 05 — SOURCES */}
        <div className="kh-enter mt-12">
          <SectionHead index="05" label="Sources" note="never a feed, never a map" id="kh-sources" />
          <div className="mt-6 grid grid-cols-1 gap-6">
            <SourcesCard id={id} bundle={bundle} />
          </div>
        </div>

        <p className="mt-10 border-t border-[#E7E2DA] pt-4 text-center text-[13px] leading-relaxed text-[#8A857D]">
          Khayaal never shows a feed, a map or a recording — this page only ever sees what you see. Signals are
          AES-256-GCM encrypted at rest and discarded after 7 days.
        </p>
      </div>
      <LedgerTabBar />
      <SosOverlay
        householdId={id}
        parentName={hh.parentName}
        childName={hh.childName}
        sos={state.sos}
      />
    </main>
  );
}

// ---------------------------------------------------------------------------

function StatusCard({ bundle }: { bundle: ReturnType<typeof useHouseholdState>['bundle'] }) {
  if (!bundle) return null;
  const { state, household: hh } = bundle;
  const meta = TIER_META[state.tier];
  const ui = TIER_UI[state.tier];
  return (
    <CounterCard
      score={state.score}
      learning={state.learning}
      confidence={state.learning ? undefined : `confidence ${Math.round(state.confidence * 100)}%`}
      tierLabel={meta.label}
      tierPill={ui.pill}
      tierDot={ui.dot}
      status={state.learning ? `Learning ${hh.parentName}'s rhythm…` : state.status}
      lastLine={
        <>
          Last activity {fmtAgo(state.lastActiveTs, bundle.simNowTs)}
          {state.lastActiveTs ? ` — around ${fmtClock(state.lastActiveTs)}` : ''}.
          {state.snoozeUntilTs && state.snoozeUntilTs > bundle.simNowTs && <> Quiet until {fmtClock(state.snoozeUntilTs)}.</>}
        </>
      }
    />
  );
}

function TrendCard({ bundle }: { bundle: ReturnType<typeof useHouseholdState>['bundle'] }) {
  if (!bundle) return null;
  return (
    <BentoCard label="24 hour score trend">
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
  const TYPES = [
    { t: 'message', label: 'Message', icon: IconMessage },
    { t: 'reminder', label: 'Reminder', icon: IconBell },
    { t: 'tts', label: 'Voice (spoken aloud)', icon: IconVoice },
    { t: 'request_checkin', label: 'Ask for check-in', icon: IconCheckin },
  ] as const;

  return (
    <BentoCard label="Reach her phone">
      <CardTitle note={pending.length > 0 ? `${pending.length} awaiting her phone` : 'delivered over the commands channel'}>
        Reach her phone
      </CardTitle>
      <div className="mt-4 flex flex-wrap gap-2">
        {TYPES.map(({ t, label, icon: Icon }) => (
          <button
            key={t}
            onClick={() => setType(t)}
            aria-pressed={type === t}
            className={`kh-press inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
              type === t
                ? 'bg-[#1A1815] text-[#FAF8F5]'
                : 'border border-[#D6CFC4] bg-transparent text-[#57534E] hover:border-[#1A1815] hover:text-[#1A1815]'
            } ${FOCUS}`}
          >
            <Icon className="h-3.5 w-3.5" />
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
          className={`${INPUT} flex-1`}
        />
        <Seg
          ariaLabel="Language"
          value={lang}
          onChange={setLang}
          options={[
            { value: 'en', label: 'EN' },
            { value: 'hi', label: 'हिं' },
          ]}
        />
        <button onClick={send} disabled={busy || !text.trim()} className={BTN_PRIMARY}>
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
      {sent && <p className="mt-2 text-[13px] font-medium text-[#2F6B4F]">Sent — her phone picks it up in a moment.</p>}
      {pending.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {pending.slice(-3).map((c) => (
            <li key={c.id} className="ledger-row !py-2 text-[13px]">
              <span className="text-[#8A857D]">{c.type}</span>
              <span className="truncate font-normal">“{c.text}”</span>
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
    <BentoCard label="Rhythm map">
      <CardTitle note="today, hour by hour">Rhythm map</CardTitle>
      <div className="mt-4 flex h-20 items-end gap-[3px]">
        {activity.map((v, h) => (
          <div key={h} className="group relative flex-1">
            <div
              className="w-full transition-[height] duration-[360ms] ease-[cubic-bezier(.32,.72,0,1)] motion-reduce:transition-none"
              style={{
                height: `${Math.max(4, (v / max) * 76)}px`,
                // The ledger's ink ramp: the current hour is full ink, the
                // ordinary hours ink at rest, the empty hours a bare rule.
                background: h === nowHour ? '#1A1815' : v === 0 ? '#E7E2DA' : '#57534E',
              }}
            />
            <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded border border-[#E7E2DA] bg-white px-1.5 py-0.5 font-mono text-[10px] text-[#1A1815] group-hover:block">
              {h}:00 · {v}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-[#57534E]">
        Signal counts per hour — her ordinary day, drawn from harmless aggregates. No content, no location.
      </p>
    </BentoCard>
  );
}

function LadderCard({ tier }: { tier: number }) {
  return (
    <BentoCard label="Escalation ladder">
      <CardTitle note="most days, step 3 never comes">Where things stand</CardTitle>

      {/* the ladder — four hairline segments, flat tier colours */}
      <div className="mt-4 flex gap-1.5" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="kh-tier-ease h-1.5 flex-1 rounded-full"
            style={{
              background:
                tier >= 1 && i > 0 && i <= Math.min(tier, 3)
                  ? i === 3
                    ? '#B3261E'
                    : '#9A6A1B'
                  : i === 0 && tier === 0
                    ? '#2F6B4F'
                    : '#E7E2DA',
            }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[11px] text-[#8A857D]">
        <span>Quiet</span>
        <span>Nudge</span>
        <span>Check-in</span>
        <span>Alert</span>
      </div>

      <div className="mt-4">
        {[
          ['Quiet observation', 'signals only — nobody is contacted', 0],
          ['Gentle nudge', 'on her phone; nothing has left the house', 1],
          ['Check-in asked', 'one clear question, one tap to answer', 2],
          ['Family alerted', 'with last-known signals attached', 3],
        ].map(([label, desc, t], i) => {
          const active = tier >= (t as number);
          return (
            <div key={label as string} className="ledger-row">
              <span className="flex min-w-0 items-baseline gap-3">
                <span
                  className="kh-tier-ease flex h-7 w-7 flex-none items-center justify-center rounded-md border font-mono text-[11px]"
                  style={{
                    borderColor: active ? (i === 3 ? '#B3261E' : i === 0 ? '#2F6B4F' : '#9A6A1B') : '#D6CFC4',
                    background: active ? (i === 3 ? '#B3261E' : i === 0 ? '#2F6B4F' : '#9A6A1B') : 'transparent',
                    color: active ? '#FFF7F0' : '#8A857D',
                  }}
                >
                  {i}
                </span>
                <span className="min-w-0">
                  <span className={`block text-[15px] font-medium ${active ? 'text-[#1A1815]' : 'text-[#D6CFC4]'}`}>{label as string}</span>
                  <span className="block truncate text-[13px] text-[#8A857D]">{desc as string}</span>
                </span>
              </span>
              <span className="ledger-row-value flex items-center gap-2">
                <span className="dot" style={{ background: active ? (i === 3 ? '#B3261E' : i === 0 ? '#2F6B4F' : '#9A6A1B') : '#E7E2DA' }} aria-hidden />
                <span className="text-[13px] text-[#57534E]">{active ? 'reached' : 'waiting'}</span>
              </span>
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
  const ui = TIER_UI[state.tier];
  return (
    <BentoCard label="Why this score">
      <CardTitle note="plain language, always">Why this score</CardTitle>
      <div className="mt-4">
        {state.learning && <p className="text-[15px] text-[#57534E]">Khayaal is still learning — nothing is being scored yet.</p>}
        {!state.learning && state.contributions.length === 0 && (
          <p className="text-[15px] text-[#57534E]">Everything we look for is present and ordinary. Nothing to explain.</p>
        )}
        {state.contributions.map((c, i) => (
          <div key={i} className="ledger-row">
            <span className="h-1.5 w-24 flex-none self-center overflow-hidden rounded-full bg-[#E7E2DA]">
              <span
                className="block h-full rounded-full transition-[width] duration-[360ms] ease-[cubic-bezier(.32,.72,0,1)] motion-reduce:transition-none"
                style={{ width: `${Math.min(100, (c.effect / 30) * 100)}%`, background: ui.color }}
              />
            </span>
            <span className="min-w-0 text-right text-[15px] leading-relaxed text-[#1A1815]">{c.reason}</span>
          </div>
        ))}
        {!state.learning && (
          <p className="pt-3 text-[13px] leading-relaxed text-[#8A857D]">
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
    <BentoCard label="AI behaviour analysis">
      <CardTitle note={model ? `last: ${model}` : 'MiniMax · NVIDIA · OpenRouter'}>
        Behaviour analysis, read by a model
      </CardTitle>
      <p className="mt-3 text-[13px] leading-relaxed text-[#57534E]">
        Only privacy-safe aggregates leave the house: score trend, tier changes, hourly shape, recurring reasons.
        Never content — there is none.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as 'minimax' | 'nvidia' | 'openrouter')}
          className={`${INPUT} w-auto pr-8`}
        >
          <option value="minimax">MiniMax</option>
          <option value="nvidia">NVIDIA NIM</option>
          <option value="openrouter">OpenRouter</option>
        </select>
        <input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="API key (or set env on the server)"
          className={`${INPUT} min-w-[180px] flex-1`}
        />
        <button onClick={run} disabled={busy} className={BTN_PRIMARY}>
          {busy ? 'Reading the week…' : 'Run analysis'}
        </button>
      </div>
      {error && <p className="mt-2 text-[15px] text-[#B3261E]">{error}</p>}
      {text && (
        <div className="mt-4 whitespace-pre-wrap rounded-lg border border-[#E7E2DA] bg-[#FAF8F5] p-4 text-[13.5px] leading-relaxed text-[#1A1815]">
          {text}
        </div>
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
    <BentoCard label="Care circle">
      <CardTitle note="neighbours who can check in">Care circle</CardTitle>
      <ul className="mt-4">
        {circle.length === 0 && (
          <li className="rounded-lg border border-dashed border-[#D6CFC4] p-3 text-[13px] leading-relaxed text-[#57534E]">
            Add family and trusted neighbours — when a real alert fires, they're notified too and can visit.
          </li>
        )}
        {circle.map((m) => (
          <li key={m.email} className="ledger-row">
            <span className="min-w-0 text-[15px] text-[#1A1815]">
              {m.name} <span className="text-[13px] text-[#8A857D]">({m.role})</span>
              <span className="block text-[13px] text-[#8A857D]">
                {m.email}
                {m.phone ? ` · ${m.phone}` : ''}
              </span>
            </span>
            <button
              onClick={() => manage('remove', m.email)}
              disabled={busy}
              className={`kh-press rounded px-2 py-1 text-[13px] font-medium text-[#8A857D] transition-colors hover:bg-[#F7E0D3] hover:text-[#B3261E] disabled:opacity-40 ${FOCUS}`}
            >
              remove
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 space-y-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className={INPUT} />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (they sign in with Google)" className={INPUT} />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (for the alert call chain)" className={INPUT} />
        <div className="flex items-center justify-between gap-2">
          <select value={role} onChange={(e) => setRole(e.target.value as 'family' | 'neighbor')} className={`${INPUT} w-auto pr-8`}>
            <option value="neighbor">Neighbour</option>
            <option value="family">Family</option>
          </select>
          <button onClick={() => manage('add')} disabled={busy || !email.includes('@')} className={BTN_PRIMARY}>
            Add to circle
          </button>
        </div>
        {error && <p className="text-[13px] text-[#B3261E]">{error}</p>}
        <p className="text-[13px] leading-relaxed text-[#8A857D]">
          Circle members sign in at /login and claim this household with its pairing code. On a real alert they are
          notified alongside the family — a neighbour can be the fastest help there is. Phone numbers feed the call
          chain: your phone's own dialer places the calls, so there's no SMS gateway to set up.
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
    <BentoCard label="Alerts on this device">
      <CardTitle note="free browser push, no SMS gateway">Alerts on this device</CardTitle>
      <p className="mt-3 text-[15px] leading-relaxed text-[#57534E]">
        When an urgent alert fires, this laptop or tablet gets the nudge too — the notification arrives even with
        Khayaal closed.
      </p>
      <div className="mt-4 flex items-center gap-3">
        {status === 'unsupported' ? (
          <span className="text-[15px] text-[#8A857D]">This browser can't receive push notifications.</span>
        ) : (
          <button onClick={subscribe} disabled={busy || status === 'on'} className={BTN_PRIMARY}>
            {status === 'on' ? 'Alerts are on' : busy ? 'Enabling…' : 'Enable urgent alerts here'}
          </button>
        )}
      </div>
      {note && <p className="mt-3 text-[13px] leading-relaxed text-[#57534E]">{note}</p>}
    </BentoCard>
  );
}

function EventsCard({ bundle }: { bundle: ReturnType<typeof useHouseholdState>['bundle'] }) {
  if (!bundle) return null;
  return (
    <BentoCard label="Recent events">
      <CardTitle note="audit trail">Quiet log</CardTitle>
      <ul className="mt-4">
        {bundle.events.slice(-6).reverse().map((e) => (
          <li key={e.id} className="ledger-row">
            <span className="w-16 flex-none font-mono text-[13px] tabular-nums text-[#8A857D]">{fmtClock(e.ts)}</span>
            <span className="text-right text-[15px] text-[#1A1815]">{e.meta ?? (e.type === 'tier_change' ? `tier ${e.from} → ${e.to}` : e.type)}</span>
          </li>
        ))}
        {bundle.events.length === 0 && <li className="py-2 text-[15px] text-[#8A857D]">A quiet day. Nothing to report.</li>}
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
    <div className="mt-4 rounded-lg border border-[#E7E2DA] bg-[#FAF8F5] p-4">
      <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-[#57534E]">Wi-Fi, laptop-style — runs over the sensor's USB link</p>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[15px]">
        <span className={status?.connected ? 'text-[#1A1815]' : 'text-[#B3261E]'}>
          {status?.connected
            ? `Connected to ${status.ssid} · ${bars(status.rssi ?? -80)} ${status.rssi ?? ''} dBm${status.ip ? ` · ${status.ip}` : ''}`
            : 'Not connected to any network'}
        </span>
        <button
          onClick={() => queue('wifi_scan')}
          disabled={busy !== null}
          className={`${BTN_SECONDARY} h-8 px-3 text-[13px]`}
        >
          {busy === 'wifi_scan' ? 'Scanning…' : 'Scan networks'}
        </button>
        {status?.connected && (
          <button
            onClick={() => queue('wififorget')}
            disabled={busy !== null}
            className={`kh-press h-8 rounded-lg border border-[#D6CFC4] px-3 text-[13px] font-medium text-[#1A1815] transition-colors hover:border-[#B3261E] hover:text-[#B3261E] disabled:opacity-40 ${FOCUS}`}
          >
            Forget Wi-Fi
          </button>
        )}
      </div>
      {note && <p className="mt-2 text-[13px] text-[#57534E]">{note}</p>}
      <p className="mt-1.5 font-mono text-[13px] text-[#8A857D]">
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
        <p className="mt-2 rounded-lg border border-[#B3261E] px-3 py-2 text-[13px] leading-relaxed text-[#B3261E]">
          {relayError}
        </p>
      )}
      {scanError && (
        <p className="mt-2 rounded-lg border border-[#B3261E] px-3 py-2 text-[13px] leading-relaxed text-[#B3261E]">
          The scan came back empty — {scanError}.
        </p>
      )}
      {networks && networks.length === 0 && !scanError && !relayError && (
        <p className="mt-2 text-[13px] text-[#57534E]">No networks found nearby.</p>
      )}
      {networks && networks.length > 0 && (
        <ul className="mt-3 divide-y divide-[#E7E2DA]">
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
                  className={`kh-press flex w-full items-center justify-between px-2 py-2 text-left text-[15px] transition-colors hover:bg-[#F7F4EF] ${selected === n.ssid ? 'bg-[#F7E0D3]' : ''} ${FOCUS}`}
                >
                  <span className="inline-flex items-center gap-1.5 text-[#1A1815]">
                    {n.secure && <IconLock className="h-3.5 w-3.5 text-[#8A857D]" />}
                    {n.ssid}
                  </span>
                  <span className="font-mono text-[13px] text-[#57534E]">{bars(n.rssi)}</span>
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
            className={`${INPUT} flex-1`}
          />
          <button
            onClick={() => queue('wifi_connect', { ssid: selected, password })}
            disabled={busy !== null || password.length < 8}
            className={BTN_PRIMARY}
          >
            {busy === 'wifi_connect' ? 'Joining…' : 'Connect'}
          </button>
        </div>
      )}
      <p className="mt-3 text-[13px] leading-relaxed text-[#8A857D]">
        Needs the sensor's USB cable plugged into this Mac with the relay running:
        <code className="mx-1 font-mono text-[#57534E]">python3 firmware/tunnel/khayaal_serial_bridge.py</code>
        — the dashboard queues the action, the relay types it to the sensor over USB and posts the scan
        results back. Your password only travels from this page through the server to the USB relay — it is never
        stored anywhere.
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
      // happens after every server restart (sources live in memory). The
      // server starts the relay and hands it the identity itself, so this
      // is a retry, not a manual repair job.
      setError(
        pairingCode
          ? `The USB relay is not checking in yet. Press Connect again — this laptop starts the relay and hands it the identity automatically. If it still does not come up, run:`
          : 'The USB relay is not checking in yet. Press Connect again — this laptop starts the relay and hands it the identity automatically.',
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
    <BentoCard label="Sources">
      <CardTitle note="keys are shown once">The watchers</CardTitle>
      {pairingCode && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-[#E7E2DA] bg-[#FAF8F5] px-4 py-3 text-[15px]">
          <span className="text-[#57534E]">
            Pairing code for a new phone or sensor:
            <span className="ml-2 font-mono text-lg tracking-[0.2em] text-[#B4451C]">{pairingCode}</span>
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
            className={`${BTN_SECONDARY} ml-auto h-8 px-3 text-[13px]`}
          >
            regenerate
          </button>
        </div>
      )}
      <div className="mt-4">
        {bundle.sources.map((s) => {
          const fresh = s.lastSeenTs && bundle.simNowTs - s.lastSeenTs < 30 * 60_000;
          const isEsp = s.type === 'esp32';
          return (
            <div key={s.id} className="ledger-row">
              <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="inline-flex items-center gap-2 text-[15px] text-[#1A1815]">
                  <span className="dot" style={{ background: fresh ? '#2F6B4F' : '#D6CFC4' }} aria-hidden />
                  {s.label}
                </span>
                <span className="font-mono text-[13px] text-[#8A857D]">
                  {fresh ? 'checking in' : 'quiet'} · {s.lastSeenTs ? fmtAgo(s.lastSeenTs, bundle.simNowTs) : 'not seen yet'}
                </span>
                {isEsp && (
                  <>
                    <button
                      onClick={() => fallTest(s.id)}
                      className={`${BTN_SECONDARY} h-7 px-2.5 text-[13px]`}
                    >
                      {testedSrc === s.id ? 'firing…' : 'fall test'}
                    </button>
                    <button
                      onClick={() => setWifiOpenFor(wifiOpenFor === s.id ? null : s.id)}
                      aria-pressed={wifiOpenFor === s.id}
                      className={`${BTN_SECONDARY} h-7 px-2.5 text-[13px]`}
                    >
                      Wi-Fi
                    </button>
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <button onClick={connectSensor} disabled={connectState === 'waiting'} className={BTN_PRIMARY}>
          {connectState === 'waiting' ? 'Connecting…' : 'Connect room sensor (plug in via USB)'}
        </button>
        <button
          onClick={addSensor}
          disabled={busy}
          className={`${BTN_SECONDARY}`}
        >
          {busy ? 'Pairing…' : '+ Add manually'}
        </button>
      </div>
      {connectState === 'waiting' && (
        <p className="mt-3 text-[15px] text-[#57534E]">
          Paired — the USB relay is typing the identity into the board now. Keep the ESP32 plugged into this laptop;
          it finishes on its own.
        </p>
      )}
      {connectState === 'connected' && (
        <p className="mt-3 text-[15px] text-[#2F6B4F]">
          Room sensor connected — it is streaming live. Wave a hand in front of it and watch the blueprint.
        </p>
      )}
      {error && <p className="mt-3 text-[15px] leading-relaxed text-[#B3261E]">{error}</p>}
      {error && pairingCode && error.startsWith('The USB relay is not checking in') && (
        <pre className="mt-2 overflow-x-auto rounded-lg border border-[#E7E2DA] bg-[#FAF8F5] px-4 py-3 font-mono text-[12.5px] text-[#1A1815]">{`python3 firmware/tunnel/khayaal_serial_bridge.py`}</pre>
      )}
      {wifiOpenFor && <WiFiPanel id={id} sourceId={wifiOpenFor} />}
      {serialBlock && (
        <div className="mt-4 rounded-lg border border-[#E7E2DA] bg-[#FAF8F5] p-4">
          <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-[#57534E]">Paste into the sensor's serial monitor (115200) — the key is shown once</p>
          <pre className="mt-2 overflow-x-auto whitespace-pre rounded-lg border border-[#E7E2DA] bg-white px-3 py-2.5 font-mono text-[12.5px] leading-relaxed text-[#1A1815]">{serialBlock}</pre>
          <p className="mt-2 text-[13px] leading-relaxed text-[#8A857D]">
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
      <div ref={ref} className="mt-3 flex min-h-[150px] items-center justify-center rounded-lg border border-dashed border-[#D6CFC4] text-[15px] text-[#57534E]">
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
          {/* tier bands — the status hues at a whisper, flat fills */}
          <rect x="0" y={Y(100)} width={W} height={Y(72) - Y(100)} fill="#B3261E" opacity="0.05" />
          <rect x="0" y={Y(72)} width={W} height={Y(55) - Y(72)} fill="#9A6A1B" opacity="0.05" />
          <rect x="0" y={Y(55)} width={W} height={Y(35) - Y(55)} fill="#9A6A1B" opacity="0.04" />
          <rect x="0" y={Y(35)} width={W} height={Y(0) - Y(35)} fill="#2F6B4F" opacity="0.04" />
          {[0, 35, 55, 72].map((b) => (
            <line key={b} x1="0" x2={W} y1={Y(b)} y2={Y(b)} stroke="#E7E2DA" strokeWidth="1" strokeDasharray="3 4" />
          ))}
          <path d={`${d}L${last[0]},${CH}L${P[0][0]},${CH}Z`} fill="#B4451C" opacity="0.06" />
          <path
            d={d}
            pathLength={1}
            fill="none"
            stroke="#B4451C"
            strokeWidth="2"
            strokeLinecap="round"
            style={{ strokeDasharray: 1, strokeDashoffset: drawn || reduce ? 0 : 1, transition: reduce ? 'none' : 'stroke-dashoffset 1.4s cubic-bezier(.32,.72,0,1) .2s' }}
          />
          <circle cx={last[0]} cy={last[1]} r="4" fill="#B4451C" stroke="#FFFFFF" strokeWidth="1.5" />
          <text x={W - 4} y={Y(72) - 5} textAnchor="end" fontSize="10" fill="#8A857D">
            72 · escalate
          </text>
        </svg>
      )}
    </div>
  );
}

void patchJSON;
