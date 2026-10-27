/**
 * Time helpers. The engine works in "simulation time" — every caller passes
 * an explicit nowTs so the demo console can time-warp hours into seconds.
 * Hours are local to the server (single-region product: India).
 */

export const MIN = 60_000;
export const HOUR = 60 * MIN;

export function hourOf(ts: number): number {
  return new Date(ts).getHours() + new Date(ts).getMinutes() / 60;
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Decimal hour -> "7:30 AM" style, for plain-language reasons. */
export function fmtHour(h: number): string {
  const hh = Math.floor(h) % 24;
  const mm = Math.round((h - Math.floor(h)) * 60);
  const ampm = hh < 12 ? 'AM' : 'PM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return mm === 0 ? `${h12} ${ampm}` : `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
}

export function fmtClock(ts: number): string {
  return fmtHour(hourOf(ts));
}

/** Duration -> "6 h 20 min" style. */
export function fmtDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / MIN));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

/** True when hour-of-day is inside [start, end), wrapping midnight. */
export function inHourRange(nowH: number, start: number, end: number): boolean {
  if (start === end) return false;
  if (start < end) return nowH >= start && nowH < end;
  return nowH >= start || nowH < end; // wraps midnight (e.g. 22 -> 6)
}

export function isQuietHours(qh: { start: number; end: number }, ts: number): boolean {
  return inHourRange(hourOf(ts), qh.start, qh.end);
}

/** Rough daytime check — absence signals only count when she should be up. */
export function isDaytime(ts: number): boolean {
  const h = hourOf(ts);
  return h >= 6 && h < 21;
}
