import type { LlmProvider } from '@khayaal/shared';

/**
 * One place that knows how to talk to a free LLM. Three providers, one
 * interface, no SDK — every one of them speaks the OpenAI chat-completions
 * shape, so the request body is written once.
 *
 *  - openrouter : OpenRouter's free models (llama-3.1-8b-instruct:free).
 *  - minimax    : MiniMax's flash model, hosted on OpenRouter.
 *  - nvidia     : NVIDIA NIM (integrate.api.nvidia.com) — free hosted models.
 *
 * Keys come from the environment (OPENROUTER_API_KEY / NVIDIA_API_KEY) or
 * from the request body. The app never holds a key; the backend proxies.
 */

export type { LlmProvider };

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  provider?: LlmProvider | 'auto';
  model?: string;
  apiKey?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
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
};

/**
 * NIM's free tier is throttled per minute, so a 429 is expected traffic, not
 * an error. Two short backoffs usually clear it; after that we move on to the
 * next model rather than making the caller wait.
 */
const MAX_429_RETRIES = 2;
const THROTTLE_BACKOFF_MS = 4_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const DEFAULT_MODELS: Record<LlmProvider, string[]> = {
  openrouter: ['meta-llama/llama-3.1-8b-instruct:free'],
  // MiniMax's flash model, hosted on NVIDIA NIM. NIM's free tier is
  // per-minute, so this id is frequently throttled — the retry below rides
  // that out rather than failing the whole request.
  minimax: ['minimaxai/minimax-m3.1-flash'],
  // NIM's catalogue rotates: some ids are rate-limited or undeployed at any
  // given moment. Try the reliable ones in order.
  nvidia: ['nvidia/nemotron-3.5-bolt-e4b', 'minimaxai/minimax-m3.1-flash'],
};

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

/**
 * The order providers are tried in. The requested one first, then the other
 * two — so a missing key degrades to "the other free model answers" instead
 * of a dead feature.
 */
export function providerOrder(requested: LlmProvider | 'auto' | undefined): LlmProvider[] {
  const all: LlmProvider[] = ['minimax', 'nvidia', 'openrouter'];
  if (!requested || requested === 'auto') return all;
  return [requested, ...all.filter((p) => p !== requested)];
}

async function callProvider(
  provider: LlmProvider,
  messages: ChatTurn[],
  opts: ChatOptions,
): Promise<ChatResult | null> {
  const spec = PROVIDERS[provider];
  const key = providerKey(provider, opts.apiKey);
  if (!key) return null;

  const requestedModel = opts.model && opts.model.trim();
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

  // The 429 counter is shared across the models of one provider: NIM throttles
  // the whole key, not one model id.
  let attempt = 0;

  for (const endpoint of endpoints) {
    for (const model of models) {
      try {
        const res = await fetch(endpoint.url, {
          method: 'POST',
          headers: { ...headers, [spec.headerName]: `${spec.headerPrefix}${endpoint.key}` },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            temperature: opts.temperature ?? 0.7,
            messages,
          }),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
        });

        // NIM's free tier is per-minute: a 429 means "wait a moment", not
        // "this model is gone". Backing off and retrying the same call is the
        // difference between the assistant working and it being dead.
        if (res.status === 429) {
          if (attempt < MAX_429_RETRIES) {
            await sleep(THROTTLE_BACKOFF_MS * (attempt + 1));
            attempt++;
            continue;
          }
          continue; // give up on this model, try the next one
        }
        if (!res.ok) continue;

        const data = (await res.json()) as {
          choices?: { message?: { content?: string | null; reasoning_content?: string } }[];
        };
        const message = data.choices?.[0]?.message;
        const content = message?.content?.trim();
        if (content) return { text: content, provider, model };
        // A reasoning model that ran out of budget still has its thinking; the
        // tail of it is usually the answer.
        const reasoning = message?.reasoning_content?.trim();
        if (reasoning && reasoning.length > 40) {
          return { text: reasoning.slice(-600).trim(), provider, model };
        }
      } catch {
        /* try the next model or endpoint */
      }
    }
  }
  return null;
}

/**
 * One chat turn. Tries the requested provider first, then the others; returns
 * null when no free provider could answer.
 */
export async function chat(
  messages: ChatTurn[],
  opts: ChatOptions = {},
): Promise<ChatResult | null> {
  for (const provider of providerOrder(opts.provider)) {
    const result = await callProvider(provider, messages, opts);
    if (result) return result;
  }
  return null;
}

/** The system persona for the parent's companion. */
export function companionSystemPrompt(parentName: string): string {
  return `You are Khayaal, a warm, unhurried companion for ${parentName}, an elderly person living independently. Keep answers short (2-4 sentences), kind and practical. Reminders and gentle encouragement are welcome. Never give medical advice — suggest asking the doctor. You cannot call anyone; suggest tapping "Call family" for that. If she asks what you can do, say briefly: check in, read the status, call family, set a reminder, or have a talk.`;
}
