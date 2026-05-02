import type { RegisteredTool, ToolHandlerResult } from '../../../shared/types.js';
import type { BrowserWindow } from 'electron';

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win;
}

export const tool: RegisteredTool = {
  name: 'open_file',
  description:
    'Open a file in the editor, optionally jumping to a specific line and column. ' +
    'Use this when you want the user to see a specific file or location.',
  category: 'editor',
  riskLevel: 'low',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path to the file to open.',
      },
      line: {
        type: 'integer',
        description: 'Line number to jump to (1-indexed). Optional.',
      },
      column: {
        type: 'integer',
        description: 'Column number (1-indexed). Optional.',
      },
    },
    required: ['path'],
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const relativePath = String(args.path ?? '');
    const line = args.line != null ? Number(args.line) : undefined;
    const column = args.column != null ? Number(args.column) : undefined;

    if (!ctx.projectRoot) {
      return { success: false, error: 'No project folder is open.' };
    }

    if (!relativePath) {
      return { success: false, error: 'Path is required.' };
    }

    if (!mainWindow || mainWindow.isDestroyed()) {
      return { success: false, error: 'Editor window not available.' };
    }

    // Send event to renderer to open the file
    mainWindow.webContents.send('editor:openFile', {
      path: relativePath,
      line,
      column,
    });

    return {
      success: true,
      result: {
        path: relativePath,
        line,
        column,
        opened: true,
      },
    };
  },
};
