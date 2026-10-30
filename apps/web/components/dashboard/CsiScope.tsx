'use client';

/**
 * CsiScope — the room sensor's own waveform, drawn like an instrument.
 *
 * The ESP32 reads how its Wi-Fi echoes move through the room and sends one
 * variance number every 250 ms. This card draws that number over a window
 * chosen on the ledger's segmented control (1 / 3 / 5 minutes — the endpoint
 * keeps five), with the device's own motion threshold and the periods it
 * flagged as motion or a fall shaded behind the line. It is the room's
 * signal, not a recording of a person — there is no audio, no camera and
 * nothing here to replay.
 */

import * as React from 'react';
import { BentoCard, Seg, smooth, useReducedMotion, useSize } from './bento';
import { fmtClock, useCsiSeries, type CsiBundle } from '@/lib/api';

const CH = 150; // svg height, matching the other dashboard charts
const RAIL_H = 16; // strip reserved at the bottom for event markers

/* Chart palette — ledger tokens on paper: the waveform is ink, motion is
   calm green, a fall is alarm red, the grid and threshold are rules. The IR
   beam keeps its own hue so it never reads as a CSI verdict — the watch
   amber, dashed on the rail. */
const WAVE = '#1A1815';
const CALM = '#2F6B4F';
const ALARM = '#B3261E';
const RULE = '#E7E2DA';
const RULE_STRONG = '#D6CFC4';
const INK_3 = '#8A857D';
const WATCH = '#9A6A1B';

const STATE_STYLE: Record<string, { label: string; color: string }> = {
  idle: { label: 'Idle', color: RULE_STRONG },
  motion: { label: 'Motion', color: CALM },
  fall: { label: 'Fall', color: ALARM },
  lost: { label: 'Lost', color: INK_3 },
};

const EVENT_COLOR: Record<string, string> = { motion: CALM, fall: ALARM, idle: RULE_STRONG, lost: INK_3 };

/** Variance numbers have no fixed unit — keep the readout short and honest. */
function fmtV(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 100) return String(Math.round(n));
  if (n >= 10) return n.toFixed(1);
  return n.toFixed(2);
}

const WINDOWS = [
  { value: '60', label: '1 MIN' },
  { value: '180', label: '3 MIN' },
  { value: '300', label: '5 MIN' },
] as const;

export default function CsiScope({ id }: { id: string }) {
  const { bundle } = useCsiSeries(id, 1000);
  const reduce = useReducedMotion();
  const [windowSec, setWindowSec] = React.useState<'60' | '180' | '300'>('180');
  return (
    <BentoCard label="Room sensor scope">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E7E2DA] pb-3">
        <h2 className="text-[13px] font-medium uppercase leading-4 tracking-[0.08em] text-[#1A1815]">What the sensor hears</h2>
        <Seg
          ariaLabel="Scope window"
          value={windowSec}
          onChange={setWindowSec}
          options={WINDOWS.map((w) => ({ value: w.value, label: w.label }))}
        />
      </div>
      <ScopeBody bundle={bundle} reduce={reduce} windowMs={Number(windowSec) * 60_000} />
    </BentoCard>
  );
}

