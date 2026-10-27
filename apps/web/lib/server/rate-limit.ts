import type { NextRequest } from 'next/server';

/**
 * In-memory sliding-window rate limiter — one bucket per key. Protects the
 * ingest and auth surfaces from hammering without any external dependency.
 */
const buckets = new Map<string, number[]>();
const g = globalThis as unknown as { __khayaalRate?: Map<string, number[]> };

function table(): Map<string, number[]> {
  if (!g.__khayaalRate) g.__khayaalRate = new Map();
  return g.__khayaalRate;
}

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const t = table();
  const hits = (t.get(key) ?? []).filter((ts) => now - ts < windowMs);
  if (hits.length >= max) {
    t.set(key, hits);
    return false;
  }
  hits.push(now);
  t.set(key, hits);
  if (t.size > 5000) t.clear(); // hard cap on memory
  void buckets;
  return true;
}
