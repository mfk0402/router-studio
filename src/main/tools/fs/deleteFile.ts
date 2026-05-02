import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { RegisteredTool, ToolHandlerResult } from '../../../shared/types.js';

export const tool: RegisteredTool = {
  name: 'delete_file',
  description:
    'Delete a file. This operation cannot be undone. ' +
    'Does not delete directories (use with care).',
  category: 'filesystem',
  riskLevel: 'high',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path to the file to delete from the project root.',
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

    // Security: ensure path doesn't escape project root
    const absPath = path.resolve(ctx.projectRoot, relativePath);
    if (!absPath.startsWith(ctx.projectRoot)) {
      return { success: false, error: 'Path must be within the project root.' };
    }

    // Check for protected paths
    const protectedPatterns = [
      /^\.git(?:\/|$)/,
      /^node_modules(?:\/|$)/,
      /^\.env/,
      /package\.json$/,
      /package-lock\.json$/,
      /tsconfig\.json$/,
    ];
    for (const pattern of protectedPatterns) {
      if (pattern.test(relativePath)) {
        return {
          success: false,
          error: `Cannot delete protected file: ${relativePath}`,
        };
      }
    }

    try {
      const stat = await fs.stat(absPath);
      if (stat.isDirectory()) {
        return {
          success: false,
          error: `Path is a directory, not a file: ${relativePath}`,
        };
      }

      await fs.unlink(absPath);

      return {
        success: true,
        result: {
          path: relativePath,
          deleted: true,
        },
      };
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return { success: false, error: `File not found: ${relativePath}` };
      }
      return { success: false, error: `Failed to delete file: ${err.message}` };
    }
  },
};
