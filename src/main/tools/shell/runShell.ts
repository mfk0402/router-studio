import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import type { RegisteredTool, ToolHandlerResult } from '../../../shared/types.js';
import { getSettings } from '../../secureStore.js';
import { shellStaticHints } from '../../shellStatic.js';

// Dangerous command patterns that are always blocked
const DANGEROUS_PATTERNS = [
  /rm\s+(-rf?|--recursive)\s+[\/\\](?!\w)/i, // rm -rf /
  /rm\s+(-rf?|--recursive)\s+~\//i, // rm -rf ~/
  /rm\s+(-rf?|--recursive)\s+\.\./i, // rm -rf ..
  />\s*\/dev\/sd/i, // write to disk device
  /dd\s+.*of=\/dev/i, // dd to device
  /mkfs/i, // format filesystem
  /chmod\s+777\s+\//i, // chmod 777 /
  /curl\s+.*\|\s*(?:bash|sh|zsh)/i, // curl | bash
  /wget\s+.*\|\s*(?:bash|sh|zsh)/i, // wget | bash
  /:\(\)\{\s*:\|:&\s*\};:/i, // fork bomb
  /\bsudo\s+rm/i, // sudo rm
  /format\s+[a-z]:/i, // Windows format
  /del\s+\/[sfq]\s+[a-z]:\\/i, // Windows del system
];

// Patterns to flag for extra confirmation
const RISKY_PATTERNS = [
  /\brm\b/i,
  /\bdel\b/i,
  /\bsudo\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /npm\s+publish/i,
  /git\s+push\s+.*--force/i,
  /git\s+reset\s+--hard/i,
  /pip\s+install\s+(?!-r)/i,
  /npm\s+install\s+-g/i,
];

export type ShellRiskScore = 0 | 1 | 2 | 3 | 4 | 5;

/** Score shell commands for approval UX (0 = calm, 5 = destructive / pipe-to-shell). */
export function scoreShellCommand(command: string): {
  score: ShellRiskScore;
  reasons: string[];
  saferAlternative?: string;
} {
  const cmd = command.trim();
  const reasons: string[] = [];
  let score: ShellRiskScore = 0;

  if (/curl\s+.+\|\s*(bash|sh|zsh)/i.test(cmd) || /wget\s+.+\|\s*(bash|sh|zsh)/i.test(cmd)) {
    reasons.push('Downloads piped into a shell');
    score = 4;
  }
  if (/\bsudo\b/i.test(cmd) || /\bmkfs\b/i.test(cmd) || /chmod\s+777\s+\//i.test(cmd)) {
    reasons.push('Elevated or broad filesystem permission change');
    score = Math.max(score, 5) as ShellRiskScore;
  }
  if (/\brm\s+(-rf?|--recursive)\b/i.test(cmd) || /\bdel\s+\/[sf]/i.test(cmd)) {
    reasons.push('Recursive / forced delete');
    score = Math.max(score, 3) as ShellRiskScore;
  }
  if (/\b(npm|pnpm|yarn)\s+install\b|\bpip\s+install\b/i.test(cmd)) {
    reasons.push('Package install');
    score = Math.max(score, 2) as ShellRiskScore;
  }
  if (/\b(git|npm|pnpm|yarn)\s+publish\b/i.test(cmd)) {
    reasons.push('Publish / release');
    score = Math.max(score, 4) as ShellRiskScore;
  }
  if (
    /\b(npm|pnpm|yarn)\s+(run\s+)?test\b|\bjest\b|\bvitest\b|\bmocha\b|\bpytest\b|\bgo\s+test\b|\bcargo\s+test\b|\btsc\b|\beslint\b/i.test(
      cmd,
    )
  ) {
    reasons.push('Tests / static checks');
    score = Math.max(score, 1) as ShellRiskScore;
  }

  let saferAlternative: string | undefined;
  if (score >= 4 && /curl\s+.+\|\s*bash/i.test(cmd)) {
    saferAlternative = 'curl -o setup.sh <url> && review file && bash setup.sh';
  }

  return { score, reasons, saferAlternative };
}

