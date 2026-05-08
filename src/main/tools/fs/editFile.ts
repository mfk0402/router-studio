import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { RegisteredTool, ToolHandlerResult } from '../../../shared/types.js';
import { getSettings } from '../../secureStore.js';
import { assertWriteAllowed } from '../../writePolicy.js';
import { pushWriteUndo } from '../../writeUndoStack.js';
import { assertSensitivePathAllowed } from '../../security/sensitiveFileGuard.js';
import { resolveWithinRoot } from '../../security/pathValidation.js';
import { toErrnoException } from '../../../shared/errorUtils.js';

export const tool: RegisteredTool = {
  name: 'edit_file',
  description:
    'Edit a file by replacing a specific string with a new string. ' +
    'This is the preferred way to make targeted changes to files. ' +
    'The old_string must match exactly (including whitespace and indentation). ' +
    'If old_string is not found or is not unique, the operation fails unless you pass occurrence (1-based index among matches). ' +
    'Use replace_all=true to replace all occurrences (occurrence is ignored when replace_all is true). ' +
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
      occurrence: {
        type: 'integer',
        description:
          'When old_string matches multiple times and replace_all is false, replace only this 1-based occurrence (1 = first match). Optional.',
      },
    },
    required: ['path', 'old_string', 'new_string'],
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const relativePath = String(args.path ?? '');
    const oldString = String(args.old_string ?? '');
    const newString = String(args.new_string ?? '');
    const replaceAll = Boolean(args.replace_all);
    const occurrenceRaw = args.occurrence != null ? Number(args.occurrence) : undefined;

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

    const sens = await assertSensitivePathAllowed(ctx.projectRoot, relativePath);
    if (!sens.ok) {
      return { success: false, error: sens.error };
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

      const occurrence =
        occurrenceRaw != null && Number.isFinite(occurrenceRaw) ? Math.floor(occurrenceRaw) : undefined;

      if (!replaceAll) {
        if (count > 1 && occurrence === undefined) {
          return {
            success: false,
            error: `old_string found ${count} times in the file. Use replace_all=true, set occurrence to a 1-based index (1..${count}), or include more context so the match is unique.`,
          };
        }
        if (occurrence !== undefined && (occurrence < 1 || occurrence > count)) {
          return {
            success: false,
            error: `occurrence must be between 1 and ${count} for this old_string (got ${occurrence}).`,
          };
        }
      }

      pushWriteUndo(ctx.projectRoot, relativePath, content);

      // Perform replacement
      let newContent: string;
      if (replaceAll) {
        newContent = content.split(oldString).join(newString);
      } else {
        let replaceIdx: number;
        if (occurrence !== undefined) {
          let start = 0;
          replaceIdx = -1;
          for (let i = 1; i <= occurrence; i++) {
            replaceIdx = content.indexOf(oldString, start);
            if (replaceIdx === -1) {
              return { success: false, error: 'Internal error resolving occurrence index.' };
            }
            start = replaceIdx + oldString.length;
          }
        } else {
          replaceIdx = content.indexOf(oldString);
        }
        newContent =
          content.slice(0, replaceIdx) + newString + content.slice(replaceIdx + oldString.length);
      }

      // Write the file
      await fs.writeFile(absPath, newContent, 'utf8');

      return {
        success: true,
        result: {
          path: relativePath,
          replacements: replaceAll ? count : 1,
          bytesWritten: Buffer.byteLength(newContent, 'utf8'),
          occurrence_used:
            !replaceAll && occurrence !== undefined ? occurrence : undefined,
        },
        preview: `Replaced ${replaceAll ? count : 1} occurrence(s) in ${relativePath}`,
      };
    } catch (e) {
      const err = toErrnoException(e);
      if (err.code === 'ENOENT') {
        return { success: false, error: `File not found: ${relativePath}` };
      }
      return { success: false, error: `Failed to edit file: ${err.message}` };
    }
  },
};