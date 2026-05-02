import { app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { CompletionUsageSnapshot, LocalUsageStats } from '../shared/types.js';

const STATS_FILENAME = 'local-usage-stats.json';

function statsPath(): string {
  return path.join(app.getPath('userData'), STATS_FILENAME);
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

export async function getStats(): Promise<LocalUsageStats> {
  try {
    const raw = await fs.readFile(statsPath(), 'utf8');
    const row = JSON.parse(raw) as Partial<LocalUsageStats>;
    if (row.schemaVersion !== 1) return freshStats();
    return coerce(row);
  } catch {
    return freshStats();
  }
}

async function writeStats(s: LocalUsageStats): Promise<void> {
  const p = statsPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(s, null, 2), 'utf8');
}

export async function recordCompletion(payload: {
  ok: boolean;
  usage?: CompletionUsageSnapshot;
}): Promise<void> {
  const s = await getStats();
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
}

export async function recordToolRun(ok: boolean): Promise<void> {
  const s = await getStats();
  s.updatedAt = Date.now();
  if (ok) s.toolRunsSuccess += 1;
  else s.toolRunsFailure += 1;
  await writeStats(s);
}

export async function resetStats(): Promise<LocalUsageStats> {
  const next = freshStats();
  await writeStats(next);
  return next;
}
