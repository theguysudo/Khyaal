'use client';

/**
 * The band — what her wrist measured, and nothing else.
 *
 * A Fastrack smartband (or any other wearable) syncs its steps, pulse,
 * sleep and active minutes into Health Connect on her phone; the phone
 * posts them here as a `smartwatch` source. This card shows the latest
 * aggregate and when it arrived.
 *
 * Like every other card here: no feed, no map, no trace. A number the
 * family is allowed to see, and a last-active time.
 */

import * as React from 'react';
import type { SmartwatchSummary } from '@khayaal/shared';
import { BentoCard, CardTitle, LedgerRow } from './bento';
import { BTN_SECONDARY, FOCUS } from './kh';
import { fmtAgo } from '@/lib/api';

/** The band syncs every half hour; polling faster than that is theatre. */
const POLL_MS = 30_000;

export default function SmartwatchPanel({ householdId }: { householdId: string }) {
  const [summary, setSummary] = React.useState<SmartwatchSummary | null>(null);
  const [nowTs, setNowTs] = React.useState<number>(() => Date.now());
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [credential, setCredential] = React.useState<{ id: string; apiKey: string } | null>(null);

  React.useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/v1/household/${householdId}/smartwatch`, {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to load');
        const data = (await res.json()) as { summary: SmartwatchSummary; nowTs: number };
        if (!alive) return;
        setSummary(data.summary);
        setNowTs(data.nowTs);
        setError(null);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Failed to load');
      }
    };
    void poll();
    const t = setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [householdId]);

  /**
   * Minting a band source is a family action — it hands out the key the
   * phone will post with. The key is shown exactly once, here.
   */
  const pair = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/household/${householdId}/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'smartwatch', label: 'Smartwatch (Fastrack band)' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not pair the band');
      setCredential({ id: data.id, apiKey: data.apiKey });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not pair the band');
    } finally {
      setBusy(false);
    }
  };

  const paired = summary?.paired === true;
  const hasData =
    summary !== null &&
    (summary.stepsToday !== null ||
      summary.heartRateBpm !== null ||
      summary.sleepMinutesLastNight !== null ||
      summary.activeMinutesToday !== null);

  return (
    <BentoCard label="Her band">
      <CardTitle note="aggregates · never a feed">Her band</CardTitle>

      {!paired ? (
        <div className="mt-4 rounded-lg border border-dashed border-[#D6CFC4] p-4 text-[15px] leading-relaxed text-[#57534E]">
          <p>
            Pair a Fastrack band (or any wearable that syncs to Health Connect) and her steps, pulse and sleep join
            the picture — as a second pair of eyes, never as a tracker.
          </p>
          <button onClick={pair} disabled={busy} className={`${BTN_SECONDARY} mt-3`}>
            {busy ? 'Pairing…' : 'Pair a band'}
          </button>
          {credential && (
            <div className="mt-3 rounded-lg border border-[#E7E2DA] bg-[#FAF8F5] p-3 text-[13px] leading-relaxed text-[#57534E]">
              <p className="font-medium text-[#1A1815]">Give these to her phone — shown once:</p>
              <pre className="mt-1.5 overflow-x-auto whitespace-pre rounded-lg border border-[#E7E2DA] bg-white px-2 py-1.5 font-mono text-[12px] text-[#1A1815]">{`src ${credential.id}\nkey ${credential.apiKey}`}</pre>
              <p className="mt-1.5 text-[#8A857D]">
                Enter the pairing code from the Watchers card in the Khayaal app, then allow Health Connect access.
              </p>
            </div>
          )}
        </div>
      ) : !hasData ? (
        <div className="mt-4 rounded-lg border border-dashed border-[#D6CFC4] p-4 text-[15px] leading-relaxed text-[#57534E]">
          {summary?.label ?? 'The band'} is paired but has not reported yet. Once her phone syncs Health Connect, the
          numbers will appear here.
          <p className="mt-2 font-mono text-[13px] text-[#8A857D]">
            {summary?.lastSeenTs
              ? `Last seen ${fmtAgo(summary.lastSeenTs, nowTs)}.`
              : 'Nothing has arrived from it so far.'}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <p className="inline-flex items-center gap-2 text-[13px] font-medium uppercase tracking-[0.08em] text-[#57534E]">Last reported</p>
              <p className="t-section mt-1 text-[#1A1815]">
                {summary?.lastSeenTs ? fmtAgo(summary.lastSeenTs, nowTs) : 'Just now'}
              </p>
            </div>
            <span className="inline-flex items-center gap-2 text-[13px] text-[#57534E]">
              <span
                className="dot"
                style={{
                  background:
                    summary?.lastSeenTs && nowTs - summary.lastSeenTs < 6 * 3600_000 ? '#2F6B4F' : '#D6CFC4',
                }}
                aria-hidden
              />
              {summary?.label ?? 'band'}
            </span>
          </div>

          <div className="mt-4">
            <Stat
              label="Steps today"
              value={summary?.stepsToday === null || summary?.stepsToday === undefined ? '—' : String(Math.round(summary.stepsToday))}
              unit="counted by the band"
            />
            <Stat
              label="Pulse"
              value={summary?.heartRateBpm === null || summary?.heartRateBpm === undefined ? '—' : String(Math.round(summary.heartRateBpm))}
              unit="bpm at the last reading"
            />
            <Stat
              label="Last night"
              value={summary?.sleepMinutesLastNight === null || summary?.sleepMinutesLastNight === undefined ? '—' : formatSleep(summary.sleepMinutesLastNight)}
              unit="slept"
            />
            <Stat
              label="Active today"
              value={summary?.activeMinutesToday === null || summary?.activeMinutesToday === undefined ? '—' : String(Math.round(summary.activeMinutesToday))}
              unit="active minutes"
            />
          </div>

          <p className="mt-3 border-t border-[#E7E2DA] pt-3 text-[13px] leading-relaxed text-[#57534E]">
            The band reports a few numbers — steps, pulse, sleep. It is used to corroborate what the phone already
            suspects, never to track her, and never to raise an alarm on its own.
          </p>
        </>
      )}

      {error && <p className="mt-3 text-[13px] leading-relaxed text-[#B3261E]">{error}</p>}
    </BentoCard>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <LedgerRow
      label={label}
      value={
        <>
          {value}
          {unit && <span className="block text-[13px] font-normal text-[#8A857D]">{unit}</span>}
        </>
      }
    />
  );
}

/** Minutes -> "6 h 40 min" or "40 min". */
function formatSleep(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
