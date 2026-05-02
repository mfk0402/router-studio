/**
 * Diagnostics Runner - Executes TypeScript, ESLint, and other linters
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { Diagnostic, DiagnosticsByFile, DiagnosticSeverity } from '../shared/diagnostics.js';
import { getRoot } from './fileSystem.js';

/**
 * Parse TypeScript compiler output
 */
function parseTscOutput(output: string, rootPath: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = output.split('\n');

  // TSC format: file(line,col): error TS1234: message
  const pattern = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/;

  for (const line of lines) {
    const match = line.match(pattern);
    if (match) {
      const [, filePath, lineStr, colStr, severity, code, message] = match;
      const absPath = path.isAbsolute(filePath) ? filePath : path.join(rootPath, filePath);
      const relPath = path.relative(rootPath, absPath);

      diagnostics.push({
        id: randomUUID(),
        file: relPath.replace(/\\/g, '/'),
        range: {
          start: { line: parseInt(lineStr, 10), column: parseInt(colStr, 10) },
          end: { line: parseInt(lineStr, 10), column: parseInt(colStr, 10) + 1 },
        },
        severity: severity === 'error' ? 'error' : 'warning',
        message,
        source: 'typescript',
        code,
      });
    }
  }

  return diagnostics;
}

/**
 * Parse ESLint JSON output
 */
function parseEslintOutput(output: string, rootPath: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  try {
    const results = JSON.parse(output) as Array<{
      filePath: string;
      messages: Array<{
        ruleId: string | null;
        severity: 1 | 2;
        message: string;
        line: number;
        column: number;
        endLine?: number;
        endColumn?: number;
      }>;
    }>;

    for (const file of results) {
      const relPath = path.relative(rootPath, file.filePath).replace(/\\/g, '/');

      for (const msg of file.messages) {
        const severity: DiagnosticSeverity = msg.severity === 2 ? 'error' : 'warning';

        diagnostics.push({
          id: randomUUID(),
          file: relPath,
          range: {
            start: { line: msg.line, column: msg.column },
            end: { line: msg.endLine ?? msg.line, column: msg.endColumn ?? msg.column + 1 },
          },
          severity,
          message: msg.message,
          source: 'eslint',
          code: msg.ruleId || undefined,
        });
      }
    }
  } catch {
    // Failed to parse JSON output
  }

  return diagnostics;
}

/**
 * Parse Python (flake8/pylint) output
 */
function parsePythonLinterOutput(output: string, rootPath: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = output.split('\n');

  // flake8 format: file:line:col: CODE message
  // pylint format: file:line:col: CODE: message
  const pattern = /^(.+?):(\d+):(\d+):\s*([A-Z]\d+):?\s+(.+)$/;

  for (const line of lines) {
    const match = line.match(pattern);
    if (match) {
      const [, filePath, lineStr, colStr, code, message] = match;
      const relPath = path.relative(rootPath, filePath).replace(/\\/g, '/');

      // Determine severity from code prefix
      let severity: DiagnosticSeverity = 'warning';
      if (code.startsWith('E') || code.startsWith('F')) {
        severity = 'error';
      } else if (code.startsWith('W')) {
        severity = 'warning';
      } else if (code.startsWith('C') || code.startsWith('R')) {
        severity = 'info';
      }

      diagnostics.push({
        id: randomUUID(),
        file: relPath,
        range: {
          start: { line: parseInt(lineStr, 10), column: parseInt(colStr, 10) },
          end: { line: parseInt(lineStr, 10), column: parseInt(colStr, 10) + 1 },
        },
        severity,
        message,
        source: 'python',
        code,
      });
    }
  }

  return diagnostics;
}

/**
 * Run a command and capture output
 */
async function runCommand(
  cmd: string,
  args: string[],
  cwd: string,
  timeout = 60000,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd,
      shell: process.platform === 'win32',
      stdio: 'pipe',
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      proc.kill();
      resolve({ stdout, stderr, code: null });
    }, timeout);

    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });

    proc.on('error', () => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: -1 });
    });
  });
}

/**
 * Check if a command exists
 */
