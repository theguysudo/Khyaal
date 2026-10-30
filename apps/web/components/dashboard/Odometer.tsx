'use client';

/**
 * The signature — the wellbeing counter, on the web.
 *
 * The odometer is kept exactly as it was: one clipped column per digit holding
 * a 0–9 stack, translated by whole ems on a gentle spring when the live score
 * changes. Geometry and easing are untouched — only the skin moved. In the
 * Quiet Ledger the digits are mono ink on paper (the data voice), the orange
 * under-glow and the glass card are gone (glow and blur are banned), and the
 * counter sits directly beneath the serif verdict it belongs to.
 *
 * The value arrives from the same /state poll that fed the old CountUp —
 * nothing about the data contract changes, only the way it moves.
 */

import * as React from 'react';
import { LedgerRow } from './bento';

/** One rolling digit: a clipped window over a 0–9 stack. */
function OdoDigit({ char }: { char: string }) {
  const d = Math.max(0, Math.min(9, Number.parseInt(char, 10) || 0));
  return (
    <span className="kh-odo-digit" aria-hidden>
      <span className="kh-odo-col" style={{ transform: `translateY(-${d}em)` }}>
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i}>{i}</span>
        ))}
      </span>
    </span>
  );
}

/**
 * The rolling number itself. A screen-reader-friendly plain-text mirror sits
 * off-canvas — the visual digits are aria-hidden stacks.
 */
export function Odometer({ value, className = '' }: { value: number; className?: string }) {
  const chars = String(Math.max(0, Math.round(value))).slice(0, 3).split('');
  return (
    <span className={`kh-odo kh-odo-digits ${className}`}>
      {chars.map((c, i) => (
        <OdoDigit key={i} char={c} />
      ))}
      <span className="sr-only" aria-live="polite">
        {Math.round(value)}
      </span>
    </span>
  );
}

/**
 * The status panel under the verdict — everything the old counter card said,
 * as ledger rows: the tier as dot + word, the confidence note, the
 * plain-language status and the last-activity line. The rolling score itself
 * lives under the page's serif verdict; this panel carries the reading.
 */
export function CounterCard({
  score,
  learning,
  confidence,
  tierLabel,
  tierPill,
  tierDot,
  status,
  lastLine,
  children,
}: {
  score: number | null;
  learning: boolean;
  confidence?: string;
  tierLabel: string;
  tierPill: string;
  tierDot: string;
  status: React.ReactNode;
  lastLine: React.ReactNode;
  /** Extra content sits under the rows (e.g. the day-trend mini read). */
  children?: React.ReactNode;
}) {
  void score;
  return (
    <section aria-label="Current status" className="ledger-panel flex h-full min-w-0 flex-col p-5 text-[#1A1815] sm:p-6">
      <div className="flex items-baseline justify-between gap-3 border-b border-[#E7E2DA] pb-3">
        <h2 className="text-[13px] font-medium uppercase leading-4 tracking-[0.08em] text-[#1A1815]">Current status</h2>
      </div>

      <div className="ledger-row">
        <span className="ledger-row-label">Standing</span>
        <span className="ledger-row-value inline-flex items-center gap-2">
          <span className={`dot ${tierDot}`} aria-hidden />
          <span className={tierPill}>{tierLabel}</span>
        </span>
      </div>
      <LedgerRow label="Confidence" value={learning ? 'learning — nothing scored yet' : confidence ?? '—'} />

      <div className="ledger-row">
        <span className="ledger-row-label">Reading</span>
      </div>
      <p className="t-body pt-1 font-medium leading-snug text-[#1A1815]">{status}</p>
      <p className="mt-2 text-[15px] leading-relaxed text-[#57534E]">{lastLine}</p>

      {children}
    </section>
  );
}
