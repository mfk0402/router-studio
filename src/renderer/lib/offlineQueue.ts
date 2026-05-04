import type { ChatMessage, NormalizedModel } from '../../shared/types';

const QUEUE_KEY = 'routerstudio.offline.completion.queue.v1';
const MAX_ITEMS = 25;

export interface OfflineQueuedCompletion {
  id: string;
  createdAt: number;
  model: string;
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
  stream: boolean;
  freeMode?: {
    enabled: boolean;
    strategy: 'router' | 'cycle';
    freeModels: NormalizedModel[];
  };
  fallbackModel?: string;
  completionFallbackModels?: string[];
}

function loadRaw(): OfflineQueuedCompletion[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflineQueuedCompletion[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRaw(items: OfflineQueuedCompletion[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-MAX_ITEMS)));
  } catch {
    // ignore quota errors
  }
}

export function getOfflineQueue(): OfflineQueuedCompletion[] {
  return loadRaw();
}

export function offlineQueueLength(): number {
  return loadRaw().length;
}

export function clearOfflineQueue(): void {
  try {
    localStorage.removeItem(QUEUE_KEY);
  } catch {
    // ignore
  }
}

export function removeOfflineQueueItem(id: string): void {
  saveRaw(loadRaw().filter((x) => x.id !== id));
}

export function enqueueOfflineCompletion(item: Omit<OfflineQueuedCompletion, 'id' | 'createdAt'>): void {
  const row: OfflineQueuedCompletion = {
    ...item,
    id: `off-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: Date.now(),
  };
  const next = [...loadRaw(), row];
  saveRaw(next);
}

export function isLikelyOfflineError(message: string): boolean {
  return /network|fetch|ECONNREFUSED|ENOTFOUND|ECONNRESET|ETIMEDOUT|timeout|offline|Failed to fetch|getaddrinfo|socket hang up|503|502|504/i.test(
    message,
  );
}
