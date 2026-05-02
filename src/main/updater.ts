import { autoUpdater } from 'electron-updater';
import { app, BrowserWindow } from 'electron';
import type { UpdateCheckInvokeResult, UpdateEvent } from '../shared/types.js';

let targetWindow: BrowserWindow | null = null;
let listenersAttached = false;

export function setUpdaterTargetWindow(win: BrowserWindow | null): void {
  targetWindow = win;
}

function emit(ev: UpdateEvent): void {
  targetWindow?.webContents.send('updates:event', ev);
}

function notesFromInfo(info: { releaseNotes?: string | unknown }): string | undefined {
  const n = info.releaseNotes;
  return typeof n === 'string' && n.trim() ? n.trim().slice(0, 2000) : undefined;
}

/** Attach electron-updater listeners once (packaged apps only). */
export function setupAutoUpdater(): void {
  if (!app.isPackaged || listenersAttached) return;
  listenersAttached = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  const envUrl = process.env['ROUTER_STUDIO_UPDATES_URL']?.trim();
  if (envUrl) {
    autoUpdater.setFeedURL({ provider: 'generic', url: envUrl });
  }

  autoUpdater.on('checking-for-update', () => emit({ kind: 'checking' }));
  autoUpdater.on('update-available', (info) =>
    emit({
      kind: 'available',
      version: info.version,
      releaseNotes: notesFromInfo(info),
    }),
  );
  autoUpdater.on('update-not-available', () => emit({ kind: 'not-available' }));
  autoUpdater.on('error', (err) => emit({ kind: 'error', message: err.message }));
  autoUpdater.on('download-progress', (p) =>
    emit({ kind: 'download-progress', percent: p.percent }),
  );
  autoUpdater.on('update-downloaded', (info) =>
    emit({ kind: 'downloaded', version: info.version }),
  );
}

export async function invokeCheckForUpdates(): Promise<UpdateCheckInvokeResult> {
  if (!app.isPackaged) {
    return {
      started: false,
      skipReason: 'development',
      message: 'Updates apply to packaged installs only (not dev runs).',
    };
  }
  try {
    await autoUpdater.checkForUpdates();
    return { started: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[updates] checkForUpdates failed:', msg);
    return { started: false, message: msg };
  }
}

export async function invokeDownloadUpdate(): Promise<{ ok: boolean; message?: string }> {
  if (!app.isPackaged) {
    return { ok: false, message: 'Not available in development.' };
  }
  try {
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[updates] downloadUpdate failed:', msg);
    return { ok: false, message: msg };
  }
}

export function invokeQuitAndInstall(): void {
  if (!app.isPackaged) return;
  autoUpdater.quitAndInstall(false, true);
}
