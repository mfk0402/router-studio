import type { RegisteredTool, ToolHandlerResult } from '../../../shared/types.js';
import { ipcMain } from 'electron';
import { getAppWindow } from '../../appWindow.js';

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
    const mainWindow = getAppWindow();
    if (!mainWindow) {
      return { success: false, error: 'Editor window not available.' };
    }

    // Request tabs from renderer
    return new Promise((resolve) => {
      const channel = 'editor:getOpenTabs:response';
      const onTabs = (_event: Electron.IpcMainEvent, tabs: Array<{ path: string; dirty: boolean; active: boolean }>) => {
        clearTimeout(timeout);
        resolve({
          success: true,
          result: {
            tabs,
            count: tabs.length,
          },
        });
      };
      const timeout = setTimeout(() => {
        ipcMain.removeListener(channel, onTabs);
        resolve({ success: false, error: 'Timeout getting open tabs.' });
      }, 5000);

      ipcMain.once(channel, onTabs);

      mainWindow.webContents.send('editor:getOpenTabs');
    });
  },
};
