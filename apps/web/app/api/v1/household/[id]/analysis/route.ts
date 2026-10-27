import { NextResponse } from 'next/server';
import type { Signal } from '@khayaal/shared';
import { requireFamily, unauthorized } from '@/lib/server/authz';
import { getStore } from '@/lib/server/store';
import { tickHousehold } from '@/lib/server/runtime';
import { rateLimit } from '@/lib/server/rate-limit';

/**
 * POST /api/v1/household/{id}/analysis — LLM behaviour analysis.
 * Sends ONLY privacy-safe aggregates (score trend stats, tier history,
 * contribution frequencies, sleep/sound counts, hourly activity shape) to
 * OpenRouter or NVIDIA — never raw content, there is none to send.
 * Key: body.apiKey, or env OPENROUTER_API_KEY / NVIDIA_API_KEY.
 * Family-only (session) — an LLM spend is never an unauthenticated action.
 */
const PROVIDERS = {
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    envKey: 'OPENROUTER_API_KEY',
    defaultModel: 'meta-llama/llama-3.1-8b-instruct:free',
  },
  nvidia: {
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    envKey: 'NVIDIA_API_KEY',
    defaultModel: 'meta/llama-3.1-8b-instruct',
  },
} as const;

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
  const provider = (body.provider === 'nvidia' ? 'nvidia' : 'openrouter') as keyof typeof PROVIDERS;
  const cfg = PROVIDERS[provider];
  const apiKey =
    (typeof body.apiKey === 'string' && body.apiKey.trim()) || process.env[cfg.envKey] || '';
  const model =
    (typeof body.model === 'string' && body.model.trim()) || cfg.defaultModel;
  if (!apiKey) {
    return NextResponse.json(
      { error: `No ${provider} API key — set ${cfg.envKey} or pass apiKey` },
      { status: 400 },
    );
  }

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

  const reply = await chatCompletion(cfg.url, apiKey, model, [
    {
      role: 'system',
      content:
        'You are Khayaal, a calm family-care analyst. You receive privacy-safe aggregates from a passive wellbeing monitor for an elderly parent. Identify behaviour patterns, gentle concerns, and 2-3 concrete recommendations. Never diagnose medical conditions; recommend a doctor for anything medical. Be warm, concrete, under 220 words. Use short paragraphs or bullets.',
    },
    { role: 'user', content: JSON.stringify(stats) },
  ]);

  if (!reply.ok) {
    return NextResponse.json({ error: `LLM request failed (${reply.status})` }, { status: 502 });
  }

  const analysis = { ts: Date.now(), model: `${provider}:${model}`, text: reply.text };
  await getStore().updateHousehold(id, { lastAnalysis: analysis });
  return NextResponse.json({ analysis });
}

function countContributions(contributions: { signal: string; reason: string }[]): string[] {
  return contributions.map((c) => c.reason);
}

async function chatCompletion(
  url: string,
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
): Promise<{ ok: boolean; status: number; text: string }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, messages, max_tokens: 500, temperature: 0.6 }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return { ok: false, status: res.status, text: '' };
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return { ok: true, status: 200, text: data.choices?.[0]?.message?.content ?? '' };
  } catch {
    return { ok: false, status: 0, text: '' };
  }
}
