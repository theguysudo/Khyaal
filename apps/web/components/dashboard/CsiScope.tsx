'use client';

/**
 * CsiScope — the room sensor's own waveform, drawn like an instrument.
 *
 * The ESP32 reads how its Wi-Fi echoes move through the room and sends one
 * variance number every 250 ms. This card draws that number over the last
 * three minutes, with the device's own motion threshold and the periods it
 * flagged as motion or a fall shaded behind the line. It is the room's
 * signal, not a recording of a person — there is no audio, no camera and
 * nothing here to replay.
 */

import * as React from 'react';
import { BentoCard, CardTitle, smooth, useReducedMotion, useSize } from './bento';
import { fmtClock, useCsiSeries, type CsiBundle } from '@/lib/api';

/** How much of the stream the scope shows — the endpoint returns 5 minutes. */
const WINDOW_MS = 3 * 60_000;

const CH = 150; // svg height, matching the other dashboard charts
const RAIL_H = 16; // strip reserved at the bottom for event markers

/* Chart palette — the Khayaal terracotta ramp on Untitled neutrals. */
const CLAY = '#DC6803';
const SAGE = '#039855';
const RED = '#D92D20';
const DUSK = '#404040';
const GREY = '#D4D4D4';

const STATE_STYLE: Record<string, { label: string; pill: string; dot: string; pulse: boolean }> = {
  idle: { label: 'Idle', pill: 'bg-n-100 text-n-500', dot: 'bg-n-300', pulse: false },
  motion: { label: 'Motion', pill: 'bg-brand-50 text-brand-700', dot: 'bg-brand-500', pulse: true },
  fall: { label: 'Fall', pill: 'bg-err-50 text-err-700', dot: 'bg-err-600', pulse: true },
  lost: { label: 'Lost', pill: 'bg-n-100 text-n-600', dot: 'bg-n-400', pulse: false },
};

const EVENT_COLOR: Record<string, string> = { motion: SAGE, fall: RED, idle: GREY, lost: DUSK };

/** Variance numbers have no fixed unit — keep the readout short and honest. */
function fmtV(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 100) return String(Math.round(n));
  if (n >= 10) return n.toFixed(1);
  return n.toFixed(2);
}

export default function CsiScope({ id }: { id: string }) {
  const { bundle } = useCsiSeries(id, 1000);
  const reduce = useReducedMotion();
  return (
    <BentoCard label="Room sensor scope" className="col-span-12 lg:col-span-5">
      <CardTitle note="live · last 3 min">What the sensor hears</CardTitle>
      <ScopeBody bundle={bundle} reduce={reduce} />
    </BentoCard>
  );
}

