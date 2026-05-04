import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { RegisteredTool, ToolHandlerResult } from '../../../shared/types.js';
import { getSettings } from '../../secureStore.js';
import { assertWriteAllowed } from '../../writePolicy.js';
import { pushWriteUndo } from '../../writeUndoStack.js';
import { assertSensitivePathAllowed } from '../../security/sensitiveFileGuard.js';

export const tool: RegisteredTool = {
  name: 'write_file',
  description:
    'Write content to a file, replacing its entire contents. ' +
    'Creates the file if it does not exist. Creates parent directories as needed. ' +
    'For partial edits, use edit_file instead. ' +
    'When this succeeds, any open editor tab for that path refreshes from disk.',
  category: 'filesystem',
  riskLevel: 'high',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path to the file from the project root.',
      },
      content: {
        type: 'string',
        description: 'The complete content to write to the file.',
      },
    },
    required: ['path', 'content'],
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const relativePath = String(args.path ?? '');
    const content = String(args.content ?? '');

    if (!ctx.projectRoot) {
      return { success: false, error: 'No project folder is open.' };
    }

    if (!relativePath) {
      return { success: false, error: 'Path is required.' };
    }

    // Security: ensure path doesn't escape project root.
    // Using startsWith with separator prevents prefix-matching attacks
    // (e.g. root "/home/user/app" must not match "/home/user/app_other").
    const absPath = path.resolve(ctx.projectRoot, relativePath);
    const rootWithSep = ctx.projectRoot.endsWith(path.sep)
      ? ctx.projectRoot
      : ctx.projectRoot + path.sep;
    if (absPath !== ctx.projectRoot && !absPath.startsWith(rootWithSep)) {
      return { success: false, error: 'Path must be within the project root.' };
    }

    const settings = await getSettings();
    const policy = assertWriteAllowed(settings, relativePath);
    if (!policy.ok) {
      return { success: false, error: policy.error };
    }

    const sens = await assertSensitivePathAllowed(ctx.projectRoot, relativePath);
    if (!sens.ok) {
      return { success: false, error: sens.error };
    }

    // Check for protected paths
    const protectedPatterns = [
      /^\.git(?:\/|$)/,
      /^node_modules(?:\/|$)/,
      /^\.env/,
      /credentials/i,
      /secret/i,
    ];
    for (const pattern of protectedPatterns) {
      if (pattern.test(relativePath)) {
        return {
          success: false,
          error: `Cannot write to protected path: ${relativePath}`,
        };
      }
    }

    try {
      // Ensure parent directory exists
      const dir = path.dirname(absPath);
      await fs.mkdir(dir, { recursive: true });

      // Check if file exists for diff preview
      let existingContent: string | null = null;
      try {
        existingContent = await fs.readFile(absPath, 'utf8');
      } catch {
        // File doesn't exist, that's fine
      }

      pushWriteUndo(ctx.projectRoot, relativePath, existingContent);

      // Write the file
      await fs.writeFile(absPath, content, 'utf8');

      const action = existingContent === null ? 'created' : 'updated';
      const bytesWritten = Buffer.byteLength(content, 'utf8');

      return {
        success: true,
        result: {
          path: relativePath,
          action,
          bytesWritten,
        },
        preview:
          existingContent !== null
            ? `File ${action}: ${relativePath} (${bytesWritten} bytes)`
            : `Created new file: ${relativePath} (${bytesWritten} bytes)`,
      };
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      return { success: false, error: `Failed to write file: ${err.message}` };
    }
  },
};