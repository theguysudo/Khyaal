'use client';

/**
 * Settings: escalation timers, quiet hours, names, source management.
 * The demo time-warp lives in the demo console, not here — families never
 * see a clock they can bend.
 *
 * Same language as the dashboard: the Quiet Ledger — paper, hairline panels,
 * numbered sections, ledger rows, terracotta for the one filled action.
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
    <main className="kh-dash relative min-h-screen px-4 py-10 sm:px-8">
      <div className="relative mx-auto max-w-2xl">
        <header className="flex items-center justify-between border-b border-[#E7E2DA] pb-4">
          <Link
            href={`/household/${id}`}
            className="text-[15px] font-medium text-[#57534E] transition-colors hover:text-[#1A1815]"
          >
            ← back to the dashboard
          </Link>
          <span className="flex items-center gap-2.5">
            <span className="text-[13px] font-medium text-[#57534E]">
              Khayaal <span className="mx-0.5 text-[#D6CFC4]">/</span>{' '}
              <strong className="font-semibold text-[#1A1815]">Settings</strong>
            </span>
            <span
              aria-hidden
              className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-[#B4451C] text-[15px] text-[#FFF7F0]"
            >
              ✳︎
            </span>
          </span>
        </header>

        <h1 className="t-display mt-8 text-[34px]">Settings</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[#57534E]">
          How quickly the ladder climbs, and when the night stays silent. She is never asked to change anything.
        </p>

        {/* household */}
        <Section index="01" title="Household">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-[13px] font-medium text-[#57534E]">Her name</span>
              <input value={parentName} onChange={(e) => setParentName(e.target.value)} className={`${INPUT} mt-1.5 w-full`} />
            </label>
            <label className="block">
              <span className="text-[13px] font-medium text-[#57534E]">Your name</span>
              <input value={childName} onChange={(e) => setChildName(e.target.value)} className={`${INPUT} mt-1.5 w-full`} />
            </label>
          </div>
          <p className="mt-3 text-[13px] text-[#57534E]">
            Pairing code for her phone: <span className="font-mono tracking-[0.14em] text-[#B4451C]">{bundle?.household.pairingCode}</span>
          </p>
        </Section>

        {/* quiet hours */}
        <Section index="02" title="Quiet hours" hint="Escalation holds at a gentle nudge during these hours, unless the score is severe (85+)">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-[13px] font-medium text-[#57534E]">Start</span>
              <select value={quietStart} onChange={(e) => setQuietStart(+e.target.value)} className={`${INPUT} mt-1.5 w-full`}>
                {Array.from({ length: 24 }, (_, i) => i).map((h) => <option key={h} value={h}>{h}:00</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[13px] font-medium text-[#57534E]">End</span>
              <select value={quietEnd} onChange={(e) => setQuietEnd(+e.target.value)} className={`${INPUT} mt-1.5 w-full`}>
                {Array.from({ length: 24 }, (_, i) => i).map((h) => <option key={h} value={h}>{h}:00</option>)}
              </select>
            </label>
          </div>
        </Section>

        {/* escalation timers */}
        <Section index="03" title="Escalation ladder" hint="Minutes the score must stay raised before each step fires">
          <div className="grid gap-4 sm:grid-cols-3">
            <NumberField label="Nudge after" value={nudgeAfterMin} onChange={setNudge} suffix="min" />
            <NumberField label="Check-in after" value={checkInAfterMin} onChange={setCheckIn} suffix="min" />
            <NumberField label="Alert after" value={alertAfterMin} onChange={setAlert} suffix="min" />
          </div>
        </Section>

        <button onClick={save} disabled={busy} className={`${BTN_PRIMARY} w-full py-3`}>
          {saved ? 'Saved' : busy ? 'Saving…' : 'Save settings'}
        </button>

        {/* sources */}
        <Section index="04" title="Sources" hint="The devices that speak to Khayaal. Keys are shown once, at creation.">
          <ul>
            {(bundle?.sources ?? []).map((s) => (
              <li key={s.id} className="ledger-row">
                <span className="flex items-center gap-2">
                  <span className="dot" style={{ background: s.lastSeenTs ? '#2F6B4F' : '#D6CFC4' }} aria-hidden />
                  <span className="font-medium text-[#1A1815]">{s.label}</span>
                  <span className="font-mono text-[13px] text-[#8A857D]">
                    {s.lastSeenTs ? 'checking in' : 'quiet'} · ({s.type})
                  </span>
                </span>
                <button
                  onClick={async () => {
                    await fetch(`/api/v1/household/${id}/sources?sourceId=${s.id}`, { method: 'DELETE' });
                  }}
                  className={`kh-press rounded px-2 py-1 text-[13px] font-medium text-[#8A857D] transition-colors hover:bg-[#F7E0D3] hover:text-[#B3261E] ${FOCUS}`}
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
            <div className="mt-4 rounded-lg border border-[#B4451C] bg-[#FDF3EC] p-4">
              <p className="text-[15px] font-medium text-[#93370D]">“{newSource.label}” is paired.</p>
              <p className="mt-1 text-[13px] text-[#93370D]">Source key (shown once — put it in the firmware config):</p>
              <code className="mt-2 block break-all rounded-lg border border-[#E7E2DA] bg-white px-3 py-2 font-mono text-[13px] text-[#1A1815]">{newSource.apiKey}</code>
            </div>
          )}
        </Section>

        <p className="mt-8 border-t border-[#E7E2DA] pt-4 text-center text-[13px] leading-relaxed text-[#8A857D]">
          Khayaal stores signals for seven days, scores them, and discards them. There is no archive to subpoena, because there is no archive.
        </p>
      </div>
    </main>
  );
}

function Section({ index, title, hint, children }: { index: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="ledger-panel mt-6 p-6">
      <div className="ledger-section-head !border-b-0 !pb-0">
        <span className="ledger-index">{index}</span>
        <h2 className="ledger-label">{title}</h2>
      </div>
      {hint && <p className="mt-1 text-[13px] leading-relaxed text-[#8A857D]">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function NumberField({ label, value, onChange, suffix }: { label: string; value: number; onChange: (n: number) => void; suffix: string }) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-[#57534E]">{label}</span>
      <span className="float-right font-mono text-[13px] text-[#8A857D]">{suffix}</span>
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
