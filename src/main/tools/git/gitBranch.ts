import { spawn } from 'node:child_process';
import type { RegisteredTool, ToolHandlerResult } from '../../../shared/types.js';

export const tool: RegisteredTool = {
  name: 'git_branch',
  description:
    'Manage git branches: list all branches, create a new branch, checkout a branch, or delete a branch.',
  category: 'git',
  riskLevel: 'medium',
  schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Action to perform: "list", "create", "checkout", or "delete".',
        enum: ['list', 'create', 'checkout', 'delete'],
      },
      name: {
        type: 'string',
        description: 'Branch name (required for create, checkout, delete).',
      },
      startPoint: {
        type: 'string',
        description: 'For create: starting commit/branch. Default is HEAD.',
      },
    },
    required: ['action'],
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    if (!ctx.projectRoot) {
      return { success: false, error: 'No project folder is open.' };
    }

    const action = String(args.action);
    const name = args.name ? String(args.name) : undefined;
    const startPoint = args.startPoint ? String(args.startPoint) : undefined;

    try {
      switch (action) {
        case 'list': {
          const output = await runGit(['branch', '-a', '-v'], ctx.projectRoot);
          const current = await runGit(['branch', '--show-current'], ctx.projectRoot);
          const branches = output
            .split('\n')
            .filter(Boolean)
            .map((line) => ({
              name: line.slice(2).split(/\s+/)[0],
              isCurrent: line.startsWith('*'),
              isRemote: line.includes('remotes/'),
            }));

          return {
            success: true,
            result: {
              current: current.trim(),
              branches,
              count: branches.length,
            },
          };
        }

        case 'create': {
          if (!name) {
            return { success: false, error: 'Branch name is required for create.' };
          }
          const gitArgs = ['branch', name];
          if (startPoint) {
            gitArgs.push(startPoint);
          }
          await runGit(gitArgs, ctx.projectRoot);
          return {
            success: true,
            result: {
              action: 'created',
              branch: name,
              startPoint: startPoint ?? 'HEAD',
            },
          };
        }

        case 'checkout': {
          if (!name) {
            return { success: false, error: 'Branch name is required for checkout.' };
          }
          await runGit(['checkout', name], ctx.projectRoot);
          return {
            success: true,
            result: {
              action: 'checked out',
              branch: name,
            },
          };
        }

        case 'delete': {
          if (!name) {
            return { success: false, error: 'Branch name is required for delete.' };
          }
          // Use -d (safe delete) not -D
          await runGit(['branch', '-d', name], ctx.projectRoot);
          return {
            success: true,
            result: {
              action: 'deleted',
              branch: name,
            },
          };
        }

        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
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
