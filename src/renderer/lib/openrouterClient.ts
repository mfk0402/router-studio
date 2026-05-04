import type {
  ChatCompletionRequest,
  ChatMessage,
  CompletionUsageSnapshot,
  NormalizedModel,
  StreamChunk,
} from '../../shared/types';
import { discoverFreeModels, normalizeModel } from './modelFilters';
import {
  enqueueOfflineCompletion,
  getOfflineQueue,
  isLikelyOfflineError,
  removeOfflineQueueItem,
  clearOfflineQueue,
  offlineQueueLength,
  type OfflineQueuedCompletion,
} from './offlineQueue';

export {
  clearOfflineQueue,
  getOfflineQueue,
  offlineQueueLength,
  removeOfflineQueueItem,
  type OfflineQueuedCompletion,
};

const MODEL_CACHE_KEY_V7 = 'routerstudio.models.cache.v7';
const MODEL_CACHE_KEY_LEGACY = 'routerstudio.models.cache.v3';
const MODEL_CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6h

/** OpenRouter's "free router" pseudo-model. */
export const FREE_ROUTER_MODEL = 'openrouter/free';

export type ModelCatalogSource = 'openrouter' | 'local';

interface CachedModelsPayload {
  fetchedAt: number;
  source: ModelCatalogSource;
  /** Normalized local API root (no trailing slash). */
  localBase?: string;
  models: NormalizedModel[];
}

interface CachedModelsLegacy {
  fetchedAt: number;
  models: NormalizedModel[];
}

function normalizeCatalogBase(openAiBaseUrl: string | undefined): string | undefined {
  const t = openAiBaseUrl?.trim();
  if (!t) return undefined;
  return t.replace(/\/+$/, '');
}

