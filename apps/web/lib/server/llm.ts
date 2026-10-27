import type { LlmProvider } from '@khayaal/shared';

/**
 * One place that knows how to talk to an LLM. Four providers, one interface,
 * no SDK — every one of them speaks the OpenAI chat-completions shape, so
 * the request body is written once.
 *
 *  - openrouter : OpenRouter's free models (llama-3.1-8b-instruct:free).
 *  - minimax    : MiniMax's flash model, hosted on NVIDIA NIM.
 *  - nvidia     : NVIDIA NIM (integrate.api.nvidia.com) — free hosted models.
 *  - xai        : Grok, on xAI's own API (api.x.ai).
 *
 * Keys come from the environment (OPENROUTER_API_KEY / NVIDIA_API_KEY /
 * XAI_API_KEY) or from the request body. The app never holds a key; the
 * backend proxies.
 */

export type { LlmProvider };

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  provider?: LlmProvider | 'auto';
  model?: string;
  /**
   * A key typed into the dashboard. It is used for the provider that was
   * explicitly asked for, and for no other: a key must never be handed to a
   * different backend than the one it belongs to.
   */
  apiKey?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  /** Ask the backend for a JSON object back (supported by every provider). */
  json?: boolean;
}

export interface ChatResult {
  text: string;
  provider: LlmProvider;
  model: string;
}

export const PROVIDER_LABELS: Record<LlmProvider, string> = {
  openrouter: 'OpenRouter',
  minimax: 'MiniMax',
  nvidia: 'NVIDIA NIM',
  xai: 'xAI Grok',
};

/**
 * NIM's free tier is throttled per minute, so a 429 is expected traffic, not
 * an error. The same call is retried after a short backoff, because a 429 on
 * one model id does not mean the next model id will be any better.
 */
const MAX_429_RETRIES = 3;
const THROTTLE_BACKOFF_MS = 4_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const DEFAULT_MODELS: Record<LlmProvider, string[]> = {
  openrouter: ['meta-llama/llama-3.1-8b-instruct:free'],
  // MiniMax's flash model, hosted on NVIDIA NIM. NIM's free tier is
  // per-minute, so this id is frequently throttled — the retry below rides
  // that out rather than failing the whole request.
  minimax: ['minimaxai/minimax-m3.1-flash'],
  // NIM's catalogue rotates: some ids are rate-limited or undeployed at any
  // given moment. Verified live against /v1/models on 26 Oct 2026.
  nvidia: ['minimaxai/minimax-m3.1-flash', 'nvidia/llama-3.1-nemotron-70b-instruct'],
  // Grok on xAI's own API. The "-latest" aliases track the current release.
  xai: ['grok-4-latest', 'grok-3-mini'],
};

/**
 * The model ids a caller is allowed to ask for.
 *
 * The catalogue is a closed list: a request used to forward its `model`
 * parameter verbatim to the provider, so any caller could name an expensive
 * model and bill it against the operator's key. Anything outside this list
 * is ignored and the provider's own defaults are used instead.
 */
export const ALLOWED_MODELS: readonly string[] = [
  ...new Set(Object.values(DEFAULT_MODELS).flat()),
];

/** True when the caller named a model the catalogue knows. */
export function isAllowedModel(model: unknown): model is string {
  return typeof model === 'string' && ALLOWED_MODELS.includes(model.trim());
}

interface ProviderSpec {
  baseUrl: string;
  envKey: string;
  headerName: string;
  headerPrefix: string;
  extraHeaders?: Record<string, string>;
  /** Extra endpoints to try if the first one has no key. */
  fallbackBaseUrls?: string[];
  fallbackEnvKey?: string;
}

