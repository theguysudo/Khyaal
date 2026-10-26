'use client';

/**
 * Bento primitives for the family dashboard, adapted from the analytics-bento
 * reference: smooth Catmull-Rom paths, rAF CountUp, ResizeObserver sizing —
 * but the surfaces follow Khayaal's warm paper theme and every number shown
 * is one a family is allowed to see.
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
      className={`relative min-w-0 overflow-hidden rounded-[24px] border border-ink/10 bg-white p-5 text-ink shadow-[0_1px_2px_rgba(42,36,29,0.04),0_10px_30px_-12px_rgba(42,36,29,0.10)] sm:p-6 ${className}`}
    >
      {children}
    </section>
  );
}

export function CardTitle({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink/45">{children}</h2>
      {note && <span className="text-xs text-ink/35">{note}</span>}
    </div>
  );
}