function loadLegacyOpenRouterCache(): NormalizedModel[] | null {
  try {
    const raw = localStorage.getItem(MODEL_CACHE_KEY_LEGACY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedModelsLegacy;
    if (!parsed.fetchedAt || !Array.isArray(parsed.models)) return null;
    if (Date.now() - parsed.fetchedAt > MODEL_CACHE_TTL_MS) return null;
    return parsed.models;
  } catch {
    return null;
  }
}

export async function loadCachedModels(
  source: ModelCatalogSource = 'openrouter',
  localBase?: string,
): Promise<NormalizedModel[] | null> {
  const normLocal = normalizeCatalogBase(localBase);
  try {
    const raw = localStorage.getItem(MODEL_CACHE_KEY_V7);
    if (raw) {
      const parsed = JSON.parse(raw) as CachedModelsPayload;
      if (!parsed.fetchedAt || !Array.isArray(parsed.models)) {
        return source === 'openrouter' ? loadLegacyOpenRouterCache() : null;
      }
      if (Date.now() - parsed.fetchedAt > MODEL_CACHE_TTL_MS) return null;
      if (parsed.source !== source) return null;
      if (source === 'local' && normalizeCatalogBase(parsed.localBase) !== normLocal) return null;
      return parsed.models;
    }
    return source === 'openrouter' ? loadLegacyOpenRouterCache() : null;
  } catch {
    return null;
  }
}

export function saveCachedModels(
  models: NormalizedModel[],
  source: ModelCatalogSource = 'openrouter',
  localBase?: string,
): void {
  try {
    const payload: CachedModelsPayload = {
      fetchedAt: Date.now(),
      source,
      localBase: source === 'local' ? normalizeCatalogBase(localBase) : undefined,
      models,
    };
    localStorage.setItem(MODEL_CACHE_KEY_V7, JSON.stringify(payload));
    localStorage.removeItem(MODEL_CACHE_KEY_LEGACY);
  } catch {
    // ignore
  }
}

export function clearCachedModels(): void {
  try {
    localStorage.removeItem(MODEL_CACHE_KEY_V7);
    localStorage.removeItem('routerstudio.models.cache.v6');
    localStorage.removeItem('routerstudio.models.cache.v5');
    localStorage.removeItem(MODEL_CACHE_KEY_LEGACY);
  } catch {
    // ignore
  }
}

/**
 * Load model catalog from OpenRouter or a local OpenAI-compatible `GET /v1/models` endpoint.
 * When `openAiBaseUrl` is set, it must be the API root (for example `http://127.0.0.1:11434/v1`).
 * OpenRouter catalog does not require an API key (public index); the main process also merges
 * async video-generation models from `GET /v1/videos/models`.
 */
export async function fetchModels(apiKey: string, openAiBaseUrl?: string): Promise<NormalizedModel[]> {
  const base = normalizeCatalogBase(openAiBaseUrl);
  const raw = base
    ? await window.api.openrouter.listOpenAiModels(base, apiKey)
    : await window.api.openrouter.listModels(apiKey);
  const models = raw.map(normalizeModel);
  models.sort((a, b) => a.name.localeCompare(b.name));
  saveCachedModels(models, base ? 'local' : 'openrouter', base);
  return models;
}

export interface CycleResult {
  modelUsed: string;
  attempts: Array<{ model: string; error?: string }>;
  content: string;
  usage?: CompletionUsageSnapshot;
  /** OpenRouter image generation (data URLs) */
  generatedImageUrls?: string[];
}

export interface SendOptions {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
  stream: boolean;
  /** Free mode config (may trigger fallback + cycling). */
  freeMode?: {
    enabled: boolean;
    strategy: 'router' | 'cycle';
    freeModels: NormalizedModel[];
  };
  fallbackModel?: string;
  /** Tried after the primary fails, in order, after legacy `fallbackModel` (same semantics as Settings → Models). */
  completionFallbackModels?: string[];
  onStreamChunk?: (chunk: StreamChunk) => void;
  onLog?: (msg: string) => void;
  signal?: { requestId?: string };
  /** When false, failed sends are not added to the offline retry queue (default true). */
  allowOfflineQueue?: boolean;
  /** Local OpenAI-compatible API root (`…/v1`); disables OpenRouter-only offline queue + free-router chain. */
  openAiBaseUrl?: string;
  /** OpenRouter multimodal (image generation, etc.) */
  modalities?: string[];
  image_config?: Record<string, unknown>;
}

/**
 * High-level send that knows about Free Mode strategies. Returns final text and
 * the model that was actually used. Streams chunks through onStreamChunk when
 * streaming is enabled.
 */
export async function sendChatCompletion(opts: SendOptions): Promise<CycleResult> {
  const attempts: Array<{ model: string; error?: string }> = [];
  const candidates = buildCandidateChain(opts);

  for (const model of candidates) {
    opts.onLog?.(`→ Sending to model: ${model}`);
    try {
      if (opts.stream) {
        const { content, usage, generatedImageUrls } = await runStream(opts, model);
        attempts.push({ model });
        return { modelUsed: model, attempts, content, usage, generatedImageUrls };
      } else {
        const req: ChatCompletionRequest = {
          apiKey: opts.apiKey,
          model,
          messages: opts.messages,
          temperature: opts.temperature,
          maxTokens: opts.maxTokens,
          stream: false,
          openAiBaseUrl: opts.openAiBaseUrl,
          modalities: opts.modalities,
          image_config: opts.image_config,
        };
        const res = await window.api.openrouter.chat(req);
        attempts.push({ model });
        return {
          modelUsed: res.model || model,
          attempts,
          content: res.content,
          usage: res.usage,
          generatedImageUrls: res.generatedImageUrls,
        };
      }
    } catch (e) {
      const msg = (e as Error).message;
      attempts.push({ model, error: msg });
      opts.onLog?.(`✗ ${model} failed: ${msg}`);
      // try next candidate
    }
  }

  const lastErr = attempts[attempts.length - 1]?.error ?? 'Unknown error';
  if (
    (opts.allowOfflineQueue ?? true) &&
    !opts.openAiBaseUrl?.trim() &&
    isLikelyOfflineError(lastErr) &&
    opts.messages.length > 0
  ) {
    enqueueOfflineCompletion({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      stream: opts.stream,
      freeMode: opts.freeMode,
      fallbackModel: opts.fallbackModel,
      completionFallbackModels: opts.completionFallbackModels,
    });
  }
  throw new Error(`All attempts failed. Last error: ${lastErr}`);
}

/** Append dropdown fallback then extra fallback ids; skip duplicates vs existing chain entries. */
export function appendConfiguredFallbackModels(
  chain: string[],
  opts: Pick<SendOptions, 'fallbackModel' | 'completionFallbackModels'>,
): void {
  const seen = new Set(chain.filter(Boolean));
  const orderedExtras = [
    ...(opts.fallbackModel?.trim() ? [opts.fallbackModel.trim()] : []),
    ...(opts.completionFallbackModels ?? []).map((id) => id.trim()),
  ].filter(Boolean);
  for (const id of orderedExtras) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    chain.push(id);
  }
}

