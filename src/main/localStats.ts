import { app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  CompletionUsageSnapshot,
  LocalUsageStats,
  ModelLatencyAggregate,
} from '../shared/types.js';

const STATS_FILENAME = 'local-usage-stats.json';
const LATENCY_FILENAME = 'completion-model-latency.json';

function statsPath(): string {
  return path.join(app.getPath('userData'), STATS_FILENAME);
}

function latencyPath(): string {
  return path.join(app.getPath('userData'), LATENCY_FILENAME);
}

function freshStats(): LocalUsageStats {
  const now = Date.now();
  return {
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    completionsRecorded: 0,
    completionsSuccess: 0,
    completionsFailure: 0,
    toolRunsSuccess: 0,
    toolRunsFailure: 0,
    promptTokens: 0,
    completionTokens: 0,
    cachedPromptTokens: 0,
  };
}

function coerce(row: Partial<LocalUsageStats>): LocalUsageStats {
  const d = freshStats();
  return {
    ...d,
    ...row,
    schemaVersion: 1,
    createdAt: typeof row.createdAt === 'number' ? row.createdAt : d.createdAt,
  };
}

async function loadUsageStatsCore(): Promise<LocalUsageStats> {
  try {
    const raw = await fs.readFile(statsPath(), 'utf8');
    const row = JSON.parse(raw) as Partial<LocalUsageStats>;
    if (row.schemaVersion !== 1) return freshStats();
    const base = coerce(row);
    delete base.modelLatencyByModel;
    return base;
  } catch {
    return freshStats();
  }
}

async function loadLatencyRollup(): Promise<Record<string, ModelLatencyAggregate>> {
  try {
    const raw = await fs.readFile(latencyPath(), 'utf8');
    const o = JSON.parse(raw) as Record<string, ModelLatencyAggregate>;
    if (!o || typeof o !== 'object') return {};
    return o;
  } catch {
    return {};
  }
}

async function saveLatencyRollup(r: Record<string, ModelLatencyAggregate>): Promise<void> {
  const p = latencyPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(r, null, 2), 'utf8');
}

async function mergeModelLatency(modelId: string, ms: number, ok: boolean): Promise<void> {
  const trimmed = modelId.trim();
  if (!trimmed || !Number.isFinite(ms) || ms < 0 || ms > 900_000) return;
  const cur = await loadLatencyRollup();
  const prev: ModelLatencyAggregate = cur[trimmed] ?? { samples: 0, avgMs: 0, failures: 0 };
  const n = prev.samples + 1;
  const avgMs = (prev.avgMs * prev.samples + Math.min(ms, 120_000)) / Math.max(n, 1);
  cur[trimmed] = {
    samples: Math.min(n, 10_000),
    avgMs: Math.round(avgMs),
    failures: prev.failures + (ok ? 0 : 1),
  };
  await saveLatencyRollup(cur);
}

async function writeStats(s: LocalUsageStats): Promise<void> {
  const { modelLatencyByModel: _omit, ...rest } = s;
  const p = statsPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(rest, null, 2), 'utf8');
}

export async function getStats(): Promise<LocalUsageStats> {
  const base = await loadUsageStatsCore();
  const lat = await loadLatencyRollup();
  const keys = Object.keys(lat);
  if (keys.length === 0) return base;
  return { ...base, modelLatencyByModel: lat };
}

export async function recordCompletion(payload: {
  ok: boolean;
  usage?: CompletionUsageSnapshot;
  model?: string;
  latencyMs?: number;
}): Promise<void> {
  const s = await loadUsageStatsCore();
  s.updatedAt = Date.now();
  s.completionsRecorded += 1;
  if (payload.ok) {
    s.completionsSuccess += 1;
    const u = payload.usage;
    if (u) {
      if (typeof u.prompt_tokens === 'number') s.promptTokens += Math.max(0, u.prompt_tokens);
      if (typeof u.completion_tokens === 'number')
        s.completionTokens += Math.max(0, u.completion_tokens);
      if (typeof u.cached_tokens === 'number')
        s.cachedPromptTokens += Math.max(0, u.cached_tokens);
    }
  } else {
    s.completionsFailure += 1;
  }
  await writeStats(s);
  if (
    typeof payload.model === 'string' &&
    payload.model.trim().length > 0 &&
    typeof payload.latencyMs === 'number' &&
    Number.isFinite(payload.latencyMs) &&
    payload.latencyMs >= 0
  ) {
    void mergeModelLatency(payload.model.trim(), payload.latencyMs, payload.ok);
  }
}

export async function recordToolRun(ok: boolean): Promise<void> {
  const s = await loadUsageStatsCore();
  s.updatedAt = Date.now();
  if (ok) s.toolRunsSuccess += 1;
  else s.toolRunsFailure += 1;
  await writeStats(s);
}

export async function resetStats(): Promise<LocalUsageStats> {
  const next = freshStats();
  await writeStats(next);
  await fs.unlink(latencyPath()).catch(() => {});
  return next;
}
