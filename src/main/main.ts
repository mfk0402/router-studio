import { app, BrowserWindow, session, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerAppWindowGetter } from './appWindow.js';
import { registerIpc } from './ipc.js';
import { setupAutoUpdater, setUpdaterTargetWindow } from './updater.js';
import { killAllSessions } from './terminal.js';
import { ensureDefaultAgentRule } from './rules.js';
import { startScheduledTasksLoop } from './scheduledTasks.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;

process.on('uncaughtException', (err) => {
  console.error('[main] uncaughtException:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[main] unhandledRejection:', reason);
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  function createMainWindow(): BrowserWindow {
    const win = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 900,
      minHeight: 600,
      show: false,
      backgroundColor: '#0f1115',
      title: 'Router Studio',
      icon: path.join(__dirname, '../../resources/icon.png'),
      autoHideMenuBar: true,
      webPreferences: {
        // electron-vite outputs preload.mjs when package.json has "type": "module".
        preload: path.join(__dirname, '../preload/preload.mjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        webSecurity: true,
        spellcheck: false,
      },
    });

    win.on('ready-to-show', () => {
      win.show();
      win.focus();
    });

    win.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    win.webContents.on('preload-error', (_e, preloadPath, error) => {
      console.error('[preload-error]', preloadPath, error);
    });

    // In dev, electron-vite provides ELECTRON_RENDERER_URL. In prod, load built html.
    const devUrl = process.env['ELECTRON_RENDERER_URL'];
    if (devUrl) {
      void win.loadURL(devUrl);
      // Auto-open DevTools in dev so preload / IPC failures are immediately visible.
      win.webContents.openDevTools({ mode: 'detach' });
    } else {
      void win.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    return win;
  }

  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      if (permission === 'media') {
        callback(true);
        return;
      }
      callback(false);
    });

    mainWindow = createMainWindow();
    registerAppWindowGetter(() => mainWindow);
    registerIpc(() => mainWindow);
    startScheduledTasksLoop(() => mainWindow);
    // Seed built-in rules (idempotent) before the window opens so the first
    // renderer scan already includes them.
    ensureDefaultAgentRule().catch((err) => {
      console.error('[rules] failed to seed defaults:', err);
    });
    setUpdaterTargetWindow(mainWindow);
    setupAutoUpdater();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow();
        registerAppWindowGetter(() => mainWindow);
        registerIpc(() => mainWindow);
        startScheduledTasksLoop(() => mainWindow);
        setUpdaterTargetWindow(mainWindow);
      }
    });
  });

  app.on('window-all-closed', () => {
    killAllSessions();
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    killAllSessions();
  });

  // Security: block unknown navigation targets.
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (e, url) => {
      const allowed = process.env['ELECTRON_RENDERER_URL'];
      if (allowed && url.startsWith(allowed)) return;
      if (url.startsWith('file://')) return;
      e.preventDefault();
      void shell.openExternal(url);
    });
  });
}