function buildCandidateChain(opts: SendOptions): string[] {
  const chain: string[] = [];
  if (opts.openAiBaseUrl?.trim()) {
    chain.push(opts.model);
    appendConfiguredFallbackModels(chain, opts);
    return chain.filter(Boolean);
  }
  const fm = opts.freeMode;
  if (fm?.enabled) {
    if (fm.strategy === 'router') {
      chain.push(FREE_ROUTER_MODEL);
      appendConfiguredFallbackModels(chain, opts);
    } else {
      const free = discoverFreeModels(fm.freeModels);
      const maxTries = 3;
      const picked: string[] = [];
      const start = Math.floor(Math.random() * Math.max(1, free.length));
      for (let i = 0; i < free.length && picked.length < maxTries; i++) {
        const m = free[(start + i) % free.length];
        if (!picked.includes(m.id)) picked.push(m.id);
      }
      chain.push(...picked);
      if (picked.length === 0) chain.push(FREE_ROUTER_MODEL);
      appendConfiguredFallbackModels(chain, opts);
    }
  } else {
    chain.push(opts.model);
    appendConfiguredFallbackModels(chain, opts);
  }
  return chain.filter(Boolean);
}

/** Models to try per streaming hop (tool loop): primary first, then user-configured fallbacks. */
export function streamingCompletionAttempts(
  primaryModel: string,
  fallbackSingle?: string,
  fallbackExtras?: string[],
): string[] {
  const chain = [primaryModel];
  appendConfiguredFallbackModels(chain, {
    fallbackModel: fallbackSingle,
    completionFallbackModels: fallbackExtras,
  });
  return chain;
}

async function runStream(
  opts: SendOptions,
  model: string,
): Promise<{ content: string; usage?: CompletionUsageSnapshot; generatedImageUrls?: string[] }> {
  return new Promise<{ content: string; usage?: CompletionUsageSnapshot; generatedImageUrls?: string[] }>((resolve, reject) => {
    let content = '';
    const imageAccum: string[] = [];
    let failed: string | null = null;
    let unsubscribe: (() => void) | null = null;
    let currentRequestId: string | null = null;
    let lastUsage: CompletionUsageSnapshot | undefined;

    unsubscribe = window.api.events.onChatStream((chunk) => {
      if (chunk.requestId && currentRequestId && chunk.requestId !== currentRequestId) return;
      if (chunk.type === 'delta' && chunk.content) {
        content += chunk.content;
        opts.onStreamChunk?.(chunk);
      } else if (chunk.type === 'delta' && chunk.generatedImageUrls?.length) {
        for (const u of chunk.generatedImageUrls) {
          if (u && !imageAccum.includes(u)) imageAccum.push(u);
        }
        opts.onStreamChunk?.(chunk);
      } else if (chunk.type === 'error') {
        failed = chunk.error ?? 'stream error';
        opts.onStreamChunk?.(chunk);
      } else if (chunk.type === 'done') {
        if (chunk.usage) lastUsage = chunk.usage;
        opts.onStreamChunk?.(chunk);
        unsubscribe?.();
        if (failed) reject(new Error(failed));
        else
          resolve({
            content,
            usage: lastUsage,
            generatedImageUrls: imageAccum.length > 0 ? imageAccum : undefined,
          });
      }
    });

    const req: ChatCompletionRequest = {
      apiKey: opts.apiKey,
      model,
      messages: opts.messages,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      stream: true,
      openAiBaseUrl: opts.openAiBaseUrl,
      modalities: opts.modalities,
      image_config: opts.image_config,
    };
    window.api.openrouter
      .chatStreamStart(req)
      .then((id) => {
        currentRequestId = id;
        if (opts.signal) opts.signal.requestId = id;
      })
      .catch((e) => {
        unsubscribe?.();
        reject(e instanceof Error ? e : new Error(String(e)));
      });
  });
}

/**
 * Retry queued completions saved after offline/network failures (uses current API key).
 */
export async function retryOfflineQueue(
  apiKey: string,
  handlers?: Pick<SendOptions, 'onStreamChunk' | 'onLog'>,
): Promise<{ attempted: number; succeeded: number; failures: string[] }> {
  const snapshot = [...getOfflineQueue()];
  let succeeded = 0;
  const failures: string[] = [];

  for (const item of snapshot) {
    try {
      await sendChatCompletion({
        apiKey,
        model: item.model,
        messages: item.messages,
        temperature: item.temperature,
        maxTokens: item.maxTokens,
        stream: item.stream,
        freeMode: item.freeMode,
        fallbackModel: item.fallbackModel,
        completionFallbackModels: item.completionFallbackModels,
        allowOfflineQueue: false,
        onStreamChunk: handlers?.onStreamChunk,
        onLog: handlers?.onLog,
      });
      removeOfflineQueueItem(item.id);
      succeeded++;
    } catch (e) {
      failures.push((e as Error).message);
    }
  }

  return { attempted: snapshot.length, succeeded, failures };
}
