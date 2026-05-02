import { spawn } from 'node:child_process';
import type { RegisteredTool, ToolHandlerResult } from '../../../shared/types.js';

export const tool: RegisteredTool = {
  name: 'git_add',
  description:
    'Stage files for commit. Can stage specific files, all changes, or all tracked files.',
  category: 'git',
  riskLevel: 'low',
  schema: {
    type: 'object',
    properties: {
      paths: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of file paths to stage. Use ["."] for all changes.',
      },
      all: {
        type: 'boolean',
        description: 'If true, stage all changes including untracked files. Same as paths=["."].',
      },
    },
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    if (!ctx.projectRoot) {
      return { success: false, error: 'No project folder is open.' };
    }

    const paths = Array.isArray(args.paths) ? args.paths.map(String) : [];
    const all = Boolean(args.all);

    if (!all && paths.length === 0) {
      return { success: false, error: 'Specify paths to stage or use all=true.' };
    }

    try {
      const gitArgs = ['add'];
      if (all) {
        gitArgs.push('-A');
      } else {
        gitArgs.push('--', ...paths);
      }

      await runGit(gitArgs, ctx.projectRoot);

      // Get status to show what was staged
      const status = await runGit(['status', '--porcelain'], ctx.projectRoot);
      const staged = status
        .split('\n')
        .filter((line) => {
          const indexStatus = line[0];
          return indexStatus !== ' ' && indexStatus !== '?' && indexStatus !== undefined;
        })
        .map((line) => line.slice(3));

      return {
        success: true,
        result: {
          staged,
          count: staged.length,
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
