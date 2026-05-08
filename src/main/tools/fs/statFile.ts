import { promises as fs } from 'node:fs';
import type { RegisteredTool, ToolHandlerResult } from '../../../shared/types.js';
import { resolveWithinRoot } from '../../security/pathValidation.js';
import { getErrorMessage } from '../../../shared/errorUtils.js';

export const tool: RegisteredTool = {
  name: 'stat_file',
  description:
    'Get metadata about a file or directory: size, modification time, type.',
  category: 'filesystem',
  riskLevel: 'low',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path to the file or directory from the project root.',
      },
    },
    required: ['path'],
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const relativePath = String(args.path ?? '');

    if (!ctx.projectRoot) {
      return { success: false, error: 'No project folder is open.' };
    }

    if (!relativePath) {
      return { success: false, error: 'Path is required.' };
    }

    const resolved = resolveWithinRoot(ctx.projectRoot, relativePath);
    if (!resolved) {
      return { success: false, error: 'Path must be within the project root.' };
    }

    try {
      const stat = await fs.stat(resolved.absPath);

      return {
        success: true,
        result: {
          path: resolved.relativePath,
          isFile: stat.isFile(),
          isDirectory: stat.isDirectory(),
          isSymlink: stat.isSymbolicLink(),
          size: stat.size,
          sizeHuman: humanSize(stat.size),
          modifiedAt: stat.mtime.toISOString(),
          createdAt: stat.birthtime.toISOString(),
          mode: stat.mode.toString(8),
        },
      };
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return { success: false, error: `Path not found: ${resolved.relativePath}` };
      }
      return { success: false, error: `Failed to stat: ${getErrorMessage(e)}` };
    }
  },
};

function humanSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(1)} ${units[i]}`;
}
