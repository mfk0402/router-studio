/**
 * Session Management — Save and restore editor state across restarts.
 *
 * Stores:
 * - Open tabs (paths, content if dirty, cursor positions)
 * - Active tab
 * - Project root + recent project folder paths (MRU)
 * - Sidebar/panel visibility
 * - Chat history (last N messages)
 */

import { app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const SESSION_FILE = 'session.json';
const AUTOSAVE_INTERVAL = 30000; // 30 seconds

export interface TabState {
  relativePath: string;
  name: string;
  language: string;
  content: string;
  original: string;
  dirty: boolean;
  cursorLine?: number;
  cursorColumn?: number;
  scrollTop?: number;
}

export interface SessionState {
  version: number;
  projectRoot: string | null;
  /** Absolute paths, most recently used first (max ~15 in renderer). */
  recentProjectRoots: string[];
  tabs: TabState[];
  activeTabPath: string | null;
  sidebarCollapsed: boolean;
  bottomCollapsed: boolean;
  bottomTab: 'output' | 'terminal' | 'problems' | 'tests';
  chat: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  savedAt: number;
}

const DEFAULT_SESSION: SessionState = {
  version: 1,
  projectRoot: null,
  recentProjectRoots: [],
  tabs: [],
  activeTabPath: null,
  sidebarCollapsed: false,
  bottomCollapsed: false,
  bottomTab: 'output',
  chat: [],
  savedAt: 0,
};

function getSessionPath(): string {
  return path.join(app.getPath('userData'), SESSION_FILE);
}

/**
 * Load saved session state.
 */
export async function loadSession(): Promise<SessionState> {
  const sessionPath = getSessionPath();
  try {
    const content = await fs.readFile(sessionPath, 'utf8');
    const data = JSON.parse(content) as SessionState;

    // Validate version
    if (data.version !== 1) {
      console.log('[session] Unknown session version, using defaults');
      return DEFAULT_SESSION;
    }

    const recentProjectRoots = Array.isArray(data.recentProjectRoots)
      ? data.recentProjectRoots.filter((x): x is string => typeof x === 'string')
      : [];

    return { ...data, recentProjectRoots };
  } catch (e) {
    // No session file or invalid JSON
    return DEFAULT_SESSION;
  }
}

/**
 * Save session state.
 */
export async function saveSession(state: Partial<SessionState>): Promise<void> {
  const sessionPath = getSessionPath();
  try {
    // Load existing and merge
    const existing = await loadSession();
    const merged: SessionState = {
      ...existing,
      ...state,
      version: 1,
      savedAt: Date.now(),
    };

    // Limit chat history to last 50 messages
    if (merged.chat.length > 50) {
      merged.chat = merged.chat.slice(-50);
    }

    await fs.writeFile(sessionPath, JSON.stringify(merged, null, 2), 'utf8');
  } catch (e) {
    console.error('[session] Failed to save session:', e);
  }
}

/**
 * Clear saved session.
 */
export async function clearSession(): Promise<void> {
  const sessionPath = getSessionPath();
  try {
    await fs.unlink(sessionPath);
  } catch {
    // File doesn't exist, that's fine
  }
}

// ==================== AUTOSAVE ====================

const AUTOSAVE_DIR = 'autosave';

interface AutosaveEntry {
  relativePath: string;
  content: string;
  savedAt: number;
}

function getAutosaveDir(): string {
  return path.join(app.getPath('userData'), AUTOSAVE_DIR);
}

function getAutosavePath(relativePath: string): string {
  // Convert path to safe filename
  const safeName = relativePath.replace(/[/\\:*?"<>|]/g, '_');
  return path.join(getAutosaveDir(), `${safeName}.autosave`);
}

/**
 * Save an autosave for a file.
 */
export async function saveAutosave(relativePath: string, content: string): Promise<void> {
  try {
    const dir = getAutosaveDir();
    await fs.mkdir(dir, { recursive: true });

    const entry: AutosaveEntry = {
      relativePath,
      content,
      savedAt: Date.now(),
    };

    const savePath = getAutosavePath(relativePath);
    await fs.writeFile(savePath, JSON.stringify(entry), 'utf8');
  } catch (e) {
    console.error('[autosave] Failed to save:', relativePath, e);
  }
}

/**
 * Load autosave for a file if it exists.
 */
export async function loadAutosave(relativePath: string): Promise<AutosaveEntry | null> {
  try {
    const savePath = getAutosavePath(relativePath);
    const content = await fs.readFile(savePath, 'utf8');
    return JSON.parse(content) as AutosaveEntry;
  } catch {
    return null;
  }
}

/**
 * Delete autosave for a file (call when file is saved).
 */
export async function deleteAutosave(relativePath: string): Promise<void> {
  try {
    const savePath = getAutosavePath(relativePath);
    await fs.unlink(savePath);
  } catch {
    // File doesn't exist, that's fine
  }
}

/**
 * List all autosaved files.
 */
export async function listAutosaves(): Promise<AutosaveEntry[]> {
  try {
    const dir = getAutosaveDir();
    const files = await fs.readdir(dir);
    const entries: AutosaveEntry[] = [];

    for (const file of files) {
      if (!file.endsWith('.autosave')) continue;
      try {
        const content = await fs.readFile(path.join(dir, file), 'utf8');
        entries.push(JSON.parse(content) as AutosaveEntry);
      } catch {
        // Skip invalid files
      }
    }

    return entries;
  } catch {
    return [];
  }
}

/**
 * Clear all autosaves.
 */
export async function clearAutosaves(): Promise<void> {
  try {
    const dir = getAutosaveDir();
    const files = await fs.readdir(dir);
    for (const file of files) {
      await fs.unlink(path.join(dir, file)).catch(() => {});
    }
  } catch {
    // Directory doesn't exist, that's fine
  }
}

// ==================== CRASH RECOVERY ====================

const CRASH_FLAG = 'crash_flag';

/**
 * Set crash flag (call on app start, clear on clean exit).
 */
export async function setCrashFlag(): Promise<void> {
  const flagPath = path.join(app.getPath('userData'), CRASH_FLAG);
  await fs.writeFile(flagPath, Date.now().toString(), 'utf8');
}

/**
 * Check if app crashed last time.
 */
export async function checkCrashFlag(): Promise<boolean> {
  const flagPath = path.join(app.getPath('userData'), CRASH_FLAG);
  try {
    await fs.access(flagPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear crash flag (call on clean exit).
 */
export async function clearCrashFlag(): Promise<void> {
  const flagPath = path.join(app.getPath('userData'), CRASH_FLAG);
  try {
    await fs.unlink(flagPath);
  } catch {
    // File doesn't exist, that's fine
  }
}