function ScopeBody({ bundle, reduce }: { bundle: CsiBundle | null; reduce: boolean }) {
  const [ref, { w: W }] = useSize();
  const [drawn, setDrawn] = React.useState(false);

  React.useEffect(() => {
    if (!W) return;
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setDrawn(true)));
    return () => cancelAnimationFrame(r);
  }, [W]);

  const points = bundle?.points ?? [];
  const nowTs = bundle?.nowTs ?? Date.now();

  // Trim to the visible window (the tail of the series is already sorted).
  let start = points.length;
  const t1Raw = Math.max(nowTs, points.length ? points[points.length - 1].ts : 0);
  while (start > 0 && points[start - 1].ts >= t1Raw - WINDOW_MS) start--;
  const win = points.slice(start);

  if (!bundle) {
    return (
      <div className="mt-4 flex min-h-[150px] items-center justify-center rounded-lg border border-n-200 bg-n-50 text-sm text-n-400">
        Listening to the room sensor…
      </div>
    );
  }

  if (win.length === 0) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-n-300 p-5 text-sm leading-relaxed text-n-500">
        Waiting for readings — wave a hand in front of the room sensor. The waveform appears as soon as
        it starts streaming.
      </div>
    );
  }

  const latest = win[win.length - 1];
  const st = STATE_STYLE[latest.state] ?? {
    label: latest.state,
    pill: 'bg-n-100 text-n-500',
    dot: 'bg-n-300',
    pulse: false,
  };
  const thr = bundle.threshold || latest.thr;
  const sensorLabel = bundle.anchors.find((a) => a.sourceId === latest.sourceId)?.label ?? latest.sourceId;

  // Light downsampling so a full window stays a cheap path.
  const step = Math.max(1, Math.ceil(win.length / 480));
  const sampled = win.filter((p, i) => i % step === 0 || i === win.length - 1);

  const t0 = t1Raw - WINDOW_MS;
  const X = (ts: number) => Math.max(0, Math.min(W, ((ts - t0) / WINDOW_MS) * W));
  const vMax = Math.max(thr, ...sampled.map((p) => p.v)) * 1.15 + 1e-6;
  const plotH = CH - RAIL_H;
  const Y = (v: number) => 8 + (1 - v / vMax) * (plotH - 16);
  const P = sampled.map((p) => [X(p.ts), Y(p.v)] as [number, number]);
  const d = P.length >= 2 ? smooth(P) : '';
  const last = P[P.length - 1];

  // Contiguous motion / fall periods, shaded behind the line.
  const bands: { x: number; w: number; kind: string }[] = [];
  let cur: { from: number; to: number; kind: string } | null = null;
  const flush = () => {
    if (cur && (cur.kind === 'motion' || cur.kind === 'fall')) {
      bands.push({ x: X(cur.from), w: Math.max(2, X(cur.to) - X(cur.from)), kind: cur.kind });
    }
  };
  for (const p of win) {
    if (cur && cur.kind === p.state) cur.to = p.ts;
    else {
      flush();
      cur = { from: p.ts, to: p.ts, kind: p.state };
    }
  }
  flush();

  const events = bundle.events.slice(-30);
  const railEvents = events.filter((e) => e.ts >= t0);
  const recent = events.slice(-4).reverse();

  // The IR beam is the sensor's other channel: near-field only, never part
  // of the CSI verdict. Its ticks share the rail with a distinct colour.
  const IR_COLOR = '#8a5a8f';
  const irEvents = (bundle.irEvents ?? []).slice(-30);
  const irOnRail = irEvents.filter((e) => e.ts >= t0);
  const irNearNow = irEvents.length > 0 && irEvents[irEvents.length - 1].state === 'detected';
  const recentIr = irEvents.slice(-2).reverse();

  return (
    <>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-n-400">Signal strength now</p>
          <p className="mt-1 text-[32px] font-semibold leading-none tracking-[-0.02em] text-n-900">{fmtV(latest.v)}</p>
          <p className="mt-1.5 text-xs text-n-500">{sensorLabel}</p>
        </div>
        <span className="inline-flex flex-col items-end gap-1.5">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs ${st.pill}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${st.dot} ${st.pulse && !reduce ? 'animate-pulse' : ''}`} />
            {st.label}
          </span>
          {irNearNow && (
            <span className="inline-flex items-center gap-1.5 rounded-2xl bg-[#8a5a8f]/10 px-2.5 py-0.5 text-[11px] font-medium text-[#8a5a8f]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#8a5a8f]" />
              Object at the sensor
            </span>
          )}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Stat label="Instant · 0.25 s" value={fmtV(latest.f)} />
        <Stat label="Motion threshold" value={fmtV(thr)} />
      </div>

      <div ref={ref} className="relative mt-3 min-h-[150px] flex-1">
        {W > 0 && (
          <svg
            width={W}
            height={CH}
            className="block"
            role="img"
            aria-label={`Room sensor variance over the last three minutes. Currently ${st.label.toLowerCase()}, reading ${fmtV(latest.v)} against a threshold of ${fmtV(thr)}.`}
          >
            {bands.map((b, i) => (
              <rect
                key={i}
                x={b.x}
                y={0}
                width={b.w}
                height={plotH}
                fill={b.kind === 'fall' ? RED : SAGE}
                opacity={b.kind === 'fall' ? 0.13 : 0.12}
              />
            ))}
            <line x1="0" x2={W} y1={Y(thr)} y2={Y(thr)} stroke={GREY} strokeWidth="1" strokeDasharray="4 4" />
            <text x={W - 4} y={Math.max(10, Y(thr) - 5)} textAnchor="end" fontSize="10" fill={GREY}>
              threshold
            </text>
            {d && <path d={`${d}L${last[0]},${plotH}L${P[0][0]},${plotH}Z`} fill={CLAY} opacity="0.08" />}
            {d && (
              <path
                d={d}
                pathLength={1}
                fill="none"
                stroke={CLAY}
                strokeWidth="2"
                strokeLinecap="round"
                style={{
                  strokeDasharray: 1,
                  strokeDashoffset: drawn || reduce ? 0 : 1,
                  transition: reduce ? 'none' : 'stroke-dashoffset 1.2s cubic-bezier(.3,.8,.2,1) .1s',
                }}
              />
            )}
            <circle cx={last[0]} cy={last[1]} r="4" fill={CLAY} className="stroke-white" strokeWidth="1.5" />
            <line x1="0" x2={W} y1={CH - 7} y2={CH - 7} className="stroke-n-200" strokeWidth="1" />
            {railEvents.map((e, i) => (
              <line
                key={`${e.ts}-${e.sourceId}-${i}`}
                x1={X(e.ts)}
                x2={X(e.ts)}
                y1={CH - 12}
                y2={CH - 2}
                stroke={EVENT_COLOR[e.kind] ?? GREY}
                strokeWidth="2"
                strokeLinecap="round"
              >
                <title>{`${e.label} · ${fmtClock(e.ts)}`}</title>
              </line>
            ))}
            {irOnRail.map((e, i) => (
              <line
                key={`ir-${e.ts}-${e.sourceId}-${i}`}
                x1={X(e.ts)}
                x2={X(e.ts)}
                y1={CH - 12}
                y2={CH - 2}
                stroke={IR_COLOR}
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="2 2"
              >
                <title>{`${e.state === 'detected' ? 'Object at the sensor (IR beam)' : 'IR beam clear'} · ${fmtClock(e.ts)}`}</title>
              </line>
            ))}
          </svg>
        )}
      </div>

      <ul className="mt-3 space-y-1.5">
        {recent.length === 0 && <li className="text-xs text-n-400">A quiet window — the sensor has not flagged anything.</li>}
        {recent.map((e, i) => (
          <li key={`${e.ts}-${e.sourceId}-${i}`} className="flex items-baseline gap-3 text-xs">
            <span className="flex-none tabular-nums text-n-400">{fmtClock(e.ts)}</span>
            <span className="inline-flex items-center gap-1.5 text-n-700">
              <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: EVENT_COLOR[e.kind] ?? GREY }} />
              {e.label}
            </span>
          </li>
        ))}
        {recentIr.map((e, i) => (
          <li key={`ir-${e.ts}-${i}`} className="flex items-baseline gap-3 text-xs">
            <span className="flex-none tabular-nums text-n-400">{fmtClock(e.ts)}</span>
            <span className="inline-flex items-center gap-1.5 text-n-700">
              <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: IR_COLOR }} />
              {e.state === 'detected' ? 'Something is right at the sensor (IR beam)' : 'The IR beam cleared'}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[11px] leading-relaxed text-n-400">
        The sensor reads how its own Wi-Fi echoes move around the room — a waveform, never a recording. No
        camera, no microphone.
      </p>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-n-200 bg-n-50 px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-n-400">{label}</p>
      <p className="mt-1 text-lg font-semibold leading-none tracking-[-0.01em] text-n-900">{value}</p>
    </div>
  );
}