const PROVIDERS: Record<LlmProvider, ProviderSpec> = {
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    envKey: 'OPENROUTER_API_KEY',
    headerName: 'Authorization',
    headerPrefix: 'Bearer ',
  },
  minimax: {
    // MiniMax's flash model is hosted on NVIDIA NIM, so one key covers it.
    // OpenRouter serves the same model id as a second chance.
    baseUrl: 'https://integrate.api.nvidia.com/v1/chat/completions',
    envKey: 'NVIDIA_API_KEY',
    headerName: 'Authorization',
    headerPrefix: 'Bearer ',
    extraHeaders: { Accept: 'application/json' },
    fallbackBaseUrls: ['https://openrouter.ai/api/v1/chat/completions'],
    fallbackEnvKey: 'OPENROUTER_API_KEY',
  },
  nvidia: {
    baseUrl: 'https://integrate.api.nvidia.com/v1/chat/completions',
    envKey: 'NVIDIA_API_KEY',
    headerName: 'Authorization',
    headerPrefix: 'Bearer ',
    extraHeaders: { Accept: 'application/json' },
  },
  xai: {
    baseUrl: 'https://api.x.ai/v1/chat/completions',
    envKey: 'XAI_API_KEY',
    headerName: 'Authorization',
    headerPrefix: 'Bearer ',
    extraHeaders: { Accept: 'application/json' },
  },
};

/** The key a provider will use: the request's own key first, then the env. */
export function providerKey(provider: LlmProvider, requestKey?: string): string {
  const fromRequest = typeof requestKey === 'string' ? requestKey.trim() : '';
  if (fromRequest) return fromRequest;
  return (process.env[PROVIDERS[provider].envKey] ?? '').trim();
}

export function hasProviderKey(provider: LlmProvider, requestKey?: string): boolean {
  return providerKey(provider, requestKey).length > 0;
}

/** The provider a request asked for, or 'auto' when it asked for none. */
export function parseProvider(raw: unknown): LlmProvider | 'auto' {
  const v = typeof raw === 'string' ? raw.toLowerCase() : '';
  return v === 'minimax' || v === 'nvidia' || v === 'openrouter' || v === 'xai' ? v : 'auto';
}

/**
 * The order providers are tried in. The requested one first, then the other
 * three — so a missing key degrades to "another free model answers" instead
 * of a dead feature.
 */
export function providerOrder(requested: LlmProvider | 'auto' | undefined): LlmProvider[] {
  const all: LlmProvider[] = ['minimax', 'nvidia', 'xai', 'openrouter'];
  if (!requested || requested === 'auto') return all;
  return [requested, ...all.filter((p) => p !== requested)];
}

interface ProviderCall {
  result: ChatResult | null;
}

/**
 * Calls one provider. A 429 is retried against the SAME model id after a
 * short backoff — the throttle is per minute and per key, so switching
 * models on the same key does not help.
 */
