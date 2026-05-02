import type { RegisteredTool, ToolHandlerResult } from '../../../shared/types.js';
import { ipcMain } from 'electron';
import { getAppWindow } from '../../appWindow.js';

export const tool: RegisteredTool = {
  name: 'get_editor_selection',
  description:
    'Get the currently selected text in the active editor, along with the file path and selection range.',
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

    return new Promise((resolve) => {
      const channel = 'editor:getSelection:response';
      const onSelection = (
        _event: Electron.IpcMainEvent,
        selection: {
          path: string | null;
          text: string;
          startLine: number;
          endLine: number;
          startColumn: number;
          endColumn: number;
        } | null,
      ) => {
        clearTimeout(timeout);
        if (!selection || !selection.text) {
          resolve({
            success: true,
            result: {
              hasSelection: false,
              text: '',
            },
          });
        } else {
          resolve({
            success: true,
            result: {
              hasSelection: true,
              path: selection.path,
              text: selection.text,
              startLine: selection.startLine,
              endLine: selection.endLine,
              startColumn: selection.startColumn,
              endColumn: selection.endColumn,
            },
          });
        }
      };
      const timeout = setTimeout(() => {
        ipcMain.removeListener(channel, onSelection);
        resolve({ success: false, error: 'Timeout getting selection.' });
      }, 5000);

      ipcMain.once(channel, onSelection);

      mainWindow.webContents.send('editor:getSelection');
    });
  },
};
