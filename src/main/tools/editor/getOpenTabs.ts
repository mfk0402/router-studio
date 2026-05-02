import type { RegisteredTool, ToolHandlerResult } from '../../../shared/types.js';
import type { BrowserWindow } from 'electron';
import { ipcMain } from 'electron';

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win;
}

export const tool: RegisteredTool = {
  name: 'get_open_tabs',
  description:
    'Get a list of all currently open files/tabs in the editor. ' +
    'Returns file paths and whether each has unsaved changes.',
  category: 'editor',
  riskLevel: 'low',
  schema: {
    type: 'object',
    properties: {},
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { success: false, error: 'Editor window not available.' };
    }

    // Request tabs from renderer
    return new Promise((resolve) => {
      const channel = 'editor:getOpenTabs:response';
      const timeout = setTimeout(() => {
        ipcMain.removeAllListeners(channel);
        resolve({ success: false, error: 'Timeout getting open tabs.' });
      }, 5000);

      ipcMain.once(channel, (_event, tabs: Array<{ path: string; dirty: boolean; active: boolean }>) => {
        clearTimeout(timeout);
        resolve({
          success: true,
          result: {
            tabs,
            count: tabs.length,
          },
        });
      });

      mainWindow!.webContents.send('editor:getOpenTabs');
    });
  },
};
