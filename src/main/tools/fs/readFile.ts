import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { RegisteredTool, ToolHandlerResult } from '../../../shared/types.js';
import { assertSensitivePathAllowed } from '../../security/sensitiveFileGuard.js';

export const tool: RegisteredTool = {
  name: 'read_file',
  description:
    'Read the contents of a file. Returns the file content with line numbers prefixed. ' +
    'Use lineStart and lineEnd to read a specific range of lines (1-indexed). ' +
    'Optional max_lines caps how many lines are returned after the range is applied (useful for huge files).',
  category: 'filesystem',
  riskLevel: 'low',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path to the file from the project root.',
      },
      lineStart: {
        type: 'integer',
        description: 'Start line number (1-indexed, inclusive). Optional.',
      },
      lineEnd: {
        type: 'integer',
        description: 'End line number (1-indexed, inclusive). Optional.',
      },
      max_lines: {
        type: 'integer',
        description:
          'Maximum lines to return after applying lineStart/lineEnd (default: unlimited). Use on large files to limit context size.',
      },
    },
    required: ['path'],
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const relativePath = String(args.path ?? '');
    const lineStart = args.lineStart != null ? Number(args.lineStart) : undefined;
    const lineEnd = args.lineEnd != null ? Number(args.lineEnd) : undefined;
    const maxLinesRaw = args.max_lines != null ? Number(args.max_lines) : undefined;
    const maxLines =
      maxLinesRaw != null && Number.isFinite(maxLinesRaw) && maxLinesRaw > 0
        ? Math.floor(maxLinesRaw)
        : undefined;

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

    const sens = await assertSensitivePathAllowed(ctx.projectRoot, relativePath);
    if (!sens.ok) {
      return { success: false, error: sens.error };
    }

    try {
      const content = await fs.readFile(absPath, 'utf8');
      const lines = content.split('\n');

      let start = 1;
      let end = lines.length;

      if (lineStart != null && lineStart > 0) {
        start = Math.min(lineStart, lines.length);
      }
      if (lineEnd != null && lineEnd > 0) {
        end = Math.min(lineEnd, lines.length);
      }

      const selectedLines = lines.slice(start - 1, end);
      let displayStart = start;
      let displayEnd = end;
      let truncatedByMax = false;
      let linesOut = selectedLines;
      if (maxLines != null && maxLines > 0 && selectedLines.length > maxLines) {
        linesOut = selectedLines.slice(0, maxLines);
        displayEnd = displayStart + linesOut.length - 1;
        truncatedByMax = true;
      }

      const numberedLines = linesOut.map(
        (line, i) => `${String(displayStart + i).padStart(6, ' ')}|${line}`,
      );

      const result = numberedLines.join('\n');
      const totalLines = lines.length;

      return {
        success: true,
        result: {
          path: relativePath,
          content: result,
          totalLines,
          startLine: displayStart,
          endLine: displayEnd,
          truncated: start > 1 || end < totalLines || truncatedByMax,
        },
      };
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return { success: false, error: `File not found: ${relativePath}` };
      }
      if (err.code === 'EISDIR') {
        return { success: false, error: `Path is a directory, not a file: ${relativePath}` };
      }
      return { success: false, error: `Failed to read file: ${err.message}` };
    }
  },
};
