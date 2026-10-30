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
import { BentoCard, CardTitle, LedgerRow } from './bento';
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
    <BentoCard label="Movement">
      <CardTitle note="on-device · no trail">Movement</CardTitle>

      {!hasData ? (
        <div className="mt-4 rounded-lg border border-dashed border-[#D6CFC4] p-4 text-[15px] leading-relaxed text-[#57534E]">
          Her phone can report how much she has moved and whether she is home — without ever telling us where she is.
          Turn it on in the app&rsquo;s Movement tab.
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <p className="inline-flex items-center gap-2 text-[13px] font-medium uppercase tracking-[0.08em] text-[#57534E]">Right now</p>
              <p className="t-section mt-1 text-[#1A1815]">
                {movement.zone === null
                  ? 'Not reported yet'
                  : away
                    ? 'Out of the house'
                    : 'At home'}
              </p>
            </div>
            <span className="inline-flex items-center gap-2 text-[13px] text-[#57534E]">
              <span
                className="dot"
                style={{ background: movement.moving ? '#2F6B4F' : '#D6CFC4' }}
                aria-hidden
              />
              {movement.moving ? 'moving' : 'still'}
            </span>
          </div>

          <div className="mt-4">
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

          <p className="mt-3 border-t border-[#E7E2DA] pt-3 text-[13px] leading-relaxed text-[#57534E]">
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

function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}
