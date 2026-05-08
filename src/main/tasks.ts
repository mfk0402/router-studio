import { app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AgentRunEvent, AgentTask, AgentTaskPhase, AgentTaskStatus } from '../shared/types.js';

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

function eventsFileFor(id: string): string {
  return path.join(tasksDir(), `${id}.events.json`);
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
    if (name.endsWith('.events.json')) continue;
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
    priority: task.priority ?? 'normal',
    phase: task.phase ?? phaseFromStatus(task.status),
    checkpointIds: task.checkpointIds ?? [],
    verification: task.verification ?? {
      status: 'not_run',
      updatedAt: now,
    },
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
  try {
    await fs.unlink(eventsFileFor(id));
  } catch {
    // ignore missing
  }
}

function phaseFromStatus(status: AgentTaskStatus): AgentTaskPhase {
  if (status === 'queued') return 'queued';
  if (status === 'completed') return 'done';
  if (status === 'running') return 'implement';
  return 'plan';
}

export async function enqueueTask(task: AgentTask): Promise<AgentTask> {
  const now = Date.now();
  const saved = await saveTask({
    ...task,
    status: 'queued',
    phase: 'queued',
    priority: task.priority ?? 'normal',
    queuedAt: task.queuedAt ?? now,
  });
  await appendTaskEvent({
    taskId: saved.id,
    type: 'queue',
    status: 'pending',
    title: 'Queued for agent cockpit',
    detail: saved.title,
  });
  return saved;
}

export async function listQueuedTasks(): Promise<AgentTask[]> {
  const all = await listTasks();
  const rank = (p: AgentTask['priority']) => (p === 'high' ? 0 : p === 'normal' ? 1 : 2);
  return all
    .filter((t) => t.status === 'queued' || t.status === 'running' || t.status === 'paused')
    .sort((a, b) => rank(a.priority) - rank(b.priority) || (a.queuedAt ?? a.createdAt) - (b.queuedAt ?? b.createdAt));
}

export async function startNextQueuedTask(): Promise<AgentTask | null> {
  const next = (await listQueuedTasks()).find((t) => t.status === 'queued');
  if (!next) return null;
  return updateTaskStatus(next.id, 'running', 'discover');
}

export async function updateTaskStatus(
  id: string,
  status: AgentTaskStatus,
  phase?: AgentTaskPhase,
): Promise<AgentTask | null> {
  const task = await getTask(id);
  if (!task) return null;
  const now = Date.now();
  const completedAt = status === 'completed' || status === 'failed' ? now : task.completedAt ?? null;
  const startedAt = status === 'running' ? task.startedAt ?? now : task.startedAt ?? null;
  const saved = await saveTask({
    ...task,
    status,
    phase: phase ?? phaseFromStatus(status),
    startedAt,
    completedAt,
  });
  await appendTaskEvent({
    taskId: saved.id,
    type: 'status',
    status:
      status === 'failed'
        ? 'error'
        : status === 'completed'
          ? 'success'
          : status === 'running'
            ? 'running'
            : 'info',
    title: `Task ${status}`,
    detail: phase ? `Phase: ${phase}` : undefined,
  });
  return saved;
}

export async function listTaskEvents(taskId: string): Promise<AgentRunEvent[]> {
  sanitizeId(taskId);
  try {
    const raw = await fs.readFile(eventsFileFor(taskId), 'utf8');
    const parsed = JSON.parse(raw) as AgentRunEvent[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && e.taskId === taskId && typeof e.id === 'string')
      .sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

export async function appendTaskEvent(
  event: Omit<AgentRunEvent, 'id' | 'createdAt'> & { id?: string; createdAt?: number },
): Promise<AgentRunEvent> {
  sanitizeId(event.taskId);
  await ensureDir();
  const next: AgentRunEvent = {
    ...event,
    id: event.id ?? randomUUID(),
    createdAt: event.createdAt ?? Date.now(),
  };
  const current = await listTaskEvents(event.taskId);
  current.push(next);
  const tail = current.slice(-800);
  await fs.writeFile(eventsFileFor(event.taskId), JSON.stringify(tail, null, 2), 'utf8');
  return next;
}

export async function clearTaskEvents(taskId: string): Promise<void> {
  sanitizeId(taskId);
  try {
    await fs.unlink(eventsFileFor(taskId));
  } catch {
    // ignore missing
  }
}

export async function addCheckpointToTask(taskId: string, checkpointId: string): Promise<AgentTask | null> {
  const task = await getTask(taskId);
  if (!task) return null;
  const ids = [checkpointId, ...(task.checkpointIds ?? []).filter((id) => id !== checkpointId)].slice(0, 50);
  return saveTask({ ...task, checkpointIds: ids });
}
