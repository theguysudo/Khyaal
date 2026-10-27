'use client';

/**
 * Settings: escalation timers, quiet hours, names, source management.
 * The demo time-warp lives in the demo console, not here — families never
 * see a clock they can bend.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { patchJSON, postJSON, useHouseholdState } from '@/lib/api';

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
    <main className="min-h-screen bg-paper px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-2xl">
        <header className="flex items-center justify-between">
          <Link href={`/household/${id}`} className="text-sm text-ink/60 transition-opacity hover:opacity-70">
            ← back to the dashboard
          </Link>
          <span className="flex items-center gap-2">
            <span className="font-heading text-lg tracking-tight text-ink">Khayaal</span>
            <span className="text-clay">✳︎</span>
          </span>
        </header>

        <h1 className="mt-8 font-heading text-[clamp(26px,4vw,36px)] tracking-tight text-ink">Settings</h1>
        <p className="mt-2 text-[15px] text-ink/60">
          How quickly the ladder climbs, and when the night stays silent. She is never asked to change anything.
        </p>

        {/* household */}
        <Section title="Household">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-[13px] font-medium text-ink/80">Her name</span>
              <input value={parentName} onChange={(e) => setParentName(e.target.value)} className="kh-input mt-1.5" />
            </label>
            <label className="block">
              <span className="text-[13px] font-medium text-ink/80">Your name</span>
              <input value={childName} onChange={(e) => setChildName(e.target.value)} className="kh-input mt-1.5" />
            </label>
          </div>
          <p className="mt-3 text-xs text-ink/45">Pairing code for her phone: <span className="font-mono text-clay">{bundle?.household.pairingCode}</span></p>
        </Section>

        {/* quiet hours */}
        <Section title="Quiet hours" hint="Escalation holds at a gentle nudge during these hours, unless the score is severe (85+)">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-[13px] font-medium text-ink/80">Start</span>
              <select value={quietStart} onChange={(e) => setQuietStart(+e.target.value)} className="kh-input mt-1.5">
                {Array.from({ length: 24 }, (_, i) => i).map((h) => <option key={h} value={h}>{h}:00</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[13px] font-medium text-ink/80">End</span>
              <select value={quietEnd} onChange={(e) => setQuietEnd(+e.target.value)} className="kh-input mt-1.5">
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

        <button
          onClick={save}
          disabled={busy}
          className="w-full rounded-full bg-ink py-3 text-[15px] font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {saved ? 'Saved ✓' : busy ? 'Saving…' : 'Save settings'}
        </button>

        {/* sources */}
        <Section title="Sources" hint="The devices that speak to Khayaal. Keys are shown once, at creation.">
          <ul className="space-y-2">
            {(bundle?.sources ?? []).map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-xl border border-ink/10 bg-white px-4 py-3 text-sm">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.lastSeenTs ? '#4c7a4f' : '#c9b8a0' }} />
                  {s.label}
                  <span className="text-xs text-ink/40">({s.type})</span>
                </span>
                <button
                  onClick={async () => {
                    await fetch(`/api/v1/household/${id}/sources?sourceId=${s.id}`, { method: 'DELETE' });
                  }}
                  className="text-xs text-ink/40 transition-colors hover:text-[#b23a2f]"
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => addSource('esp32')} className="rounded-full border border-ink/15 px-4 py-2 text-sm text-ink/70 transition-colors hover:bg-white">
              + Register an ESP32 room sensor
            </button>
            <button onClick={() => addSource('phone')} className="rounded-full border border-ink/15 px-4 py-2 text-sm text-ink/70 transition-colors hover:bg-white">
              + Add a simulator source
            </button>
          </div>
          {newSource && (
            <div className="mt-4 rounded-xl border border-clay/30 bg-[#f7ecd7] p-4">
              <p className="text-sm font-medium text-[#7a5416]">“{newSource.label}” is paired.</p>
              <p className="mt-1 text-xs text-[#7a5416]/80">Source key (shown once — put it in the firmware config):</p>
              <code className="mt-2 block break-all rounded-lg bg-white/70 px-3 py-2 font-mono text-xs text-[#5a3a10]">{newSource.apiKey}</code>
            </div>
          )}
        </Section>

        <p className="mt-8 text-center text-xs leading-relaxed text-ink/40">
          Khayaal stores signals for seven days, scores them, and discards them. There is no archive to subpoena, because there is no archive.
        </p>
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

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 rounded-3xl border border-ink/10 bg-white p-6 shadow-[0_2px_20px_rgba(42,36,29,0.04)]">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink/50">{title}</h2>
      {hint && <p className="mt-1 text-xs leading-relaxed text-ink/45">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function NumberField({ label, value, onChange, suffix }: { label: string; value: number; onChange: (n: number) => void; suffix: string }) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-ink/80">{label}</span>
      <span className="float-right text-xs text-ink/40">{suffix}</span>
      <input
        type="number"
        min={1}
        max={240}
        value={value}
        onChange={(e) => onChange(Math.max(1, Math.min(240, +e.target.value || 1)))}
        className="kh-input mt-1.5"
      />
    </label>
  );
}