async function commandExists(cmd: string): Promise<boolean> {
  const testCmd = process.platform === 'win32' ? 'where' : 'which';
  const { code } = await runCommand(testCmd, [cmd], process.cwd(), 5000);
  return code === 0;
}

/**
 * Run TypeScript compiler
 */
export async function runTypeScript(rootPath: string): Promise<Diagnostic[]> {
  // Check for tsconfig.json
  try {
    await fs.access(path.join(rootPath, 'tsconfig.json'));
  } catch {
    return [];
  }

  // Try npx tsc first, then tsc
  const { stdout, stderr } = await runCommand('npx', ['tsc', '--noEmit', '--pretty', 'false'], rootPath);
  const output = stdout + stderr;

  return parseTscOutput(output, rootPath);
}

/**
 * Run ESLint
 */
export async function runEslint(rootPath: string): Promise<Diagnostic[]> {
  // Check for eslint config
  const configs = ['.eslintrc', '.eslintrc.js', '.eslintrc.json', '.eslintrc.yml', 'eslint.config.js'];
  let hasConfig = false;
  for (const config of configs) {
    try {
      await fs.access(path.join(rootPath, config));
      hasConfig = true;
      break;
    } catch {
      // Not found
    }
  }
  if (!hasConfig) return [];

  const { stdout } = await runCommand(
    'npx',
    ['eslint', '.', '--format', 'json', '--max-warnings', '-1'],
    rootPath,
  );

  return parseEslintOutput(stdout, rootPath);
}

/**
 * Run Python linters (flake8 or pylint)
 */
export async function runPythonLinter(rootPath: string): Promise<Diagnostic[]> {
  // Check for Python files
  const pyFiles = await fs.readdir(rootPath, { recursive: true }).catch(() => []);
  const hasPython = (pyFiles as string[]).some((f) => f.endsWith('.py'));
  if (!hasPython) return [];

  // Try flake8 first
  if (await commandExists('flake8')) {
    const { stdout } = await runCommand('flake8', ['.', '--format=default'], rootPath);
    return parsePythonLinterOutput(stdout, rootPath);
  }

  // Try pylint
  if (await commandExists('pylint')) {
    const { stdout } = await runCommand('pylint', ['--output-format=text', '.'], rootPath);
    return parsePythonLinterOutput(stdout, rootPath);
  }

  return [];
}

/**
 * Run all available diagnostic tools
 */
export async function runAllDiagnostics(): Promise<DiagnosticsByFile> {
  const rootPath = getRoot();
  if (!rootPath) return {};

  const [tsDiags, eslintDiags, pyDiags] = await Promise.all([
    runTypeScript(rootPath).catch(() => []),
    runEslint(rootPath).catch(() => []),
    runPythonLinter(rootPath).catch(() => []),
  ]);

  const allDiags = [...tsDiags, ...eslintDiags, ...pyDiags];

  // Group by file
  const byFile: DiagnosticsByFile = {};
  for (const diag of allDiags) {
    if (!byFile[diag.file]) {
      byFile[diag.file] = [];
    }
    byFile[diag.file].push(diag);
  }

  // Sort each file's diagnostics by line number
  for (const file of Object.keys(byFile)) {
    byFile[file].sort((a, b) => a.range.start.line - b.range.start.line);
  }

  return byFile;
}

/**
 * Run diagnostics for a specific file
 */
export async function runDiagnosticsForFile(filePath: string): Promise<Diagnostic[]> {
  const rootPath = getRoot();
  if (!rootPath) return [];

  const ext = path.extname(filePath).toLowerCase();

  if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
    // Run TypeScript/ESLint for JS/TS files
    const [tsDiags, eslintDiags] = await Promise.all([
      runTypeScript(rootPath).catch(() => []),
      runEslint(rootPath).catch(() => []),
    ]);

    return [...tsDiags, ...eslintDiags].filter((d) => d.file === filePath || d.file === filePath.replace(/\\/g, '/'));
  }

  if (ext === '.py') {
    const pyDiags = await runPythonLinter(rootPath).catch(() => []);
    return pyDiags.filter((d) => d.file === filePath || d.file === filePath.replace(/\\/g, '/'));
  }

  return [];
}
