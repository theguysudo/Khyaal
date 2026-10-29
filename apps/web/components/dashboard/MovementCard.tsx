'use client';

/**
 * Movement — what the phone's GPS and step counter say, and nothing more.
 *
 * The coordinates never leave her phone: it works out a zone ("home" /
 * "away") and a few movement numbers on-device and sends only those. There is
 * no map here on purpose — a trail of where she has been is not the family's
 * business, and the API has never held one to leak.
 */

import * as React from 'react';
import { BentoCard, CardTitle } from './bento';
import { fmtAgo } from '@/lib/api';

export interface MovementSummary {
  zone: 'home' | 'away' | null;
  distanceM: number | null;
  speedKmh: number | null;
  moving: boolean | null;
  lastTs: number | null;
  stepsToday: number | null;
}

export default function MovementCard({
  movement,
  nowTs,
}: {
  movement: MovementSummary;
  nowTs: number;
}) {
  const hasData = movement.lastTs !== null || movement.stepsToday !== null;
  const away = movement.zone === 'away';

  return (
    <BentoCard label="Movement" className="col-span-12 lg:col-span-5">
      <CardTitle note="on-device · no trail">Movement</CardTitle>

      {!hasData ? (
        <div className="mt-4 rounded-xl border border-dashed border-white/15 p-4 text-sm leading-relaxed text-vision-dim">
          Her phone can report how much she has moved and whether she is home — without ever telling us where she is.
          Turn it on in the app&rsquo;s Movement tab.
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-vision-dim">Right now</p>
              <p className="mt-1 text-2xl font-bold leading-tight tracking-[-0.01em] text-white">
                {movement.zone === null
                  ? 'Not reported yet'
                  : away
                    ? 'Out of the house'
                    : 'At home'}
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-2xl px-2.5 py-1 text-xs font-medium ${
                movement.moving
                  ? 'bg-[#4FD1C5]/10 text-[#4FD1C5]'
                  : 'bg-white/[0.06] text-vision-dim'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full motion-reduce:animate-none ${movement.moving ? 'animate-pulse bg-[#4FD1C5]' : 'bg-white/30'}`}
              />
              {movement.moving ? 'moving' : 'still'}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <Stat
              label="Steps today"
              value={movement.stepsToday === null ? '—' : String(Math.round(movement.stepsToday))}
              unit={movement.stepsToday === null ? undefined : 'steps'}
            />
            <Stat
              label="Moved"
              value={movement.distanceM === null ? '—' : formatDistance(movement.distanceM)}
              unit="since last fix"
            />
            <Stat
              label="Speed"
              value={movement.speedKmh === null ? '—' : movement.speedKmh.toFixed(1)}
              unit="km/h"
            />
          </div>

          <p className="mt-4 text-xs leading-relaxed text-vision-dim">
            {movement.lastTs
              ? `Last reported ${fmtAgo(movement.lastTs, nowTs)}.`
              : 'Waiting for the first GPS report.'}{' '}
            Khayaal never records where she goes — only whether she is moving.
          </p>
        </>
      )}
    </BentoCard>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-vision-tile/60 px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-vision-dim">{label}</p>
      <p className="mt-1 text-xl font-bold leading-none tracking-[-0.01em] text-white">{value}</p>
      {unit && <p className="mt-1 text-[10px] text-white/40">{unit}</p>}
    </div>
  );
}

function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}
