import { NextResponse } from 'next/server';
import type { LlmProvider, Signal } from '@khayaal/shared';
import { requireFamily, unauthorized } from '@/lib/server/authz';
import { getStore } from '@/lib/server/store';
import { tickHousehold } from '@/lib/server/runtime';
import { rateLimit } from '@/lib/server/rate-limit';
import { chat } from '@/lib/server/llm';

/**
 * POST /api/v1/household/{id}/analysis — LLM behaviour analysis.
 * Sends ONLY privacy-safe aggregates (score trend stats, tier history,
 * contribution frequencies, sleep/sound counts, hourly activity shape) to
 * OpenRouter, MiniMax or NVIDIA NIM — never raw content, there is none to
 * send. Key: body.apiKey, or env OPENROUTER_API_KEY / NVIDIA_API_KEY.
 * Family-only (session) — an LLM spend is never an unauthenticated action.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!rateLimit(`analysis:${req.headers.get('x-forwarded-for') ?? 'local'}`, 6, 60_000)) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }
  const { id } = await params;
  const guard = await requireFamily(req, id);
  if (guard instanceof Response) return guard;
  const bundle = await tickHousehold(id);
  if (!bundle) return unauthorized();

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* defaults */
  }
  const requested = typeof body.provider === 'string' ? body.provider.toLowerCase() : '';
  const provider: LlmProvider | 'auto' =
    requested === 'minimax' ||
    requested === 'nvidia' ||
    requested === 'openrouter' ||
    requested === 'xai'
      ? requested
      : 'auto';

  const { state, household: hh, events, hourlyActivity, sleepSound } = bundle;
  const trend = state.scoreTrend;
  const scores = trend.map((p) => p.score);
  const stats = {
    parent: hh.parentName,
    currentScore: state.score,
    tier: state.tier,
    confidence: Number(state.confidence.toFixed(2)),
    trend24h: scores.slice(-96),
    peakScore: scores.length ? Math.max(...scores) : null,
    avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    tierChanges24h: events.filter((e) => e.type === 'tier_change').length,
    checkins24h: events.filter((e) => e.type === 'checkin').length,
    recurringReasons: countContributions(state.contributions),
    nightEvents: sleepSound.map((s: Signal) => ({ type: s.type, value: String(s.value) })),
    hourlyActivity,
    lastActiveTs: state.lastActiveTs,
  };

  const result = await chat(
    [
      {
        role: 'system',
        content:
          'You are Khayaal, a calm family-care analyst. You receive privacy-safe aggregates from a passive wellbeing monitor for an elderly parent. Identify behaviour patterns, gentle concerns, and 2-3 concrete recommendations. Never diagnose medical conditions; recommend a doctor for anything medical. Be warm, concrete, under 220 words. Use short paragraphs or bullets.',
      },
      { role: 'user', content: JSON.stringify(stats) },
    ],
    {
      provider,
      model: typeof body.model === 'string' ? body.model : undefined,
      apiKey: typeof body.apiKey === 'string' ? body.apiKey : undefined,
      maxTokens: 500,
      temperature: 0.6,
    },
  );

  if (!result) {
    return NextResponse.json(
      { error: 'No free LLM provider could answer — set OPENROUTER_API_KEY or NVIDIA_API_KEY.' },
      { status: 502 },
    );
  }

  const analysis = {
    ts: Date.now(),
    model: `${result.provider}:${result.model}`,
    text: result.text,
  };
  await getStore().updateHousehold(id, { lastAnalysis: analysis });
  return NextResponse.json({ analysis });
}

function countContributions(contributions: { signal: string; reason: string }[]): string[] {
  return contributions.map((c) => c.reason);
}
