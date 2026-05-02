import { spawn } from 'node:child_process';
import path from 'node:path';
import type { RegisteredTool, ToolHandlerResult } from '../../../shared/types.js';

export const tool: RegisteredTool = {
  name: 'grep',
  description:
    'Search for a pattern in files using regex. Returns matching lines with file paths and line numbers. ' +
    'Uses ripgrep (rg) if available, falls back to native search.',
  category: 'search',
  riskLevel: 'low',
  schema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Regular expression pattern to search for.',
      },
      path: {
        type: 'string',
        description: 'Relative path to search in. Default is "." (entire project).',
      },
      glob: {
        type: 'string',
        description: 'File glob pattern to filter files (e.g., "*.ts", "*.{js,jsx}").',
      },
      caseInsensitive: {
        type: 'boolean',
        description: 'If true, search is case-insensitive. Default is false.',
      },
      maxResults: {
        type: 'integer',
        description: 'Maximum number of matches to return. Default is 100.',
      },
    },
    required: ['pattern'],
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const pattern = String(args.pattern ?? '');
    const searchPath = String(args.path ?? '.');
    const glob = args.glob ? String(args.glob) : undefined;
    const caseInsensitive = Boolean(args.caseInsensitive);
    const maxResults = Math.min(Number(args.maxResults) || 100, 500);

    if (!ctx.projectRoot) {
      return { success: false, error: 'No project folder is open.' };
    }

    if (!pattern) {
      return { success: false, error: 'Pattern is required.' };
    }

    // Security: ensure path doesn't escape project root
    const absPath = path.resolve(ctx.projectRoot, searchPath);
    if (!absPath.startsWith(ctx.projectRoot)) {
      return { success: false, error: 'Path must be within the project root.' };
    }

    try {
      // Try ripgrep first, fall back to basic Node.js search
      const results = await tryRipgrep(
        pattern,
        absPath,
        ctx.projectRoot,
        glob,
        caseInsensitive,
        maxResults,
      );

      return {
        success: true,
        result: {
          pattern,
          matches: results.matches,
          count: results.matches.length,
          truncated: results.truncated,
        },
      };
    } catch (e) {
      return { success: false, error: `Search failed: ${(e as Error).message}` };
    }
  },
};

interface GrepResult {
  matches: Array<{
    file: string;
    line: number;
    content: string;
  }>;
  truncated: boolean;
}

async function tryRipgrep(
  pattern: string,
  searchPath: string,
  root: string,
  glob: string | undefined,
  caseInsensitive: boolean,
  maxResults: number,
): Promise<GrepResult> {
  return new Promise((resolve, reject) => {
    const args: string[] = [
      '--json',
      '--max-count',
      String(maxResults),
      '--no-heading',
    ];

    if (caseInsensitive) {
      args.push('--ignore-case');
    }

    if (glob) {
      args.push('--glob', glob);
    }

    // Standard ignores
    args.push(
      '--glob',
      '!node_modules',
      '--glob',
      '!.git',
      '--glob',
      '!*.min.js',
      '--glob',
      '!*.min.css',
      '--glob',
      '!package-lock.json',
      '--glob',
      '!yarn.lock',
      '--glob',
      '!pnpm-lock.yaml',
    );

    args.push('--', pattern, searchPath);

    const proc = spawn('rg', args, {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30000,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('error', (err) => {
      // ripgrep not found, fall back to basic search
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        fallbackSearch(pattern, searchPath, root, glob, caseInsensitive, maxResults)
          .then(resolve)
          .catch(reject);
      } else {
        reject(err);
      }
    });

    proc.on('close', (code) => {
      if (code !== 0 && code !== 1) {
        // code 1 means no matches, which is fine
        if (stderr.includes('ENOENT') || stderr.includes('not found')) {
          // ripgrep not found, fall back
          fallbackSearch(pattern, searchPath, root, glob, caseInsensitive, maxResults)
            .then(resolve)
            .catch(reject);
          return;
        }
        reject(new Error(`ripgrep exited with code ${code}: ${stderr}`));
        return;
      }

      const matches: GrepResult['matches'] = [];
      const lines = stdout.split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          if (obj.type === 'match' && obj.data) {
            const relPath = path.relative(root, obj.data.path.text).replace(/\\/g, '/');
            for (const subMatch of obj.data.submatches || [{ match: { text: '' } }]) {
              matches.push({
                file: relPath,
                line: obj.data.line_number,
                content: obj.data.lines?.text?.trim() ?? '',
              });
              if (matches.length >= maxResults) break;
            }
          }
        } catch {
          // skip malformed JSON
        }
        if (matches.length >= maxResults) break;
      }

      resolve({
        matches,
        truncated: matches.length >= maxResults,
      });
    });
  });
}

import { promises as fs } from 'node:fs';
import type { Dirent } from 'node:fs';

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
]);

async function fallbackSearch(
  pattern: string,
  searchPath: string,
  root: string,
  glob: string | undefined,
  caseInsensitive: boolean,
  maxResults: number,
): Promise<GrepResult> {
  const matches: GrepResult['matches'] = [];
  const regex = new RegExp(pattern, caseInsensitive ? 'gi' : 'g');
  const globRegex = glob ? globToRegex(glob) : null;

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

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        await walk(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        const abs = path.join(dir, entry.name);
        const rel = path.relative(root, abs).replace(/\\/g, '/');

        if (globRegex && !globRegex.test(entry.name)) continue;

        try {
          const content = await fs.readFile(abs, 'utf8');
          const lines = content.split('\n');

          for (let i = 0; i < lines.length && matches.length < maxResults; i++) {
            if (regex.test(lines[i])) {
              matches.push({
                file: rel,
                line: i + 1,
                content: lines[i].trim().slice(0, 200),
              });
            }
            regex.lastIndex = 0;
          }
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  await walk(searchPath);

  return {
    matches,
    truncated: matches.length >= maxResults,
  };
}

function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '.')
    .replace(/{{GLOBSTAR}}/g, '.*');
  return new RegExp(`^${escaped}$`);
}
