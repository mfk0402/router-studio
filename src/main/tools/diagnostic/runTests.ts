import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { RegisteredTool, ToolHandlerResult } from '../../../shared/types.js';

interface TestFramework {
  name: string;
  command: string;
  args: string[];
  detectFiles: string[];
  detectPackages: string[];
}

const TEST_FRAMEWORKS: TestFramework[] = [
  {
    name: 'jest',
    command: 'npx',
    args: ['jest', '--passWithNoTests'],
    detectFiles: ['jest.config.js', 'jest.config.ts', 'jest.config.mjs'],
    detectPackages: ['jest', '@jest/core'],
  },
  {
    name: 'vitest',
    command: 'npx',
    args: ['vitest', 'run'],
    detectFiles: ['vitest.config.ts', 'vitest.config.js', 'vitest.config.mjs'],
    detectPackages: ['vitest'],
  },
  {
    name: 'mocha',
    command: 'npx',
    args: ['mocha'],
    detectFiles: ['.mocharc.js', '.mocharc.json', '.mocharc.yaml'],
    detectPackages: ['mocha'],
  },
  {
    name: 'pytest',
    command: 'pytest',
    args: ['-v'],
    detectFiles: ['pytest.ini', 'pyproject.toml', 'setup.cfg'],
    detectPackages: [],
  },
  {
    name: 'go test',
    command: 'go',
    args: ['test', './...'],
    detectFiles: ['go.mod'],
    detectPackages: [],
  },
  {
    name: 'cargo test',
    command: 'cargo',
    args: ['test'],
    detectFiles: ['Cargo.toml'],
    detectPackages: [],
  },
  {
    name: 'npm test',
    command: 'npm',
    args: ['test'],
    detectFiles: ['package.json'],
    detectPackages: [],
  },
];

export const tool: RegisteredTool = {
  name: 'run_tests',
  description:
    'Run tests using the auto-detected test framework. ' +
    'Supports Jest, Vitest, Mocha, pytest, go test, cargo test, and npm test. ' +
    'Optionally run tests for a specific file or pattern.',
  category: 'diagnostic',
  riskLevel: 'medium',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Specific test file or pattern to run. If omitted, runs all tests.',
      },
      framework: {
        type: 'string',
        description: 'Force a specific test framework. If omitted, auto-detects.',
        enum: ['jest', 'vitest', 'mocha', 'pytest', 'go', 'cargo', 'npm'],
      },
      timeoutMs: {
        type: 'integer',
        description: 'Timeout in milliseconds. Default is 120000 (2 minutes).',
      },
    },
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    if (!ctx.projectRoot) {
      return { success: false, error: 'No project folder is open.' };
    }

    const testPath = args.path ? String(args.path) : undefined;
    const forceFramework = args.framework ? String(args.framework) : undefined;
    const timeoutMs = Math.min(Number(args.timeoutMs) || 120000, 300000);

    try {
      // Detect or use forced framework
      let framework: TestFramework | undefined;

      if (forceFramework) {
        framework = TEST_FRAMEWORKS.find((f) =>
          f.name.toLowerCase().includes(forceFramework.toLowerCase()),
        );
        if (!framework) {
          return { success: false, error: `Unknown test framework: ${forceFramework}` };
        }
      } else {
        framework = await detectTestFramework(ctx.projectRoot);
      }

      if (!framework) {
        return {
          success: false,
          error:
            'Could not detect test framework. Try specifying the framework parameter.',
        };
      }

      // Build command
      const cmd = framework.command;
      const cmdArgs = [...framework.args];

      // Add test path if specified
      if (testPath) {
        cmdArgs.push(testPath);
      }

      ctx.sendProgress(`Running tests with ${framework.name}...`);

      // Run tests
      const result = await runCommand(cmd, cmdArgs, ctx.projectRoot, timeoutMs);

      return {
        success: result.exitCode === 0,
        result: {
          framework: framework.name,
          command: `${cmd} ${cmdArgs.join(' ')}`,
          exitCode: result.exitCode,
          stdout: result.stdout.slice(0, 50000),
          stderr: result.stderr.slice(0, 10000),
          timedOut: result.timedOut,
          durationMs: result.durationMs,
        },
        error: result.exitCode !== 0 ? `Tests failed (exit code ${result.exitCode})` : undefined,
      };
    } catch (e) {
      return { success: false, error: `Test execution failed: ${(e as Error).message}` };
    }
  },
};

async function detectTestFramework(projectRoot: string): Promise<TestFramework | undefined> {
  // Check for framework-specific config files
  for (const framework of TEST_FRAMEWORKS) {
    for (const file of framework.detectFiles) {
      try {
        await fs.access(path.join(projectRoot, file));
        return framework;
      } catch {
        // File doesn't exist
      }
    }
  }

  // Check package.json for test framework dependencies
  try {
    const pkgPath = path.join(projectRoot, 'package.json');
    const pkgContent = await fs.readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(pkgContent);
    const deps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };

    for (const framework of TEST_FRAMEWORKS) {
      for (const pkgName of framework.detectPackages) {
        if (deps[pkgName]) {
          return framework;
        }
      }
    }

    // Fallback to npm test if package.json exists with a test script
    if (pkg.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') {
      return TEST_FRAMEWORKS.find((f) => f.name === 'npm test');
    }
  } catch {
    // No package.json
  }

  return undefined;
}

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
}

async function runCommand(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();

    const proc = spawn(cmd, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
      env: {
        ...process.env,
        CI: 'true',
        FORCE_COLOR: '0',
      },
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
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
