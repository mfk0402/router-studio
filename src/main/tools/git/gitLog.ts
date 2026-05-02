import { spawn } from 'node:child_process';
import type { RegisteredTool, ToolHandlerResult } from '../../../shared/types.js';

export const tool: RegisteredTool = {
  name: 'git_log',
  description:
    'Get recent git commit history. Can filter by file path or limit number of commits.',
  category: 'git',
  riskLevel: 'low',
  schema: {
    type: 'object',
    properties: {
      limit: {
        type: 'integer',
        description: 'Maximum number of commits to return. Default is 20.',
      },
      path: {
        type: 'string',
        description: 'Filter commits that touched this file/directory.',
      },
      oneline: {
        type: 'boolean',
        description: 'If true, return compact one-line format. Default is false.',
      },
    },
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    if (!ctx.projectRoot) {
      return { success: false, error: 'No project folder is open.' };
    }

    const limit = Math.min(Number(args.limit ?? args.count) || 20, 100);
    const filePath = args.path ? String(args.path) : undefined;
    const oneline = Boolean(args.oneline);

    try {
      const format = oneline
        ? '%h %s (%an, %ar)'
        : '%H%n%an%n%ae%n%at%n%s%n%b%n---COMMIT---';

      const gitArgs = ['log', `--max-count=${limit}`, `--format=${format}`];

      if (filePath) {
        gitArgs.push('--', filePath);
      }

      const output = await runGit(gitArgs, ctx.projectRoot);

      if (oneline) {
        const commits = output.trim().split('\n').filter(Boolean);
        return {
          success: true,
          result: {
            commits,
            count: commits.length,
            format: 'oneline',
          },
        };
      }

      // Parse detailed format
      const commits = output.split('---COMMIT---').filter(Boolean).map((block) => {
        const lines = block.trim().split('\n');
        return {
          hash: lines[0],
          author: lines[1],
          email: lines[2],
          timestamp: Number(lines[3]),
          date: new Date(Number(lines[3]) * 1000).toISOString(),
          subject: lines[4],
          body: lines.slice(5).join('\n').trim(),
        };
      });

      return {
        success: true,
        result: {
          commits,
          count: commits.length,
          format: 'detailed',
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
