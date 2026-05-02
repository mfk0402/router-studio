import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { RegisteredTool, ToolHandlerResult } from '../../../shared/types.js';

export const tool: RegisteredTool = {
  name: 'edit_file',
  description:
    'Edit a file by replacing a specific string with a new string. ' +
    'This is the preferred way to make targeted changes to files. ' +
    'The old_string must match exactly (including whitespace and indentation). ' +
    'If old_string is not found or is not unique, the operation fails. ' +
    'Use replace_all=true to replace all occurrences.',
  category: 'filesystem',
  riskLevel: 'high',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path to the file from the project root.',
      },
      old_string: {
        type: 'string',
        description: 'The exact string to find and replace. Must match exactly.',
      },
      new_string: {
        type: 'string',
        description: 'The string to replace old_string with.',
      },
      replace_all: {
        type: 'boolean',
        description: 'If true, replace all occurrences. Default is false (replace only first).',
      },
    },
    required: ['path', 'old_string', 'new_string'],
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const relativePath = String(args.path ?? '');
    const oldString = String(args.old_string ?? '');
    const newString = String(args.new_string ?? '');
    const replaceAll = Boolean(args.replace_all);

    if (!ctx.projectRoot) {
      return { success: false, error: 'No project folder is open.' };
    }

    if (!relativePath) {
      return { success: false, error: 'Path is required.' };
    }

    if (!oldString) {
      return { success: false, error: 'old_string is required.' };
    }

    if (oldString === newString) {
      return { success: false, error: 'old_string and new_string are identical.' };
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
    ];
    for (const pattern of protectedPatterns) {
      if (pattern.test(relativePath)) {
        return {
          success: false,
          error: `Cannot edit protected path: ${relativePath}`,
        };
      }
    }

    try {
      const content = await fs.readFile(absPath, 'utf8');

      // Count occurrences
      let count = 0;
      let idx = 0;
      while ((idx = content.indexOf(oldString, idx)) !== -1) {
        count++;
        idx += oldString.length;
      }

      if (count === 0) {
        return {
          success: false,
          error: `old_string not found in file. Make sure the string matches exactly, including whitespace.`,
        };
      }

      if (count > 1 && !replaceAll) {
        return {
          success: false,
          error: `old_string found ${count} times in the file. Use replace_all=true to replace all, or provide more context to make the match unique.`,
        };
      }

      // Perform replacement
      let newContent: string;
      if (replaceAll) {
        newContent = content.split(oldString).join(newString);
      } else {
        const firstIdx = content.indexOf(oldString);
        newContent =
          content.slice(0, firstIdx) + newString + content.slice(firstIdx + oldString.length);
      }

      // Write the file
      await fs.writeFile(absPath, newContent, 'utf8');

      return {
        success: true,
        result: {
          path: relativePath,
          replacements: replaceAll ? count : 1,
          bytesWritten: Buffer.byteLength(newContent, 'utf8'),
        },
        preview: `Replaced ${replaceAll ? count : 1} occurrence(s) in ${relativePath}`,
      };
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return { success: false, error: `File not found: ${relativePath}` };
      }
      return { success: false, error: `Failed to edit file: ${err.message}` };
    }
  },
};
