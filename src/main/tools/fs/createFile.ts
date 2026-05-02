import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { RegisteredTool, ToolHandlerResult } from '../../../shared/types.js';

export const tool: RegisteredTool = {
  name: 'create_file',
  description:
    'Create a new file with optional initial content. ' +
    'Fails if the file already exists. Creates parent directories as needed.',
  category: 'filesystem',
  riskLevel: 'medium',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path for the new file from the project root.',
      },
      content: {
        type: 'string',
        description: 'Initial content for the file. Default is empty string.',
      },
    },
    required: ['path'],
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const relativePath = String(args.path ?? '');
    const content = args.content != null ? String(args.content) : '';

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
    const protectedPatterns = [/^\.git(?:\/|$)/, /^node_modules(?:\/|$)/];
    for (const pattern of protectedPatterns) {
      if (pattern.test(relativePath)) {
        return {
          success: false,
          error: `Cannot create file in protected path: ${relativePath}`,
        };
      }
    }

    try {
      // Check if file already exists
      try {
        await fs.access(absPath);
        return {
          success: false,
          error: `File already exists: ${relativePath}. Use write_file to overwrite.`,
        };
      } catch {
        // File doesn't exist, good
      }

      // Ensure parent directory exists
      const dir = path.dirname(absPath);
      await fs.mkdir(dir, { recursive: true });

      // Create the file
      await fs.writeFile(absPath, content, 'utf8');

      return {
        success: true,
        result: {
          path: relativePath,
          bytesWritten: Buffer.byteLength(content, 'utf8'),
        },
      };
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      return { success: false, error: `Failed to create file: ${err.message}` };
    }
  },
};
