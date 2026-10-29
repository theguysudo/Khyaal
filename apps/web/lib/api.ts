'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  Blueprint,
  CsiAnchor,
  CsiEstimate,
  CsiEvent,
  CsiPoint,
  Contribution,
  Household,
  HouseholdEvent,
  Tier,
} from '@khayaal/shared';

/** Client-safe mirror of the server TickBundle (never imports server code). */
export interface Bundle {
  household: Household;
  state: {
    score: number | null;
    tier: Tier;
    status: string;
    contributions: Contribution[];
    confidence: number;
    lastActiveTs: number | null;
    tierSinceTs: number;
    updatedTs: number;
    scoreTrend: { ts: number; score: number }[];
    snoozeUntilTs: number | null;
    ack: { by: string; ts: number } | null;
    learning: boolean;
    sos: { active: boolean; origin: 'button' | 'auto' | null; sinceTs: number | null; ack: { by: string; ts: number } | null };
  };
  events: HouseholdEvent[];
  sources: { id: string; type: string; label: string; lastSeenTs: number | null }[];
  baseline: { wakeHour: number; chargingStartHour: number; sampleDays: number };
  simNowTs: number;
  realNowTs: number;
  commands: { id: string; ts: number; type: string; text: string; ackTs: number | null }[];
  hourlyActivity: number[];
  sleepSound: { sourceId: string; type: string; value: string; ts: number }[];
  /** Movement summary from the phone's GPS — a zone and numbers, never coordinates. */
  movement: {
    zone: 'home' | 'away' | null;
    distanceM: number | null;
    speedKmh: number | null;
    moving: boolean | null;
    lastTs: number | null;
    stepsToday: number | null;
  };
}

export async function postJSON<T = unknown>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export async function patchJSON<T = unknown>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

/** Polling hook — the realtime layer (works identically in demo and prod). */
export function useHouseholdState(id: string, intervalMs = 1500) {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const res = await fetch(`/api/v1/household/${id}/state`, { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed to load');
        if (alive) {
          setBundle(data as Bundle);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        busy.current = false;
      }
    };
    poll();
    const t = setInterval(poll, intervalMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id, intervalMs]);

  return { bundle, error };
}

/** Live CSI scope bundle — client-safe mirror of GET /api/v1/household/{id}/csi. */
/** The reflective IR beam — a distinct channel, never fused with CSI. */
export interface CsiIrEvent {
  ts: number;
  sourceId: string;
  state: 'detected' | 'clear';
}

export interface CsiBundle {
  points: CsiPoint[];
  events: CsiEvent[];
  irEvents: CsiIrEvent[];
  anchors: (CsiAnchor & { irDetected?: boolean })[];
  estimated: CsiEstimate | null;
  threshold: number;
  blueprint: Blueprint;
  nowTs: number;
}

/** Polling hook for the room sensor's live scope (same pattern as useHouseholdState). */
export function useCsiSeries(id: string, intervalMs = 1000) {
  const [bundle, setBundle] = useState<CsiBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const res = await fetch(`/api/v1/household/${id}/csi`, { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed to load');
        if (alive) {
          setBundle(data as CsiBundle);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        busy.current = false;
      }
    };
    poll();
    const t = setInterval(poll, intervalMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id, intervalMs]);

  return { bundle, error };
}

// --- Formatting helpers -----------------------------------------------------

export function fmtAgo(ts: number | null, nowTs: number): string {
  if (!ts) return 'no activity seen yet';
  const min = Math.max(0, Math.round((nowTs - ts) / 60000));
  if (min < 1) return 'this very moment';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  return `${h} h ${min % 60} min ago`;
}

export function fmtClock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export const TIER_META: Record<Tier, { label: string; color: string; soft: string; text: string }> = {
  0: { label: 'All well', color: '#4c7a4f', soft: '#e6efe2', text: '#33512f' },
  1: { label: 'Nudge sent', color: '#c98a2b', soft: '#f7ecd7', text: '#7a5416' },
  2: { label: 'Check-in asked', color: '#c4622f', soft: '#f8e3d5', text: '#7c3c17' },
  3: { label: 'Needs attention', color: '#b23a2f', soft: '#f6dcd8', text: '#77231c' },
  4: { label: 'SOS — alarm ringing', color: '#8c1d13', soft: '#5c130a', text: '#fdf1ee' },
};

export const SIGNAL_LABELS: Record<string, string> = {
  screen_event: 'Phone unlock',
  motion: 'Movement',
  charging: 'Overnight charge',
  presence: 'Room sensor',
  silence: 'Silence',
  location_zone: 'Being out',
  app_usage: 'App use',
  steps: 'Steps',
  manual_checkin: 'Check-in',
};
