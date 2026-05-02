import { spawn } from 'node:child_process';
import type { RegisteredTool, ToolHandlerResult } from '../../../shared/types.js';

export const tool: RegisteredTool = {
  name: 'git_status',
  description:
    'Get the current git status including staged, unstaged, and untracked files. ' +
    'Also shows the current branch and whether there are unpushed commits.',
  category: 'git',
  riskLevel: 'low',
  schema: {
    type: 'object',
    properties: {},
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    if (!ctx.projectRoot) {
      return { success: false, error: 'No project folder is open.' };
    }

    try {
      // Get status
      const status = await runGit(['status', '--porcelain=v1'], ctx.projectRoot);
      const branch = await runGit(['branch', '--show-current'], ctx.projectRoot);
      const aheadBehind = await runGit(
        ['rev-list', '--left-right', '--count', '@{upstream}...HEAD'],
        ctx.projectRoot,
      ).catch(() => '0\t0');

      // Parse status
      const staged: string[] = [];
      const unstaged: string[] = [];
      const untracked: string[] = [];

      for (const line of status.split('\n')) {
        if (!line) continue;
        const indexStatus = line[0];
        const workingStatus = line[1];
        const file = line.slice(3);

        if (indexStatus === '?') {
          untracked.push(file);
        } else {
          if (indexStatus !== ' ' && indexStatus !== '?') {
            staged.push(`${indexStatus} ${file}`);
          }
          if (workingStatus !== ' ' && workingStatus !== '?') {
            unstaged.push(`${workingStatus} ${file}`);
          }
        }
      }

      // Parse ahead/behind
      const [behind, ahead] = aheadBehind.trim().split('\t').map(Number);

      return {
        success: true,
        result: {
          branch: branch.trim(),
          staged,
          unstaged,
          untracked,
          stagedCount: staged.length,
          unstagedCount: unstaged.length,
          untrackedCount: untracked.length,
          ahead: ahead || 0,
          behind: behind || 0,
          clean: staged.length === 0 && unstaged.length === 0 && untracked.length === 0,
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

    proc.on('error', (err) => {
      reject(err);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `git exited with code ${code}`));
      }
    });
  });
}
