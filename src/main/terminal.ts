import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import type { BrowserWindow } from 'electron';
import type { TerminalEvent } from '../shared/types.js';
import { randomUUID } from 'node:crypto';

/**
 * Cross-platform shell session manager built on child_process.spawn.
 *
 * Notes on the intentional scope:
 * - No native PTY (no node-pty) so the app stays install-clean on Windows /
 *   macOS / Linux with zero native compilation.
 * - Without a PTY, full-screen TUI programs (vim, htop, interactive REPLs)
 *   won't render correctly. Simple command-and-output workflows work well.
 * - A "session" is a long-lived shell process; stdin is pipe-fed with
 *   commands. Output is streamed back as raw bytes (with ANSI codes intact
 *   when possible) so xterm.js can render colors.
 */

interface Session {
  id: string;
  shell: string;
  cwd: string;
  proc: ChildProcessWithoutNullStreams;
}

const sessions = new Map<string, Session>();

function defaultShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'powershell.exe';
  }
  return process.env.SHELL || '/bin/bash';
}

function shellArgs(shell: string): string[] {
  const base = path.basename(shell).toLowerCase();
  if (base.startsWith('powershell') || base.startsWith('pwsh')) {
    return ['-NoLogo', '-NoProfile'];
  }
  if (base.startsWith('cmd')) {
    return [];
  }
  // bash/zsh/sh
  return ['-i'];
}

function commandTerminator(shell: string): string {
  const base = path.basename(shell).toLowerCase();
  if (base.startsWith('cmd')) return '\r\n';
  return '\n';
}

export function startSession(
  opts: { shell?: string; cwd?: string },
  win: BrowserWindow | null,
): { sessionId: string; shell: string; cwd: string } {
  const shell = opts.shell && opts.shell.trim() ? opts.shell : defaultShell();
  const cwd = opts.cwd || os.homedir();
  const id = randomUUID();

  const proc = spawn(shell, shellArgs(shell), {
    cwd,
    env: { ...process.env, TERM: 'xterm-256color', FORCE_COLOR: '1' },
    windowsHide: true,
  });

  const emit = (evt: Omit<TerminalEvent, 'sessionId'>) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('terminal:event', { ...evt, sessionId: id });
    }
  };

  proc.stdout.setEncoding('utf8');
  proc.stderr.setEncoding('utf8');
  proc.stdout.on('data', (chunk: string) => emit({ type: 'data', data: chunk }));
  proc.stderr.on('data', (chunk: string) => emit({ type: 'data', data: chunk }));

  proc.on('error', (err) => emit({ type: 'error', error: err.message }));
  proc.on('close', (code) => {
    emit({ type: 'exit', exitCode: code });
    sessions.delete(id);
  });

  sessions.set(id, { id, shell, cwd, proc });

  // Tell the UI the shell is up.
  setImmediate(() => emit({ type: 'started', shell, cwd }));

  return { sessionId: id, shell, cwd };
}

export function writeToSession(sessionId: string, data: string): void {
  const s = sessions.get(sessionId);
  if (!s) throw new Error('Terminal session not found: ' + sessionId);
  if (!s.proc.stdin.writable) throw new Error('Terminal stdin closed.');
  s.proc.stdin.write(data);
}

export function runCommand(sessionId: string, command: string): void {
  const s = sessions.get(sessionId);
  if (!s) throw new Error('Terminal session not found: ' + sessionId);
  if (!s.proc.stdin.writable) throw new Error('Terminal stdin closed.');
  s.proc.stdin.write(command + commandTerminator(s.shell));
}

export function killSession(sessionId: string): void {
  const s = sessions.get(sessionId);
  if (!s) return;
  try {
    if (process.platform === 'win32') {
      // Best-effort: ensure the child tree is killed on Windows.
      spawn('taskkill', ['/pid', String(s.proc.pid), '/f', '/t'], { windowsHide: true });
    } else {
      s.proc.kill('SIGTERM');
    }
  } catch {
    // ignore
  }
  sessions.delete(sessionId);
}

export function resizeSession(_sessionId: string, _cols: number, _rows: number): void {
  // Without a real PTY we have nothing to resize. Stub out so the IPC
  // contract stays stable and xterm-fit can still call us harmlessly.
}

export function killAllSessions(): void {
  for (const id of Array.from(sessions.keys())) killSession(id);
}