async function callProvider(
  provider: LlmProvider,
  messages: ChatTurn[],
  opts: ChatOptions,
  useRequestKey: boolean,
): Promise<ProviderCall> {
  const spec = PROVIDERS[provider];
  const key = providerKey(provider, useRequestKey ? opts.apiKey : undefined);
  if (!key) return { result: null };

  // A caller may only pick from the known catalogue — an arbitrary model id
  // would be billed against the operator's key.
  const requestedModel = opts.model && isAllowedModel(opts.model) ? opts.model.trim() : '';
  const models = requestedModel ? [requestedModel] : DEFAULT_MODELS[provider];
  const headers: Record<string, string> = {
    [spec.headerName]: `${spec.headerPrefix}${key}`,
    'Content-Type': 'application/json',
    ...(spec.extraHeaders ?? {}),
  };

  // MiniMax's flash model reasons before it answers, so the token budget has
  // to cover the thinking too — otherwise the reply comes back empty.
  const maxTokens = opts.maxTokens ?? 500;

  const endpoints: { url: string; key: string }[] = [{ url: spec.baseUrl, key }];
  if (spec.fallbackBaseUrls?.length) {
    const fallbackKey = (process.env[spec.fallbackEnvKey ?? ''] ?? '').trim();
    if (fallbackKey) {
      for (const url of spec.fallbackBaseUrls) endpoints.push({ url, key: fallbackKey });
    }
  }

  for (const endpoint of endpoints) {
    for (const model of models) {
      // JSON mode is best-effort: a backend that refuses response_format
      // gets the same question without it, and the reply is parsed from
      // prose instead.
      let jsonMode = opts.json === true;
      for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
        const body: Record<string, unknown> = {
          model,
          max_tokens: maxTokens,
          temperature: opts.temperature ?? 0.7,
          messages,
        };
        if (jsonMode) body.response_format = { type: 'json_object' };

        let res: Response;
        try {
          res = await fetch(endpoint.url, {
            method: 'POST',
            headers: { ...headers, [spec.headerName]: `${spec.headerPrefix}${endpoint.key}` },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
          });
        } catch {
          break; // network trouble — try the next model
        }

        // NIM's free tier is per-minute: a 429 means "wait a moment", not
        // "this model is gone". Retry the SAME call after a backoff.
        if (res.status === 429) {
          if (attempt < MAX_429_RETRIES) {
            await sleep(THROTTLE_BACKOFF_MS * (attempt + 1));
            continue;
          }
          break; // give up on this model, try the next one
        }
        if (!res.ok) {
          // Refused JSON mode — one retry without it, same model.
          if (jsonMode && (res.status === 400 || res.status === 422)) {
            jsonMode = false;
            continue;
          }
          break; // try the next model
        }

        try {
          const data = (await res.json()) as {
            choices?: { message?: { content?: string | null; reasoning_content?: string } }[];
          };
          const message = data.choices?.[0]?.message;
          const content = message?.content?.trim();
          if (content) return { result: { text: content, provider, model } };
          // A reasoning model that ran out of budget still has its thinking;
          // the tail of it is usually the answer.
          const reasoning = message?.reasoning_content?.trim();
          if (reasoning && reasoning.length > 40) {
            return { result: { text: reasoning.slice(-600).trim(), provider, model } };
          }
        } catch {
          // unparseable body — try the next model
        }
        break;
      }
    }
  }
  return { result: null };
}

/**
 * One chat turn. Tries the requested provider first, then the others; returns
 * null when no provider could answer.
 *
 * A key typed into the dashboard belongs to the provider that was asked for.
 * The fallback chain uses the server's own environment keys, so a request
 * key is never sent to a different backend.
 */
export async function chat(
  messages: ChatTurn[],
  opts: ChatOptions = {},
): Promise<ChatResult | null> {
  const explicit = opts.provider && opts.provider !== 'auto' ? opts.provider : null;
  for (const provider of providerOrder(opts.provider)) {
    const { result } = await callProvider(provider, messages, opts, explicit === provider);
    if (result) return result;
  }
  return null;
}

/**
 * Pulls a JSON object out of a model's reply. Models wrap JSON in prose or
 * markdown fences often enough that a plain JSON.parse is not enough.
 */
export function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const candidates: string[] = [];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidates.push(fenced[1].trim());
  candidates.push(trimmed);
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(trimmed.slice(first, last + 1));
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      /* try the next shape */
    }
  }
  return null;
}

/**
 * A chat turn that must come back as JSON. The parse is forgiving, and a
 * provider that cannot do JSON mode still gets a chance: the reply is
 * salvaged from prose if the structured request was refused.
 */
export async function chatJson(
  messages: ChatTurn[],
  opts: ChatOptions = {},
): Promise<{ data: unknown; provider: LlmProvider; model: string } | null> {
  const result = await chat(messages, { ...opts, json: true });
  if (!result) return null;
  const parsed = parseJsonObject(result.text);
  if (parsed !== null) return { data: parsed, provider: result.provider, model: result.model };
  return null;
}

/** The system persona for the parent's companion. */
export function companionSystemPrompt(parentName: string): string {
  return `You are Khayaal, a warm, unhurried companion for ${parentName}, an elderly person living independently. Keep answers short (2-4 sentences), kind and practical. Reminders and gentle encouragement are welcome. Never give medical advice — suggest asking the doctor. You cannot call anyone; suggest tapping "Call family" for that. If she asks what you can do, say briefly: check in, read the status, call family, set a reminder, or have a talk.`;
}
