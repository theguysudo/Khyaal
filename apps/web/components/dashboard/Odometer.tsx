'use client';

/**
 * The signature — the wellbeing counter, on the web.
 *
 * A dark-glass plate (#262626, 28px radius) with Khayaal's orange glow
 * breathing behind it, and the digits rendered as an odometer: one clipped
 * column per digit holding a 0–9 stack, translated by whole ems on a gentle
 * spring when the live score changes. Geometry and easing follow the v3
 * mobile reference (.kx3-odo); the glass shadows are scaled from the Figma
 * Counter source (file tNwILFNaBEw7UP86o6slKB, node 1:2740).
 *
 * The value arrives from the same /state poll that fed the old CountUp —
 * nothing about the data contract changes, only the way it moves.
 */

import * as React from 'react';

const GLASS_SHADOW =
  '0 -19px 45px -15px rgba(255, 255, 255, 0.20), ' +
  '0 44px 42px -36px rgba(255, 107, 33, 0.45), ' +
  'inset 0 1px 3px rgba(255, 255, 255, 0.28), ' +
  'inset 0 12px 21px rgba(255, 255, 255, 0.10), ' +
  'inset 0 70px 78px -67px rgba(255, 255, 255, 0.10), ' +
  'inset 0 0 5px rgba(0, 0, 0, 0.22)';

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
 * The full counter card — the hero of the dashboard. Everything the old
 * StatusCard said is still said here, in the new voice: the tier label,
 * the confidence note, the score, the plain-language status and the
 * last-activity line.
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
  /** Extra content sits under the counter (e.g. the day-trend mini read). */
  children?: React.ReactNode;
}) {
  return (
    <section
      aria-label="Current status"
      className="relative flex h-full min-w-0 flex-col overflow-hidden rounded-[28px] bg-n-800 text-white"
      style={{ boxShadow: GLASS_SHADOW }}
    >
      <div className="kh-counter-glow" aria-hidden />
      <div className="relative flex h-full flex-col p-6 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">Wellbeing</p>
          <span className={`kh-tier-ease inline-flex items-center gap-1.5 rounded-2xl px-2.5 py-1 text-xs font-medium ${tierPill}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${tierDot}`} aria-hidden />
            {tierLabel}
          </span>
        </div>

        <div className="mt-5 flex items-end gap-3">
          {score === null ? (
            <span className="kh-odo-digits text-[76px] font-semibold leading-none tracking-[-0.02em] text-white/35 sm:text-[88px]">
              ···
            </span>
          ) : (
            <Odometer value={score} className="text-[76px] sm:text-[88px]" />
          )}
          <span className="pb-1.5 text-sm font-medium text-white/70">of 100</span>
        </div>

        <p className="mt-1 text-xs font-medium text-white/55">
          {learning ? 'quiet learning — nothing is scored yet' : confidence}
        </p>

        <div className="mt-5 border-t border-white/10 pt-5">
          <p className="text-[17px] font-semibold leading-snug text-white">{status}</p>
          <p className="mt-2 text-sm leading-relaxed text-white/65">{lastLine}</p>
        </div>

        {children}
      </div>
    </section>
  );
}
