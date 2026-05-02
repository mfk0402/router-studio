import { spawn } from 'node:child_process';
import type { RegisteredTool, ToolHandlerResult } from '../../../shared/types.js';

export const tool: RegisteredTool = {
  name: 'git_diff',
  description:
    'Get the git diff for uncommitted changes. Can show diff for a specific file, staged changes, or compare against a commit.',
  category: 'git',
  riskLevel: 'low',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Specific file to diff. If omitted, diffs all changes.',
      },
      staged: {
        type: 'boolean',
        description: 'If true, show only staged changes. Default is false (unstaged).',
      },
      ref: {
        type: 'string',
        description: 'Compare against a specific commit/branch (e.g., "HEAD~1", "main").',
      },
    },
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    if (!ctx.projectRoot) {
      return { success: false, error: 'No project folder is open.' };
    }

    const filePath = args.path ? String(args.path) : undefined;
    const staged = Boolean(args.staged);
    const ref = args.ref ? String(args.ref) : undefined;

    try {
      const gitArgs = ['diff', '--no-color'];

      if (staged) {
        gitArgs.push('--cached');
      }

      if (ref) {
        gitArgs.push(ref);
      }

      if (filePath) {
        gitArgs.push('--', filePath);
      }

      const diff = await runGit(gitArgs, ctx.projectRoot);

      // Count lines changed
      let additions = 0;
      let deletions = 0;
      for (const line of diff.split('\n')) {
        if (line.startsWith('+') && !line.startsWith('+++')) additions++;
        if (line.startsWith('-') && !line.startsWith('---')) deletions++;
      }

      return {
        success: true,
        result: {
          diff: diff.slice(0, 50000), // Truncate very long diffs
          truncated: diff.length > 50000,
          additions,
          deletions,
          path: filePath ?? 'all',
          staged,
          ref,
        },
      };
    } catch (e) {
      return { success: false, error: `Git error: ${(e as Error).message}` };
    }
  },
};

async function runGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', args, {
      cwd,
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

    proc.on('error', reject);

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `git exited with code ${code}`));
      }
    });
  });
}
