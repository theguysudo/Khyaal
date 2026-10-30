'use client';

/**
 * Ledger primitives for the family dashboard — Quiet Ledger edition
 * (docs/DESIGN_QUIET_LEDGER.md).
 *
 * Surfaces are hairline panels on raised paper: 1px rules, radius 8, never a
 * shadow, never a pill. Data lives in full-width ledger rows (caps label left,
 * tabular-mono value right, status as a 6px dot + word). Multi-frame content
 * gets a segmented control with a 160ms thumb slide. The measurement helpers
 * (useSize), the Catmull-Rom path builder and the reduced-motion hook are
 * unchanged — only the skin moved.
 */

import * as React from 'react';

export const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export function useReducedMotion() {
  const [r, setR] = React.useState(false);
  React.useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    setR(m.matches);
    const on = () => setR(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return r;
}

export function useSize() {
  // Callback-ref, not object-ref: cards like the CSI scope render their
  // measured div only once data arrives, and an effect keyed on an object
  // ref would capture null on first paint and never observe the real node.
  const [el, setEl] = React.useState<HTMLDivElement | null>(null);
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  React.useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      const h = Math.round(e.contentRect.height);
      setSize((p) => (p.w === w && p.h === h ? p : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, size] as const;
}

/** smooth path through points (catmull-rom as cubic beziers) */
export function smooth(P: [number, number][]) {
  const n = P.length;
  if (n < 2) return '';
  const g = (i: number) => P[Math.max(0, Math.min(n - 1, i))];
  let d = `M${P[0][0]},${P[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = g(i - 1);
    const p1 = g(i);
    const p2 = g(i + 1);
    const p3 = g(i + 2);
    const k = 0.18;
    d += `C${p1[0] + (p2[0] - p0[0]) * k},${p1[1] + (p2[1] - p0[1]) * k} ${p2[0] - (p3[0] - p1[0]) * k},${p2[1] - (p3[1] - p1[1]) * k} ${p2[0]},${p2[1]}`;
  }
  return d;
}

export function CountUp({ value, duration = 1100 }: { value: number; duration?: number }) {
  const ref = React.useRef(null as HTMLSpanElement | null);
  const from = React.useRef(0);
  const reduce = useReducedMotion();
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) {
      el.textContent = String(Math.round(value));
      from.current = value;
      return;
    }
    const a = from.current;
    const t0 = performance.now();
    let raf = 0;
    const f = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const v = a + (value - a) * ease(t);
      el.textContent = String(Math.round(v));
      from.current = v;
      if (t < 1) raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, reduce]);
  return <span ref={ref}>0</span>;
}

/**
 * The numbered section head — mono index + caps label + hairline rule spanning
 * the column. Every card on the dashboard belongs to one of these.
 */
export function SectionHead({
  index,
  label,
  note,
  id,
}: {
  index: string;
  label: string;
  note?: string;
  id?: string;
}) {
  return (
    <div id={id} className="ledger-section-head scroll-mt-6">
      <span className="ledger-index">{index}</span>
      <span className="ledger-label">{label}</span>
      {note && <span className="ledger-note">{note}</span>}
    </div>
  );
}

/** The ledger panel — raised paper, 1px rule, radius 8, never a shadow. */
export function BentoCard({
  className = '',
  children,
  label,
}: {
  className?: string;
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <section
      aria-label={label}
      className={`ledger-panel relative min-w-0 p-5 text-[#1A1815] sm:p-6 ${className}`}
    >
      {children}
    </section>
  );
}

/** Card title — caps 13px label with an optional note on the right, on a rule. */
export function CardTitle({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[#E7E2DA] pb-3">
      <h2 className="text-[13px] font-medium uppercase leading-4 tracking-[0.08em] text-[#1A1815]">{children}</h2>
      {note && <span className="text-[13px] text-[#8A857D]">{note}</span>}
    </div>
  );
}

/** Status — a 6px dot and a word. Colour is never the only carrier. */
export function StatusDot({
  color,
  word,
  className = '',
}: {
  color: string;
  word: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 text-[13px] text-[#57534E] ${className}`}>
      <span className="dot" style={{ background: color }} aria-hidden />
      <span>{word}</span>
    </span>
  );
}

/** One ledger row: caps label left, tabular-mono value right. */
export function LedgerRow({
  label,
  value,
  children,
}: {
  label: React.ReactNode;
  value?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="ledger-row">
      <span className="ledger-row-label">{label}</span>
      {value !== undefined ? <span className="ledger-row-value">{value}</span> : null}
      {children}
    </div>
  );
}

/**
 * Segmented control — track paper-raised on a 1px rule, active segment
 * ink-on-paper with a 160ms thumb slide (iOS 26 mechanics, re-authored).
 */
export function Seg<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  const active = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  return (
    <div className="seg" role="group" aria-label={ariaLabel}>
      <span
        aria-hidden
        className="seg-thumb"
        style={{
          width: `calc((100% - 4px) / ${options.length})`,
          transform: `translateX(${active * 100}%)`,
        }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="seg-btn"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
