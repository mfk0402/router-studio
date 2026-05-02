import { app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AgentTask } from '../shared/types.js';

/**
 * Persistent agent tasks. Each task is a single JSON file under
 * userData/tasks/ so that individual corruption can't break the index, and
 * so that users can easily inspect / back them up.
 */

const TASKS_DIR = 'tasks';

function tasksDir(): string {
  return path.join(app.getPath('userData'), TASKS_DIR);
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(tasksDir(), { recursive: true });
}

function fileFor(id: string): string {
  return path.join(tasksDir(), `${id}.json`);
}

function sanitizeId(id: string): string {
  // Only allow [a-zA-Z0-9_-] to stop path traversal.
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error('Invalid task id.');
  }
  return id;
}

export async function listTasks(): Promise<AgentTask[]> {
  await ensureDir();
  const dir = tasksDir();
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out: AgentTask[] = [];
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    try {
      const raw = await fs.readFile(path.join(dir, name), 'utf8');
      const parsed = JSON.parse(raw) as AgentTask;
      if (parsed && typeof parsed.id === 'string') {
        out.push(parsed);
      }
    } catch {
      // skip corrupt files
    }
  }
  out.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  return out;
}

export async function getTask(id: string): Promise<AgentTask | null> {
  sanitizeId(id);
  try {
    const raw = await fs.readFile(fileFor(id), 'utf8');
    return JSON.parse(raw) as AgentTask;
  } catch {
    return null;
  }
}

export async function saveTask(task: AgentTask): Promise<AgentTask> {
  sanitizeId(task.id);
  await ensureDir();
  const now = Date.now();
  const payload: AgentTask = {
    ...task,
    createdAt: task.createdAt || now,
    updatedAt: now,
  };
  await fs.writeFile(fileFor(task.id), JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

export async function deleteTask(id: string): Promise<void> {
  sanitizeId(id);
  try {
    await fs.unlink(fileFor(id));
  } catch {
    // ignore missing
  }
}
