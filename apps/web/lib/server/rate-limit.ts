/**
 * In-memory sliding-window rate limiter — one bucket per key, plus a global
 * ceiling per route that cannot be bypassed.
 *
 * Why the ceiling: the per-key bucket is usually keyed on x-forwarded-for,
 * and on a direct deployment (no trusted proxy in front) that header is
 * whatever the client says it is. A flooder rotating the header gets a fresh
 * bucket every request. The global bucket — keyed on the route name alone —
 * is not spoofable: at 4x the per-client limit it sheds a flood no matter
 * what headers say, while a real family (a phone, a board, a browser) never
 * comes near it.
 */
const g = globalThis as unknown as { __khayaalRate?: Map<string, number[]> };

function table(): Map<string, number[]> {
  if (!g.__khayaalRate) g.__khayaalRate = new Map();
  return g.__khayaalRate;
}

function hit(t: Map<string, number[]>, key: string, max: number, windowMs: number, now: number): boolean {
  const hits = (t.get(key) ?? []).filter((ts) => now - ts < windowMs);
  const ok = hits.length < max;
  if (ok) hits.push(now);
  t.set(key, hits);
  return ok;
}

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const t = table();
  // The route name is everything before the first colon ("ingest:1.2.3.4").
  const route = key.split(":")[0];
  const perRouteGlobal = `global:${route}`;
  if (!hit(t, perRouteGlobal, max * 4, windowMs, now)) {
    return false;
  }
  const ok = hit(t, key, max, windowMs, now);
  if (t.size > 5000) t.clear(); // hard cap on memory
  return ok;
}