function ScopeBody({ bundle, reduce, windowMs }: { bundle: CsiBundle | null; reduce: boolean; windowMs: number }) {
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
  while (start > 0 && points[start - 1].ts >= t1Raw - windowMs) start--;
  const win = points.slice(start);

  if (!bundle) {
    return (
      <div className="mt-4 flex min-h-[150px] items-center justify-center rounded-lg border border-dashed border-[#D6CFC4] text-[15px] text-[#57534E]">
        Listening to the room sensor…
      </div>
    );
  }

  if (win.length === 0) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-[#D6CFC4] p-5 text-[15px] leading-relaxed text-[#57534E]">
        Waiting for readings — wave a hand in front of the room sensor. The waveform appears as soon as
        it starts streaming.
      </div>
    );
  }

  const latest = win[win.length - 1];
  const st = STATE_STYLE[latest.state] ?? {
    label: latest.state,
    color: RULE_STRONG,
  };
  const thr = bundle.threshold || latest.thr;
  const sensorLabel = bundle.anchors.find((a) => a.sourceId === latest.sourceId)?.label ?? latest.sourceId;

  // Light downsampling so a full window stays a cheap path.
  const step = Math.max(1, Math.ceil(win.length / 480));
  const sampled = win.filter((p, i) => i % step === 0 || i === win.length - 1);

  const t0 = t1Raw - windowMs;
  const X = (ts: number) => Math.max(0, Math.min(W, ((ts - t0) / windowMs) * W));
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
  const IR_COLOR = WATCH;
  const irEvents = (bundle.irEvents ?? []).slice(-30);
  const irOnRail = irEvents.filter((e) => e.ts >= t0);
  const irNearNow = irEvents.length > 0 && irEvents[irEvents.length - 1].state === 'detected';
  const recentIr = irEvents.slice(-2).reverse();

  return (
    <>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-[#57534E]">Signal strength now</p>
          <p className="mt-1 font-mono text-[28px] font-semibold leading-none tracking-[-0.02em] text-[#1A1815]">{fmtV(latest.v)}</p>
          <p className="mt-1.5 text-[13px] text-[#8A857D]">{sensorLabel}</p>
        </div>
        <span className="inline-flex flex-col items-end gap-1.5">
          {/* status — always dot + word */}
          <span className="inline-flex items-center gap-2 text-[13px] text-[#57534E]">
            <span className="dot" style={{ background: st.color }} aria-hidden />
            {st.label}
          </span>
          {irNearNow && (
            <span className="inline-flex items-center gap-2 text-[13px] text-[#57534E]">
              <span className="dot" style={{ background: IR_COLOR }} aria-hidden />
              Object at the sensor
            </span>
          )}
        </span>
      </div>

      <div className="mt-4">
        <div className="ledger-row !py-2">
          <span className="ledger-row-label">Instant · 0.25 s</span>
          <span className="ledger-row-value">{fmtV(latest.f)}</span>
        </div>
        <div className="ledger-row !py-2">
          <span className="ledger-row-label">Motion threshold</span>
          <span className="ledger-row-value">{fmtV(thr)}</span>
        </div>
      </div>

      <div ref={ref} className="relative mt-3 min-h-[150px] flex-1">
        {W > 0 && (
          <svg
            width={W}
            height={CH}
            className="block"
            role="img"
            aria-label={`Room sensor variance over the last window. Currently ${st.label.toLowerCase()}, reading ${fmtV(latest.v)} against a threshold of ${fmtV(thr)}.`}
          >
            {bands.map((b, i) => (
              <rect
                key={i}
                x={b.x}
                y={0}
                width={b.w}
                height={plotH}
                fill={b.kind === 'fall' ? ALARM : CALM}
                opacity={b.kind === 'fall' ? 0.14 : 0.10}
              />
            ))}
            <line x1="0" x2={W} y1={Y(thr)} y2={Y(thr)} stroke={INK_3} strokeOpacity="0.6" strokeWidth="1" strokeDasharray="4 4" />
            <text x={W - 4} y={Math.max(10, Y(thr) - 5)} textAnchor="end" fontSize="10" fill={INK_3}>
              threshold
            </text>
            {d && <path d={`${d}L${last[0]},${plotH}L${P[0][0]},${plotH}Z`} fill={WAVE} opacity="0.05" />}
            {d && (
              <path
                d={d}
                pathLength={1}
                fill="none"
                stroke={WAVE}
                strokeWidth="2"
                strokeLinecap="round"
                style={{
                  strokeDasharray: 1,
                  strokeDashoffset: drawn || reduce ? 0 : 1,
                  transition: reduce ? 'none' : 'stroke-dashoffset 1.2s cubic-bezier(.32,.72,0,1) .1s',
                }}
              />
            )}
            <circle cx={last[0]} cy={last[1]} r="4" fill={WAVE} stroke="#FFFFFF" strokeWidth="1.5" />
            <line x1="0" x2={W} y1={CH - 7} y2={CH - 7} stroke={RULE} strokeWidth="1" />
            {railEvents.map((e, i) => (
              <line
                key={`${e.ts}-${e.sourceId}-${i}`}
                x1={X(e.ts)}
                x2={X(e.ts)}
                y1={CH - 12}
                y2={CH - 2}
                stroke={EVENT_COLOR[e.kind] ?? RULE_STRONG}
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

      <ul className="mt-3">
        {recent.length === 0 && <li className="text-[13px] text-[#8A857D]">A quiet window — the sensor has not flagged anything.</li>}
        {recent.map((e, i) => (
          <li key={`${e.ts}-${e.sourceId}-${i}`} className="ledger-row !py-2 text-[13px]">
            <span className="flex-none font-mono tabular-nums text-[#8A857D]">{fmtClock(e.ts)}</span>
            <span className="inline-flex items-center gap-2 text-[#1A1815]">
              <span className="dot flex-none" style={{ background: EVENT_COLOR[e.kind] ?? RULE_STRONG }} aria-hidden />
              {e.label}
            </span>
          </li>
        ))}
        {recentIr.map((e, i) => (
          <li key={`ir-${e.ts}-${i}`} className="ledger-row !py-2 text-[13px]">
            <span className="flex-none font-mono tabular-nums text-[#8A857D]">{fmtClock(e.ts)}</span>
            <span className="inline-flex items-center gap-2 text-[#1A1815]">
              <span className="dot flex-none" style={{ background: IR_COLOR }} aria-hidden />
              {e.state === 'detected' ? 'Something is right at the sensor (IR beam)' : 'The IR beam cleared'}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[13px] leading-relaxed text-[#8A857D]">
        The sensor reads how its own Wi-Fi echoes move around the room — a waveform, never a recording. No
        camera, no microphone.
      </p>
    </>
  );
}
