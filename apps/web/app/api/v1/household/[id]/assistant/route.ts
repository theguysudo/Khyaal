import { NextResponse } from 'next/server';
import { requireHouseholdMember, unauthorized } from '@/lib/server/authz';
import { getStore } from '@/lib/server/store';
import { rateLimit } from '@/lib/server/rate-limit';

const MAX_MESSAGE_CHARS = 2000;

/**
 * POST /api/v1/household/{id}/assistant — the parent's "Ask Khayaal" helper,
 * proxied server-side so the app never holds an API key. The persona is a
 * warm companion: reminders, small help, no medical advice. Household
 * members only (her phone via source key, family via session); rate-limited
 * and size-capped because it is an LLM spend.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!rateLimit(`assistant:${req.headers.get('x-forwarded-for') ?? 'local'}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }
  const { id } = await params;
  const guard = await requireHouseholdMember(req, id);
  if (guard instanceof Response) return guard;
  const hh = guard;

  let body: { messages?: { role: string; content: string }[]; apiKey?: string; model?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const messages = (Array.isArray(body.messages) ? body.messages.slice(-8) : [])
    .filter((m) => m && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));
  if (messages.length === 0) return NextResponse.json({ error: 'messages required' }, { status: 400 });

  const apiKey = (typeof body.apiKey === 'string' && body.apiKey.trim()) || process.env.OPENROUTER_API_KEY || '';
  const model = (typeof body.model === 'string' && body.model.trim()) || 'meta-llama/llama-3.1-8b-instruct:free';
  if (!apiKey) {
    return NextResponse.json(
      { reply: "I can't think right now — the AI service isn't set up yet. Try again later, everything else still works." },
    );
  }

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: 220,
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: `You are Khayaal, a warm, unhurried companion for ${hh.parentName}, an elderly person living independently. Keep answers short (2-4 sentences), kind and practical. Reminders and gentle encouragement are welcome. Never give medical advice — suggest asking the doctor. You cannot call anyone; suggest tapping "Call family" for that.`,
          },
          ...messages,
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      return NextResponse.json({ reply: 'I lost my thoughts for a moment — ask me again in a minute.' });
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return NextResponse.json({ reply: data.choices?.[0]?.message?.content ?? '…' });
  } catch {
    return NextResponse.json({ reply: 'I lost my thoughts for a moment — ask me again in a minute.' });
  }
}
