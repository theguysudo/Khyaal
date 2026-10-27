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
        <div className="mt-4 rounded-2xl border border-dashed border-ink/20 p-4 text-sm leading-relaxed text-ink/45">
          Her phone can report how much she has moved and whether she is home — without ever telling us where she is.
          Turn it on in the app&rsquo;s Movement tab.
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-ink/40">Right now</p>
              <p className="mt-1 font-heading text-[24px] leading-tight text-ink">
                {movement.zone === null
                  ? 'Not reported yet'
                  : away
                    ? 'Out of the house'
                    : 'At home'}
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs ${
                movement.moving
                  ? 'bg-clay/10 text-claydeep'
                  : 'bg-ink/5 text-ink/45'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${movement.moving ? 'animate-pulse bg-clay' : 'bg-ink/25'}`}
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

          <p className="mt-4 text-xs leading-relaxed text-ink/45">
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
    <div className="rounded-2xl border border-ink/10 bg-paper/60 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-ink/35">{label}</p>
      <p className="mt-1 font-heading text-[20px] leading-none text-ink">{value}</p>
      {unit && <p className="mt-1 text-[10px] text-ink/35">{unit}</p>}
    </div>
  );
}

function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}
