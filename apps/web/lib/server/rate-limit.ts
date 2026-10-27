/**
 * In-memory sliding-window rate limiter — one bucket per key, plus a global
 * ceiling per route that cannot be bypassed.
 *
 * Why the ceiling: the per-key bucket is usually keyed on x-forwarded-for,
 * and on a direct deployment (no trusted proxy in front) that header is
 * whatever the client says it is. A flooder rotating the header gets a fresh
 * bucket every request. The global bucket — keyed on the route name alone —
 * is not spoofable: at a fixed multiple of the per-client limit it sheds a
 * flood no matter what headers say, while a real family (a phone, a board, a
 * browser) never comes near it.
 *
 * Order matters. The per-key bucket is consumed FIRST, and the global bucket
 * only by requests that passed it. The reverse order let a single abusive
 * key burn the shared global budget and lock every legitimate device out
 * for the rest of the window (a 60-second denial of service against the
 * household's own board). A rotating-x-forwarded-for flood still reaches the
 * global bucket — each rotated key passes its own fresh bucket — so the
 * ceiling keeps working as the anti-rotation backstop.
 */
const g = globalThis as unknown as { __khayaalRate?: Map<string, number[]> };

/** How many buckets the table may hold before the oldest ones are dropped. */
const MAX_BUCKETS = 5000;

/**
 * The default multiple of the per-key limit that the per-route global
 * ceiling allows. Four is right for key-minting and LLM routes (low
 * absolutes are correct there); the high-frequency device streams pass a
 * larger multiple of their own.
 */
const DEFAULT_GLOBAL_MULTIPLIER = 4;

export interface RateLimitOptions {
  /**
   * How many times the per-route global ceiling may exceed the per-key
   * limit. Defaults to 4. Ingest-class routes (the board's CSI stream, the
   * device poll queues, talkback audio) pass 8: one board alone sends 60
   * CSI frames a minute and a phone adds motion/GPS batches on top, so a
   * 4x ceiling of 480/min can be reached by two honest households in one
   * deployment.
   */
  globalMultiplier?: number;
}

function table(): Map<string, number[]> {
  if (!g.__khayaalRate) g.__khayaalRate = new Map();
  return g.__khayaalRate;
}

function hit(t: Map<string, number[]>, key: string, max: number, windowMs: number, now: number): boolean {
  const hits = (t.get(key) ?? []).filter((ts) => now - ts < windowMs);
  const ok = hits.length < max;
  if (ok) hits.push(now);
  // delete + set moves the bucket to the end of the insertion order, so the
  // eviction below drops the least-recently-used ones first.
  t.delete(key);
  t.set(key, hits);
  return ok;
}

/**
 * Keeps the table bounded WITHOUT resetting it. The old code called
 * `t.clear()` when the table passed 5000 entries, which wiped every bucket
 * everywhere — every route, every key — and was reachable by an attacker
 * simply rotating x-forwarded-for. Now the oldest buckets are dropped
 * one by one.
 */
function evictOldest(t: Map<string, number[]>): void {
  while (t.size > MAX_BUCKETS) {
    const oldest = t.keys().next();
    if (oldest.done) break;
    t.delete(oldest.value);
  }
}

export function rateLimit(
  key: string,
  max: number,
  windowMs: number,
  opts: RateLimitOptions = {},
): boolean {
  const now = Date.now();
  const t = table();
  // The route name is everything before the first colon ("ingest:1.2.3.4").
  const route = key.split(':')[0];

  // 1. The caller's own bucket. A caller that is already over its limit is
  //    turned away here and never touches the shared budget.
  if (!hit(t, key, max, windowMs, now)) return false;

  // 2. The route's shared ceiling — the anti-x-forwarded-for-rotation
  //    backstop. Only requests that cleared their own bucket reach it.
  const multiplier = opts.globalMultiplier ?? DEFAULT_GLOBAL_MULTIPLIER;
  const perRouteGlobal = `global:${route}`;
  if (!hit(t, perRouteGlobal, max * multiplier, windowMs, now)) return false;

  evictOldest(t);
  return true;
}
