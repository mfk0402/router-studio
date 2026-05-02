import type {
  ChatCompletionRequest,
  ChatMessage,
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

const MODEL_CACHE_KEY = 'routerstudio.models.cache.v2';
const MODEL_CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6h

/** OpenRouter's "free router" pseudo-model. */
export const FREE_ROUTER_MODEL = 'openrouter/free';

export interface CachedModels {
  fetchedAt: number;
  models: NormalizedModel[];
}

export async function loadCachedModels(): Promise<NormalizedModel[] | null> {
  try {
    const raw = localStorage.getItem(MODEL_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedModels;
    if (!parsed.fetchedAt || !Array.isArray(parsed.models)) return null;
    if (Date.now() - parsed.fetchedAt > MODEL_CACHE_TTL_MS) return null;
    return parsed.models;
  } catch {
    return null;
  }
}

export function saveCachedModels(models: NormalizedModel[]): void {
  try {
    const cache: CachedModels = { fetchedAt: Date.now(), models };
    localStorage.setItem(MODEL_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

export function clearCachedModels(): void {
  try {
    localStorage.removeItem(MODEL_CACHE_KEY);
  } catch {
    // ignore
  }
}

export async function fetchModels(apiKey: string): Promise<NormalizedModel[]> {
  const raw = await window.api.openrouter.listModels(apiKey);
  const models = raw.map(normalizeModel);
  models.sort((a, b) => a.name.localeCompare(b.name));
  saveCachedModels(models);
  return models;
}

export interface CycleResult {
  modelUsed: string;
  attempts: Array<{ model: string; error?: string }>;
  content: string;
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
  onStreamChunk?: (chunk: StreamChunk) => void;
  onLog?: (msg: string) => void;
  signal?: { requestId?: string };
  /** When false, failed sends are not added to the offline retry queue (default true). */
  allowOfflineQueue?: boolean;
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
        const content = await runStream(opts, model);
        attempts.push({ model });
        return { modelUsed: model, attempts, content };
      } else {
        const req: ChatCompletionRequest = {
          apiKey: opts.apiKey,
          model,
          messages: opts.messages,
          temperature: opts.temperature,
          maxTokens: opts.maxTokens,
          stream: false,
        };
        const res = await window.api.openrouter.chat(req);
        attempts.push({ model });
        return { modelUsed: res.model || model, attempts, content: res.content };
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
    });
  }
  throw new Error(`All attempts failed. Last error: ${lastErr}`);
}

function buildCandidateChain(opts: SendOptions): string[] {
  const chain: string[] = [];
  const fm = opts.freeMode;
  if (fm?.enabled) {
    if (fm.strategy === 'router') {
      chain.push(FREE_ROUTER_MODEL);
      if (opts.fallbackModel && opts.fallbackModel !== FREE_ROUTER_MODEL) {
        chain.push(opts.fallbackModel);
      }
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
      if (opts.fallbackModel && !chain.includes(opts.fallbackModel)) {
        chain.push(opts.fallbackModel);
      }
    }
  } else {
    chain.push(opts.model);
    if (opts.fallbackModel && opts.fallbackModel !== opts.model) {
      chain.push(opts.fallbackModel);
    }
  }
  return chain.filter(Boolean);
}

async function runStream(opts: SendOptions, model: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let content = '';
    let failed: string | null = null;
    let unsubscribe: (() => void) | null = null;
    let currentRequestId: string | null = null;

    unsubscribe = window.api.events.onChatStream((chunk) => {
      if (chunk.requestId && currentRequestId && chunk.requestId !== currentRequestId) return;
      if (chunk.type === 'delta' && chunk.content) {
        content += chunk.content;
        opts.onStreamChunk?.(chunk);
      } else if (chunk.type === 'error') {
        failed = chunk.error ?? 'stream error';
        opts.onStreamChunk?.(chunk);
      } else if (chunk.type === 'done') {
        opts.onStreamChunk?.(chunk);
        unsubscribe?.();
        if (failed) reject(new Error(failed));
        else resolve(content);
      }
    });

    const req: ChatCompletionRequest = {
      apiKey: opts.apiKey,
      model,
      messages: opts.messages,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      stream: true,
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