export const tool: RegisteredTool = {
  name: 'run_shell',
  description:
    'Execute a shell command and return stdout/stderr. ' +
    'Commands run in the project root directory. ' +
    'Use for: git operations, package managers, build tools, tests. ' +
    'Long-running commands have a timeout.',
  category: 'shell',
  riskLevel: 'high',
  schema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute.',
      },
      cwd: {
        type: 'string',
        description: 'Working directory (relative to project root). Default is project root.',
      },
      timeoutMs: {
        type: 'integer',
        description: 'Timeout in milliseconds. Default is 60000 (1 minute). Max is 300000 (5 min).',
      },
    },
    required: ['command'],
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const command = String(args.command ?? '');
    const cwdRel = args.cwd ? String(args.cwd) : '.';
    const timeoutMs = Math.min(Number(args.timeoutMs) || 60000, 300000);

    if (!ctx.projectRoot) {
      return { success: false, error: 'No project folder is open.' };
    }

    if (!command.trim()) {
      return { success: false, error: 'Command is required.' };
    }

    // Security: check for dangerous patterns
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        return {
          success: false,
          error: `Command blocked for safety: matches dangerous pattern. Command: ${command}`,
        };
      }
    }

    const settings = await getSettings();
    const MAX_USER_REGEX_LEN = 512;
    for (const raw of settings.shellDenylist ?? []) {
      const pat = String(raw ?? '').trim();
      if (!pat || pat.length > MAX_USER_REGEX_LEN) continue;
      try {
        if (new RegExp(pat).test(command)) {
          return {
            success: false,
            error: `Command blocked by shell deny list (Settings): regexp /${pat}/ matched.`,
          };
        }
      } catch {
        continue;
      }
    }

    const staticHints = shellStaticHints(command);
    const cwd = path.resolve(ctx.projectRoot, cwdRel);
    const rootWithSep = ctx.projectRoot.endsWith(path.sep)
      ? ctx.projectRoot
      : ctx.projectRoot + path.sep;
    if (cwd !== ctx.projectRoot && !cwd.startsWith(rootWithSep)) {
      return { success: false, error: 'Working directory must be within the project root.' };
    }

    // Flag risky commands for the preview
    let riskWarning = '';
    for (const pattern of RISKY_PATTERNS) {
      if (pattern.test(command)) {
        riskWarning = ' (⚠️ This command may modify system state)';
        break;
      }
    }

    try {
      const result = await runCommand(command, cwd, timeoutMs);

      return {
        success: result.exitCode === 0,
        result: {
          command,
          cwd: cwdRel,
          exitCode: result.exitCode,
          stdout: truncate(result.stdout, 50000),
          stderr: truncate(result.stderr, 10000),
          timedOut: result.timedOut,
          durationMs: result.durationMs,
          shell_hints: staticHints.length > 0 ? staticHints : undefined,
        },
        error: result.exitCode !== 0 ? `Command exited with code ${result.exitCode}` : undefined,
        preview: `$ ${command}${riskWarning}`,
      };
    } catch (e) {
      return { success: false, error: `Failed to run command: ${(e as Error).message}` };
    }
  },
};

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
}

async function runCommand(
  command: string,
  cwd: string,
  timeoutMs: number,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const isWindows = os.platform() === 'win32';

    const shell = isWindows ? 'cmd.exe' : '/bin/sh';
    const shellArgs = isWindows ? ['/c', command] : ['-c', command];

    const proc = spawn(shell, shellArgs, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
      env: {
        ...process.env,
        // Disable interactive prompts
        GIT_TERMINAL_PROMPT: '0',
        CI: 'true',
      },
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
      // Prevent memory explosion
      if (stdout.length > 100000) {
        stdout = stdout.slice(-80000);
      }
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
      if (stderr.length > 50000) {
        stderr = stderr.slice(-40000);
      }
    });

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
      setTimeout(() => {
        if (!proc.killed) proc.kill('SIGKILL');
      }, 2000);
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        exitCode: code,
        timedOut,
        durationMs: Date.now() - startTime,
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr: stderr + '\n' + err.message,
        exitCode: -1,
        timedOut: false,
        durationMs: Date.now() - startTime,
      });
    });
  });
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + `\n... [truncated ${str.length - max} chars]`;
}
