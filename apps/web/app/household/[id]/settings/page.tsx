'use client';

/**
 * Settings: escalation timers, quiet hours, names, source management.
 * The demo time-warp lives in the demo console, not here — families never
 * see a clock they can bend.
 *
 * Same language as the dashboard: the Vision UI dark-glass system — navy
 * gradient page, glass cards with the white gradient hairline, Plus Jakarta
 * Sans throughout, terracotta primary.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { patchJSON, postJSON, useHouseholdState } from '@/lib/api';
import '../../motion.css';
import { BTN_PRIMARY, BTN_SECONDARY, FOCUS, INPUT } from '@/components/dashboard/kh';

interface NewSource {
  id: string;
  type: string;
  label: string;
  apiKey: string;
}

export default function SettingsPage() {
  const { id } = useParams<{ id: string }>();
  const { bundle } = useHouseholdState(id, 3000);
  const [saved, setSaved] = useState(false);
  const [newSource, setNewSource] = useState<NewSource | null>(null);
  const [busy, setBusy] = useState(false);

  const [parentName, setParentName] = useState('');
  const [childName, setChildName] = useState('');
  const [quietStart, setQuietStart] = useState(22);
  const [quietEnd, setQuietEnd] = useState(6);
  const [nudgeAfterMin, setNudge] = useState(10);
  const [checkInAfterMin, setCheckIn] = useState(10);
  const [alertAfterMin, setAlert] = useState(15);

  useEffect(() => {
    if (!bundle) return;
    const hh = bundle.household;
    setParentName(hh.parentName);
    setChildName(hh.childName);
    setQuietStart(hh.quietHours.start);
    setQuietEnd(hh.quietHours.end);
    setNudge(hh.escalationConfig.nudgeAfterMin);
    setCheckIn(hh.escalationConfig.checkInAfterMin);
    setAlert(hh.escalationConfig.alertAfterMin);
  }, [bundle?.household]);

  const save = async () => {
    setBusy(true);
    try {
      await patchJSON(`/api/v1/household/${id}/config`, {
        parentName,
        childName,
        quietStart,
        quietEnd,
        escalationConfig: { nudgeAfterMin, checkInAfterMin, alertAfterMin },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setBusy(false);
    }
  };

  const addSource = async (type: 'esp32' | 'phone') => {
    const r = await postJSON<NewSource>(`/api/v1/household/${id}/sources`, {
      type,
      label: type === 'esp32' ? 'Room sensor (ESP32)' : 'Simulated source',
    });
    setNewSource(r);
  };

  return (
    <main
      className="kh-dash relative min-h-screen px-4 py-10 sm:px-8"
      style={{ background: 'linear-gradient(169deg, #0F123B 7%, #090D2E 62%, #020515 100%)' }}
    >
      <div aria-hidden className="kh-blobs pointer-events-none fixed -inset-[12%]" />
      <div className="relative mx-auto max-w-2xl">
        <header className="flex items-center justify-between border-b border-vision-sep pb-4">
          <Link
            href={`/household/${id}`}
            className="text-sm font-medium text-vision-dim transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-vision-navy"
          >
            ← back to the dashboard
          </Link>
          <span className="flex items-center gap-2.5">
            <span className="text-[13px] font-medium text-vision-dim">
              Khayaal <span className="mx-0.5 text-white/25">/</span>{' '}
              <strong className="font-semibold text-white">Settings</strong>
            </span>
            <span
              aria-hidden
              className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-brand-600 text-[15px] text-white shadow-[0_6px_20px_-6px_rgba(220,104,3,0.55)]"
            >
              ✳︎
            </span>
          </span>
        </header>

        <h1 className="mt-8 text-3xl font-bold tracking-[-0.02em] text-white">Settings</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-vision-dim">
          How quickly the ladder climbs, and when the night stays silent. She is never asked to change anything.
        </p>

        {/* household */}
        <Section title="Household">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-[13px] font-medium text-white/85">Her name</span>
              <input value={parentName} onChange={(e) => setParentName(e.target.value)} className={`${INPUT} mt-1.5 w-full`} />
            </label>
            <label className="block">
              <span className="text-[13px] font-medium text-white/85">Your name</span>
              <input value={childName} onChange={(e) => setChildName(e.target.value)} className={`${INPUT} mt-1.5 w-full`} />
            </label>
          </div>
          <p className="mt-3 text-xs text-vision-dim">
            Pairing code for her phone: <span className="font-mono tracking-[0.14em] text-brand-400">{bundle?.household.pairingCode}</span>
          </p>
        </Section>

        {/* quiet hours */}
        <Section title="Quiet hours" hint="Escalation holds at a gentle nudge during these hours, unless the score is severe (85+)">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-[13px] font-medium text-white/85">Start</span>
              <select value={quietStart} onChange={(e) => setQuietStart(+e.target.value)} className={`${INPUT} mt-1.5 w-full`}>
                {Array.from({ length: 24 }, (_, i) => i).map((h) => <option key={h} value={h}>{h}:00</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[13px] font-medium text-white/85">End</span>
              <select value={quietEnd} onChange={(e) => setQuietEnd(+e.target.value)} className={`${INPUT} mt-1.5 w-full`}>
                {Array.from({ length: 24 }, (_, i) => i).map((h) => <option key={h} value={h}>{h}:00</option>)}
              </select>
            </label>
          </div>
        </Section>

        {/* escalation timers */}
        <Section title="Escalation ladder" hint="Minutes the score must stay raised before each step fires">
          <div className="grid gap-4 sm:grid-cols-3">
            <NumberField label="Nudge after" value={nudgeAfterMin} onChange={setNudge} suffix="min" />
            <NumberField label="Check-in after" value={checkInAfterMin} onChange={setCheckIn} suffix="min" />
            <NumberField label="Alert after" value={alertAfterMin} onChange={setAlert} suffix="min" />
          </div>
        </Section>

        <button onClick={save} disabled={busy} className={`${BTN_PRIMARY} w-full py-3 text-[15px]`}>
          {saved ? 'Saved ✓' : busy ? 'Saving…' : 'Save settings'}
        </button>

        {/* sources */}
        <Section title="Sources" hint="The devices that speak to Khayaal. Keys are shown once, at creation.">
          <ul className="space-y-2">
            {(bundle?.sources ?? []).map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm">
                <span className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${s.lastSeenTs ? 'kh-dot-live' : ''}`}
                    style={{ background: s.lastSeenTs ? '#01B574' : '#3A4060' }}
                    aria-hidden
                  />
                  <span className="font-medium text-white">{s.label}</span>
                  <span className="text-xs text-white/40">({s.type})</span>
                </span>
                <button
                  onClick={async () => {
                    await fetch(`/api/v1/household/${id}/sources?sourceId=${s.id}`, { method: 'DELETE' });
                  }}
                  className={`kh-press rounded-lg px-2 py-1 text-xs font-medium text-white/40 transition-colors hover:bg-[#E31A1A]/15 hover:text-err-400 ${FOCUS}`}
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => addSource('esp32')} className={BTN_SECONDARY}>
              + Register an ESP32 room sensor
            </button>
            <button onClick={() => addSource('phone')} className={BTN_SECONDARY}>
              + Add a simulator source
            </button>
          </div>
          {newSource && (
            <div className="mt-4 rounded-xl border border-brand-600/30 bg-brand-600/10 p-4">
              <p className="text-sm font-medium text-brand-200">“{newSource.label}” is paired.</p>
              <p className="mt-1 text-xs text-brand-200/80">Source key (shown once — put it in the firmware config):</p>
              <code className="mt-2 block break-all rounded-lg border border-white/10 bg-vision-field px-3 py-2 font-mono text-xs text-brand-300">{newSource.apiKey}</code>
            </div>
          )}
        </Section>

        <p className="mt-8 text-center text-xs leading-relaxed text-vision-dim">
          Khayaal stores signals for seven days, scores them, and discards them. There is no archive to subpoena, because there is no archive.
        </p>
      </div>
    </main>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="kh-glass kh-gradring relative mt-6 rounded-[20px] p-6">
      <h2 className="text-lg font-bold tracking-[-0.01em] text-white">{title}</h2>
      {hint && <p className="mt-1 text-xs leading-relaxed text-vision-dim">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function NumberField({ label, value, onChange, suffix }: { label: string; value: number; onChange: (n: number) => void; suffix: string }) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-white/85">{label}</span>
      <span className="float-right text-xs text-white/40">{suffix}</span>
      <input
        type="number"
        min={1}
        max={240}
        value={value}
        onChange={(e) => onChange(Math.max(1, Math.min(240, +e.target.value || 1)))}
        className={`${INPUT} mt-1.5 w-full`}
      />
    </label>
  );
}
