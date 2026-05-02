import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Dirent } from 'node:fs';
import type { RegisteredTool, ToolHandlerResult } from '../../../shared/types.js';

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '__pycache__',
  '.venv',
  'venv',
  '.idea',
  '.vscode',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
]);

export const tool: RegisteredTool = {
  name: 'list_dir',
  description:
    'List the contents of a directory. Returns file/folder names with type indicators. ' +
    'Use recursive=true to list all files in the tree (limited to maxEntries).',
  category: 'filesystem',
  riskLevel: 'low',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description:
          'Relative path to the directory from the project root. Use "." for root.',
      },
      recursive: {
        type: 'boolean',
        description: 'If true, recursively list all files. Default is false.',
      },
      maxEntries: {
        type: 'integer',
        description: 'Maximum number of entries to return. Default is 500.',
      },
    },
    required: ['path'],
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const relativePath = String(args.path ?? '.');
    const recursive = Boolean(args.recursive);
    const maxEntries = Math.min(Number(args.maxEntries) || 500, 2000);

    if (!ctx.projectRoot) {
      return { success: false, error: 'No project folder is open.' };
    }

    // Security: ensure path doesn't escape project root
    const absPath = path.resolve(ctx.projectRoot, relativePath);
    if (!absPath.startsWith(ctx.projectRoot)) {
      return { success: false, error: 'Path must be within the project root.' };
    }

    try {
      const stat = await fs.stat(absPath);
      if (!stat.isDirectory()) {
        return {
          success: false,
          error: `Path is not a directory: ${relativePath}`,
        };
      }

      const entries: string[] = [];
      let truncated = false;

      if (recursive) {
        await walkDir(absPath, ctx.projectRoot, entries, maxEntries);
        truncated = entries.length >= maxEntries;
      } else {
        const items = (await fs.readdir(absPath, { withFileTypes: true })) as Dirent[];
        items.sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        });

        for (const item of items) {
          if (entries.length >= maxEntries) {
            truncated = true;
            break;
          }
          const rel = path.join(relativePath, item.name).replace(/\\/g, '/');
          if (item.isDirectory()) {
            entries.push(`[dir]  ${rel}/`);
          } else {
            entries.push(`[file] ${rel}`);
          }
        }
      }

      return {
        success: true,
        result: {
          path: relativePath,
          entries,
          count: entries.length,
          truncated,
        },
      };
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return { success: false, error: `Directory not found: ${relativePath}` };
      }
      return { success: false, error: `Failed to list directory: ${err.message}` };
    }
  },
};

async function walkDir(
  dir: string,
  root: string,
  entries: string[],
  maxEntries: number,
): Promise<void> {
  if (entries.length >= maxEntries) return;

  let items: Dirent[];
  try {
    items = (await fs.readdir(dir, { withFileTypes: true })) as Dirent[];
  } catch {
    return;
  }

  items.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const item of items) {
    if (entries.length >= maxEntries) return;

    // Skip hidden and common ignored directories
    if (item.name.startsWith('.') && item.isDirectory()) continue;
    if (item.isDirectory() && SKIP_DIRS.has(item.name)) continue;

    const abs = path.join(dir, item.name);
    const rel = path.relative(root, abs).replace(/\\/g, '/');

    if (item.isDirectory()) {
      entries.push(`[dir]  ${rel}/`);
      await walkDir(abs, root, entries, maxEntries);
    } else {
      entries.push(`[file] ${rel}`);
    }
  }
}
