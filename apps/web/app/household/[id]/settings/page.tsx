'use client';

/**
 * Settings: escalation timers, quiet hours, names, source management.
 * The demo time-warp lives in the demo console, not here — families never
 * see a clock they can bend.
 *
 * Same language as the dashboard: white cards with 1px Neutral/200 borders
 * and shadow-xs on Neutral/50, Inter throughout, terracotta primary.
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
    <main className="kh-dash min-h-screen bg-n-50 px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-2xl">
        <header className="flex items-center justify-between border-b border-n-200 pb-4">
          <Link
            href={`/household/${id}`}
            className="text-sm font-medium text-n-500 transition-colors hover:text-n-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/60 focus-visible:ring-offset-2 focus-visible:ring-offset-n-50"
          >
            ← back to the dashboard
          </Link>
          <span className="flex items-center gap-2.5">
            <span className="text-[13px] font-medium text-n-500">
              Khayaal <span className="mx-0.5 text-n-300">/</span>{' '}
              <strong className="font-semibold text-n-900">Settings</strong>
            </span>
            <span
              aria-hidden
              className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-brand-600 text-[15px] text-white shadow-xs"
            >
              ✳︎
            </span>
          </span>
        </header>

        <h1 className="mt-8 text-3xl font-semibold tracking-[-0.02em] text-n-900">Settings</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-n-600">
          How quickly the ladder climbs, and when the night stays silent. She is never asked to change anything.
        </p>

        {/* household */}
        <Section title="Household">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-[13px] font-medium text-n-700">Her name</span>
              <input value={parentName} onChange={(e) => setParentName(e.target.value)} className={`${INPUT} mt-1.5 w-full`} />
            </label>
            <label className="block">
              <span className="text-[13px] font-medium text-n-700">Your name</span>
              <input value={childName} onChange={(e) => setChildName(e.target.value)} className={`${INPUT} mt-1.5 w-full`} />
            </label>
          </div>
          <p className="mt-3 text-xs text-n-500">
            Pairing code for her phone: <span className="font-mono tracking-[0.14em] text-brand-700">{bundle?.household.pairingCode}</span>
          </p>
        </Section>

        {/* quiet hours */}
        <Section title="Quiet hours" hint="Escalation holds at a gentle nudge during these hours, unless the score is severe (85+)">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-[13px] font-medium text-n-700">Start</span>
              <select value={quietStart} onChange={(e) => setQuietStart(+e.target.value)} className={`${INPUT} mt-1.5 w-full`}>
                {Array.from({ length: 24 }, (_, i) => i).map((h) => <option key={h} value={h}>{h}:00</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[13px] font-medium text-n-700">End</span>
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
              <li key={s.id} className="flex items-center justify-between rounded-lg border border-n-200 bg-white px-4 py-3 text-sm shadow-xs">
                <span className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${s.lastSeenTs ? 'kh-dot-live' : ''}`}
                    style={{ background: s.lastSeenTs ? '#039855' : '#D4D4D4' }}
                    aria-hidden
                  />
                  <span className="font-medium text-n-800">{s.label}</span>
                  <span className="text-xs text-n-400">({s.type})</span>
                </span>
                <button
                  onClick={async () => {
                    await fetch(`/api/v1/household/${id}/sources?sourceId=${s.id}`, { method: 'DELETE' });
                  }}
                  className={`kh-press rounded-lg px-2 py-1 text-xs font-medium text-n-400 transition-colors hover:bg-err-50 hover:text-err-700 ${FOCUS}`}
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
            <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50 p-4">
              <p className="text-sm font-medium text-brand-800">“{newSource.label}” is paired.</p>
              <p className="mt-1 text-xs text-brand-800/80">Source key (shown once — put it in the firmware config):</p>
              <code className="mt-2 block break-all rounded-lg border border-brand-100 bg-white px-3 py-2 font-mono text-xs text-brand-900">{newSource.apiKey}</code>
            </div>
          )}
        </Section>

        <p className="mt-8 text-center text-xs leading-relaxed text-n-400">
          Khayaal stores signals for seven days, scores them, and discards them. There is no archive to subpoena, because there is no archive.
        </p>
      </div>
    </main>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-xl border border-n-200 bg-white p-6 shadow-xs">
      <h2 className="text-[13.5px] font-semibold tracking-[-0.01em] text-n-900">{title}</h2>
      {hint && <p className="mt-1 text-xs leading-relaxed text-n-500">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function NumberField({ label, value, onChange, suffix }: { label: string; value: number; onChange: (n: number) => void; suffix: string }) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-n-700">{label}</span>
      <span className="float-right text-xs text-n-400">{suffix}</span>
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
