import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { RegisteredTool, ToolHandlerResult } from '../../../shared/types.js';
import { getSettings } from '../../secureStore.js';
import { assertWriteAllowed } from '../../writePolicy.js';
import { resolveWithinRoot } from '../../security/pathValidation.js';
import { toErrnoException } from '../../../shared/errorUtils.js';

export const tool: RegisteredTool = {
  name: 'delete_file',
  description:
    'Delete a file. This operation cannot be undone. ' +
    'Does not delete directories (use with care). ' +
    'When this succeeds, any open editor tab for that path is closed.',
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
    const relativePath = String(args.path ?? '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '');

    if (!ctx.projectRoot) {
      return { success: false, error: 'No project folder is open.' };
    }

    if (!relativePath) {
      return { success: false, error: 'Path is required.' };
    }

    // Security: ensure path doesn't escape project root using centralized validation
    const resolved = resolveWithinRoot(ctx.projectRoot, relativePath);
    if (!resolved) {
      return { success: false, error: 'Path must be within the project root.' };
    }
    const absPath = resolved.absPath;

    const settings = await getSettings();
    const policy = assertWriteAllowed(settings, resolved.relativePath);
    if (!policy.ok) {
      return { success: false, error: policy.error };
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
      const err = toErrnoException(e);
      if (err.code === 'ENOENT') {
        return { success: false, error: `File not found: ${relativePath}` };
      }
      return { success: false, error: `Failed to delete file: ${err.message}` };
    }
  },
};
