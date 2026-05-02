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
  name: 'find_files',
  description:
    'Find files matching a glob pattern. Returns a list of matching file paths. ' +
    'Supports * (any characters except /) and ** (any path).',
  category: 'search',
  riskLevel: 'low',
  schema: {
    type: 'object',
    properties: {
      glob: {
        type: 'string',
        description: 'Glob pattern to match files (e.g., "**/*.ts", "src/**/*.test.js").',
      },
      maxResults: {
        type: 'integer',
        description: 'Maximum number of results to return. Default is 200.',
      },
    },
    required: ['glob'],
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const glob = String(args.glob ?? '');
    const maxResults = Math.min(Number(args.maxResults) || 200, 1000);

    if (!ctx.projectRoot) {
      return { success: false, error: 'No project folder is open.' };
    }

    if (!glob) {
      return { success: false, error: 'Glob pattern is required.' };
    }

    try {
      const regex = globToRegex(glob);
      const matches: string[] = [];

      async function walk(dir: string): Promise<void> {
        if (matches.length >= maxResults) return;

        let entries: Dirent[];
        try {
          entries = (await fs.readdir(dir, { withFileTypes: true })) as Dirent[];
        } catch {
          return;
        }

        for (const entry of entries) {
          if (matches.length >= maxResults) return;

          const abs = path.join(dir, entry.name);
          const rel = path.relative(ctx.projectRoot!, abs).replace(/\\/g, '/');

          if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
            await walk(abs);
          } else if (entry.isFile()) {
            if (regex.test(rel)) {
              matches.push(rel);
            }
          }
        }
      }

      await walk(ctx.projectRoot);

      return {
        success: true,
        result: {
          glob,
          files: matches,
          count: matches.length,
          truncated: matches.length >= maxResults,
        },
      };
    } catch (e) {
      return { success: false, error: `Find failed: ${(e as Error).message}` };
    }
  },
};

function globToRegex(glob: string): RegExp {
  // Handle leading ** specially
  let pattern = glob;
  if (pattern.startsWith('**/')) {
    pattern = pattern.slice(3);
  } else if (!pattern.startsWith('/')) {
    // Match anywhere in path
    pattern = '**/' + pattern;
  }

  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '.')
    .replace(/{{GLOBSTAR}}/g, '.*');

  return new RegExp(escaped.startsWith('.*') ? escaped : `(?:^|/)${escaped}$`);
}
