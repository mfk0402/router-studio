import { spawn } from 'node:child_process';
import type { RegisteredTool, ToolHandlerResult } from '../../../shared/types.js';

export const tool: RegisteredTool = {
  name: 'git_commit',
  description:
    'Create a git commit with the specified message. Only commits already-staged changes by default. ' +
    'Use addAll to stage and commit all changes.',
  category: 'git',
  riskLevel: 'high',
  schema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'Commit message. First line is the subject, subsequent lines are the body.',
      },
      addAll: {
        type: 'boolean',
        description: 'If true, stage all changes before committing (like git commit -a). Default is false.',
      },
    },
    required: ['message'],
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    if (!ctx.projectRoot) {
      return { success: false, error: 'No project folder is open.' };
    }

    const message = String(args.message ?? '');
    const addAll = Boolean(args.addAll);

    if (!message.trim()) {
      return { success: false, error: 'Commit message is required.' };
    }

    try {
      // Check for staged changes
      const statusBefore = await runGit(['status', '--porcelain'], ctx.projectRoot);
      const hasStaged = statusBefore.split('\n').some((line) => {
        const indexStatus = line[0];
        return indexStatus !== ' ' && indexStatus !== '?' && indexStatus !== undefined;
      });

      if (!hasStaged && !addAll) {
        return {
          success: false,
          error: 'No staged changes to commit. Stage changes first or use addAll=true.',
        };
      }

      // Build commit command
      const gitArgs = ['commit'];
      if (addAll) {
        gitArgs.push('-a');
      }
      gitArgs.push('-m', message);

      const output = await runGit(gitArgs, ctx.projectRoot);

      // Get the new commit hash
      const hash = await runGit(['rev-parse', 'HEAD'], ctx.projectRoot);

      return {
        success: true,
        result: {
          hash: hash.trim(),
          message: message.split('\n')[0],
          output: output.trim(),
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
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
      },
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
