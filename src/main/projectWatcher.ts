/**
 * Live filesystem watch on the project root — refreshes the sidebar tree and
 * drops stale lexical code-index results when files change on disk (agent,
 * git, external editors).
 */

import chokidar from 'chokidar';
import path from 'node:path';
import { getAppWindow } from './appWindow.js';
import * as codeIndex from './codeIndex.js';

let watcher: ReturnType<typeof chokidar.watch> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const DEBOUNCE_MS = 380;

function flushFsChangedNotification(): void {
  debounceTimer = null;
  codeIndex.invalidateCodeIndex();
  const win = getAppWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send('workspace:projectFsChanged');
  }
}

function scheduleNotification(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(flushFsChangedNotification, DEBOUNCE_MS);
}

/**
 * Stop watching (switch project, shutdown).
 */
export async function stopProjectWatcher(): Promise<void> {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (!watcher) return;
  const w = watcher;
  watcher = null;
  try {
    await w.close();
  } catch {
    /* ignore */
  }
}

/**
 * Watch `root` for adds/changes/deletes. Ignores bulky build/vendor dirs
 * aligned with listFiles SKIP_DIRS.
 */
export function startProjectWatcher(root: string): void {
  void stopProjectWatcher();

  const absRoot = path.resolve(root);
  try {
    watcher = chokidar.watch(absRoot, {
      ignored: [
        /(^|[\\/])\./,
        '**/node_modules/**',
        '**/.git/**',
        '**/.next/**',
        '**/dist/**',
        '**/out/**',
        '**/build/**',
        '**/.turbo/**',
        '**/.cache/**',
        '**/.vite/**',
        '**/release/**',
        '**/coverage/**',
        '**/__pycache__/**',
        '**/.venv/**',
        '**/venv/**',
      ],
      ignoreInitial: true,
      persistent: true,
      /** Burst edits from agents settle before we notify. */
      awaitWriteFinish: { stabilityThreshold: 220, pollInterval: 120 },
    });

    watcher.on('all', () => scheduleNotification());
    watcher.on('error', (err: unknown) => {
      console.warn('[projectWatcher]', err);
    });
  } catch (e) {
    console.warn('[projectWatcher] failed to start:', e);
    watcher = null;
  }
}
