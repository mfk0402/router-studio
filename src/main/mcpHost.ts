/**
 * MCP client over stdio (JSON-RPC + Content-Length framing) for registry rows in Settings.
 * One long-lived child per server id until stopped or process exits.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-jsonrpc/node.js';
import type { McpServerConfig } from '../shared/types.js';
import { getSettings } from './secureStore.js';

const MCP_PROTOCOL_VERSION = '2024-11-05';

export type McpSessionStatus = {
  serverId: string;
  name: string;
  command: string;
  args: string[];
  pid: number | null;
  alive: boolean;
  initialized: boolean;
  lastStderrTail: string;
};

type InternalSession = {
  row: McpServerConfig;
  proc: ChildProcessWithoutNullStreams;
  conn: ReturnType<typeof createMessageConnection>;
  initialized: boolean;
  stderrTail: string;
};

const sessions = new Map<string, InternalSession>();
/** Serialize start/stop per server id to avoid overlapping spawns. */
const locks = new Map<string, Promise<void>>();

function capTail(s: string, max = 4000): string {
  if (s.length <= max) return s;
  return s.slice(s.length - max);
}

function appendStderr(sess: InternalSession, chunk: Buffer): void {
  sess.stderrTail = capTail(sess.stderrTail + chunk.toString());
}

async function withLock<T>(serverId: string, fn: () => Promise<T>): Promise<T> {
  const prior = locks.get(serverId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const chain = prior.then(() => gate);
  locks.set(serverId, chain);
  await prior;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(serverId) === chain) locks.delete(serverId);
  }
}

function disposeSession(serverId: string): void {
  const s = sessions.get(serverId);
  if (!s) return;
  sessions.delete(serverId);
  try {
    s.conn.dispose();
  } catch {
    /* noop */
  }
  try {
    if (!s.proc.killed) s.proc.kill('SIGTERM');
  } catch {
    /* noop */
  }
}

export function stopSession(serverId: string): void {
  disposeSession(serverId);
}

export function stopAllMcp(): void {
  for (const id of [...sessions.keys()]) {
    disposeSession(id);
  }
}

export function listMcpSessionStatus(): McpSessionStatus[] {
  const out: McpSessionStatus[] = [];
  for (const [serverId, s] of sessions) {
    const alive = !s.proc.killed && s.proc.exitCode === null;
    out.push({
      serverId,
      name: s.row.name,
      command: s.row.command,
      args: s.row.args,
      pid: typeof s.proc.pid === 'number' ? s.proc.pid : null,
      alive,
      initialized: s.initialized && alive,
      lastStderrTail: s.stderrTail.slice(-800),
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

async function bootstrapRow(row: McpServerConfig): Promise<{ ok: true } | { ok: false; error: string }> {
  const cmd = String(row.command ?? '').trim();
  if (!cmd) {
    return { ok: false, error: 'MCP row has an empty command.' };
  }
  const args = Array.isArray(row.args) ? row.args.map((a) => String(a)) : [];

  const child = spawn(cmd, args, {
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
    windowsHide: true,
  });

  const reader = new StreamMessageReader(child.stdout);
  const writer = new StreamMessageWriter(child.stdin);
  const conn = createMessageConnection(reader, writer);

  const sess: InternalSession = {
    row,
    proc: child,
    conn,
    initialized: false,
    stderrTail: '',
  };

  child.stderr?.on('data', (d: Buffer) => appendStderr(sess, d));

  child.on('error', (e) => {
    const msg = e instanceof Error ? e.message : String(e);
    sess.stderrTail = capTail(sess.stderrTail + `\n[spawn] ${msg}\n`);
  });

  child.on('close', () => {
    if (sessions.get(row.id) === sess) {
      sessions.delete(row.id);
    }
  });

  conn.onClose(() => {
    if (sessions.get(row.id) === sess) {
      sessions.delete(row.id);
    }
  });

  conn.onError((args) => {
    const err = args[0];
    const msg = err instanceof Error ? err.message : String(err);
    sess.stderrTail = capTail(sess.stderrTail + `\n[jsonrpc] ${msg}\n`);
  });

  conn.listen();

  try {
    await conn.sendRequest<{ protocolVersion?: string; serverInfo?: { name?: string; version?: string } }>(
      'initialize',
      {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'router-studio', version: '1.0.0' },
      },
    );
    await conn.sendNotification('notifications/initialized', {});
    sess.initialized = true;
    sessions.set(row.id, sess);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      conn.dispose();
    } catch {
      /* noop */
    }
    try {
      if (!child.killed) child.kill('SIGTERM');
    } catch {
      /* noop */
    }
    return {
      ok: false,
      error:
        msg +
        (sess.stderrTail ? `\n--- stderr ---\n${sess.stderrTail.slice(-1200)}` : ''),
    };
  }
}

/**
 * Start or reuse MCP session for a Settings registry id.
 */
export async function ensureMcpSession(
  serverId: string,
  options?: { force?: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sid = String(serverId ?? '').trim();
  if (!sid) {
    return { ok: false, error: 'server_id is required.' };
  }

  return withLock(sid, async () => {
    const existing = sessions.get(sid);
    if (existing && !options?.force) {
      const alive = !existing.proc.killed && existing.proc.exitCode === null;
      if (alive && existing.initialized) {
        return { ok: true };
      }
      disposeSession(sid);
    } else if (existing && options?.force) {
      disposeSession(sid);
    }

    const settings = await getSettings();
    const row = (settings.mcpServers ?? []).find((m) => m.id === sid);
    if (!row) {
      return { ok: false, error: `No MCP row with id "${sid}" in Settings.` };
    }

    return bootstrapRow(row);
  });
}

export async function listMcpTools(
  serverId: string,
): Promise<
  | { ok: true; tools: Array<{ name: string; description?: string; inputSchema?: unknown }> }
  | { ok: false; error: string }
> {
  const boot = await ensureMcpSession(serverId);
  if (!boot.ok) return boot;

  const s = sessions.get(String(serverId).trim());
  if (!s || !s.initialized) {
    return { ok: false, error: 'MCP session not ready.' };
  }

  try {
    const res = (await s.conn.sendRequest('tools/list', {})) as {
      tools?: Array<{ name?: string; description?: string; inputSchema?: unknown }>;
    };
    const raw = Array.isArray(res?.tools) ? res.tools : [];
    const tools = raw
      .map((t) => ({
        name: String(t?.name ?? ''),
        description: typeof t?.description === 'string' ? t.description : undefined,
        inputSchema: t?.inputSchema,
      }))
      .filter((t) => t.name.length > 0);
    return { ok: true, tools };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: msg + (s.stderrTail ? `\n--- stderr ---\n${s.stderrTail.slice(-800)}` : ''),
    };
  }
}

export async function callMcpTool(
  serverId: string,
  toolName: string,
  args: Record<string, unknown> | undefined,
): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  const name = String(toolName ?? '').trim();
  if (!name) {
    return { ok: false, error: 'tool_name is required.' };
  }

  const boot = await ensureMcpSession(serverId);
  if (!boot.ok) return boot;

  const s = sessions.get(String(serverId).trim());
  if (!s || !s.initialized) {
    return { ok: false, error: 'MCP session not ready.' };
  }

  try {
    const res = await s.conn.sendRequest('tools/call', {
      name,
      arguments: args && typeof args === 'object' ? args : {},
    });
    return { ok: true, result: res };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: msg + (s.stderrTail ? `\n--- stderr ---\n${s.stderrTail.slice(-800)}` : ''),
    };
  }
}
