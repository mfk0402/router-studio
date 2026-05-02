import type { RegisteredTool, ToolHandlerResult } from '../../../shared/types.js';
import type { BrowserWindow } from 'electron';
import { ipcMain } from 'electron';

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win;
}

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
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { success: false, error: 'Editor window not available.' };
    }

    return new Promise((resolve) => {
      const channel = 'editor:getSelection:response';
      const timeout = setTimeout(() => {
        ipcMain.removeAllListeners(channel);
        resolve({ success: false, error: 'Timeout getting selection.' });
      }, 5000);

      ipcMain.once(
        channel,
        (
          _event,
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
        },
      );

      mainWindow!.webContents.send('editor:getSelection');
    });
  },
};
