import type { BrowserWindow } from 'electron';

/**
 * Lazily resolves the primary app BrowserWindow so editor tools and IPC helpers
 * always see the current window after it is created or recreated (e.g. macOS reopen).
 */
let getWindow: () => BrowserWindow | null = () => null;

export function registerAppWindowGetter(fn: () => BrowserWindow | null): void {
  getWindow = fn;
}

export function getAppWindow(): BrowserWindow | null {
  const win = getWindow();
  if (win && !win.isDestroyed()) return win;
  return null;
}
