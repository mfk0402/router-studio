/**
 * Lightweight MCP server row probe: spawn short-lived process, capture early stderr/stdout.
 */

import { spawn } from 'node:child_process';
import type { McpServerConfig } from '../shared/types.js';

export async function probeMcpServerRow(
  row: McpServerConfig,
  timeoutMs = 5000,
): Promise<{ ok: boolean; exitCode: number | null; preview: string; error?: string }> {
  const cmd = String(row.command ?? '').trim();
  if (!cmd) {
    return { ok: false, exitCode: null, preview: '', error: 'Empty command' };
  }
  const args = Array.isArray(row.args) ? row.args.map((a) => String(a)) : [];

  return new Promise((resolve) => {
    let preview = '';
    const child = spawn(cmd, args, {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, CI: 'true' },
    });

    const cap = (s: string) => (s.length > 1200 ? s.slice(0, 1200) + '…' : s);

    child.stdout?.on('data', (d: Buffer) => {
      preview += d.toString();
      preview = cap(preview);
    });
    child.stderr?.on('data', (d: Buffer) => {
      preview += d.toString();
      preview = cap(preview);
    });

    const t = setTimeout(() => {
      try {
        child.kill('SIGTERM');
      } catch {
        /* noop */
      }
      setTimeout(() => {
        try {
          if (!child.killed) child.kill('SIGKILL');
        } catch {
          /* noop */
        }
      }, 900);
      resolve({
        ok: false,
        exitCode: null,
        preview,
        error: `Probe timed out after ${timeoutMs}ms (process was terminated; MCP servers often run until stdin closes).`,
      });
    }, timeoutMs);

    child.on('error', (e) => {
      clearTimeout(t);
      resolve({
        ok: false,
        exitCode: null,
        preview,
        error: e instanceof Error ? e.message : String(e),
      });
    });

    child.on('close', (code) => {
      clearTimeout(t);
      resolve({
        ok: code === 0,
        exitCode: code,
        preview,
        error: code !== 0 ? `Exited with code ${code}` : undefined,
      });
    });
  });
}
