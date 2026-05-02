import type { BrowserWindow } from 'electron';
import * as store from './secureStore.js';

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Every minute, check interval-based scheduled tasks and notify the renderer.
 */
export function startScheduledTasksLoop(getWindow: () => BrowserWindow | null): void {
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    void tick(getWindow);
  }, 60_000);
  void tick(getWindow);
}

async function tick(getWindow: () => BrowserWindow | null): Promise<void> {
  const s = await store.getSettings();
  const tasks = s.scheduledTasks ?? [];
  if (tasks.length === 0) return;
  const now = Date.now();
  const next = tasks.map((t) => ({ ...t }));
  let changed = false;
  const win = getWindow();
  for (let i = 0; i < next.length; i++) {
    const t = next[i]!;
    if (!t.enabled) continue;
    const mins = Math.max(1, Math.floor(t.intervalMinutes || 1));
    const ms = mins * 60_000;
    const last = t.lastRunAt ?? 0;
    if (now - last < ms) continue;
    next[i] = { ...t, lastRunAt: now };
    changed = true;
    if (win && !win.isDestroyed()) {
      win.webContents.send('scheduled:due', {
        id: t.id,
        title: t.title,
        prompt: t.prompt,
        at: now,
      });
    }
  }
  if (changed) {
    await store.setSettings({ scheduledTasks: next });
  }
}
