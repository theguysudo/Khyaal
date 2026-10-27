import { NextResponse } from 'next/server';
import { requireHouseholdMember, unauthorized } from '@/lib/server/authz';
import { rateLimit } from '@/lib/server/rate-limit';
import { chat, companionSystemPrompt, PROVIDER_LABELS } from '@/lib/server/llm';
import type { LlmProvider } from '@khayaal/shared';

const MAX_MESSAGE_CHARS = 2000;
const FALLBACK_REPLY =
  "I can't think right now — the AI service isn't set up yet. Try again later, everything else still works.";

/**
 * POST /api/v1/household/{id}/assistant — the parent's "Ask Khayaal" helper,
 * proxied server-side so the app never holds an API key. The persona is a
 * warm companion: reminders, small help, no medical advice. Household
 * members only (her phone via source key, family via session); rate-limited
 * and size-capped because it is an LLM spend.
 *
 * Body: { messages: [{role, content}], provider?: 'openrouter'|'minimax'|'nvidia', model?, apiKey? }
 * Reply: { reply, provider, model }
 *
 * The provider is a preference, not a promise: if that one has no key or
 * fails, the other free providers are tried before giving up.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!rateLimit(`assistant:${req.headers.get('x-forwarded-for') ?? 'local'}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }
  const { id } = await params;
  const guard = await requireHouseholdMember(req, id);
  if (guard instanceof Response) return guard;
  const hh = guard;

  let body: {
    messages?: { role: string; content: string }[];
    apiKey?: string;
    model?: string;
    provider?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const messages = (Array.isArray(body.messages) ? body.messages.slice(-8) : [])
    .filter((m) => m && typeof m.content === 'string')
    .map((m) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: m.content.slice(0, MAX_MESSAGE_CHARS),
    }));
  if (messages.length === 0) return NextResponse.json({ error: 'messages required' }, { status: 400 });

  const requested = (body.provider ?? '').toLowerCase();
  const provider: LlmProvider | 'auto' =
    requested === 'minimax' || requested === 'nvidia' || requested === 'openrouter'
      ? requested
      : 'auto';

  const result = await chat(
    [
      { role: 'system', content: companionSystemPrompt(hh.parentName) },
      ...messages,
    ],
    {
      provider,
      model: typeof body.model === 'string' ? body.model : undefined,
      apiKey: typeof body.apiKey === 'string' ? body.apiKey : undefined,
      maxTokens: 600,
      temperature: 0.7,
      timeoutMs: 45_000,
    },
  );

  if (!result) {
    return NextResponse.json({ reply: FALLBACK_REPLY, provider: null, model: null });
  }
  return NextResponse.json({
    reply: result.text,
    provider: result.provider,
    providerLabel: PROVIDER_LABELS[result.provider],
    model: result.model,
  });
}
