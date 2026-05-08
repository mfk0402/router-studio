/**
 * Optional TypeScript/JavaScript LSP via typescript-language-server (stdio JSON-RPC).
 * Drives Monaco hover/sync and merges publishDiagnostics into the Problems pipeline.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  createProtocolConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-languageserver-protocol/node.js';
import type { Diagnostic as LSPD } from 'vscode-languageserver-types';
import type { DiagnosticsByFile, Diagnostic, DiagnosticSeverity } from '../shared/diagnostics.js';
import type {
  LspDocumentSymbolWire,
  LspLocationWire,
  LspRangeWire,
  LspWorkspaceSymbolHitWire,
} from '../shared/lspWire.js';

let workspaceRoot: string | null = null;
let proc: ChildProcessWithoutNullStreams | null = null;
let connection: ReturnType<typeof createProtocolConnection> | null = null;
const docVersions = new Map<string, number>();
const diagnosticsByUri = new Map<string, Diagnostic[]>();

function fileUri(relPath: string): string {
  const root = workspaceRoot!;
  const abs = path.resolve(root, relPath.replace(/\//g, path.sep));
  return pathToFileURL(abs).href;
}

function relFromUri(uri: string): string | null {
  if (!workspaceRoot || !uri.startsWith('file:')) return null;
  try {
    const fsPath = fileURLToPath(uri);
    const normRoot = path.resolve(workspaceRoot);
    const rel = path.relative(normRoot, fsPath).replace(/\\/g, '/');
    if (!rel || rel.startsWith('..')) return null;
    return rel;
  } catch {
    return null;
  }
}

function lspSeverity(sev: number | undefined): DiagnosticSeverity {
  switch (sev) {
    case 1:
      return 'error';
    case 2:
      return 'warning';
    case 3:
      return 'info';
    default:
      return 'hint';
  }
}

function convertLsDiagnostic(d: LSPD, sourceFileRel: string): Diagnostic {
  const r = d.range;
  const start = r.start;
  const end = r.end;
  return {
    id: randomUUID(),
    file: sourceFileRel,
    range: {
      start: { line: start.line + 1, column: start.character + 1 },
      end: { line: end.line + 1, column: end.character + 1 },
    },
    severity: lspSeverity(d.severity),
    message: d.message ?? '',
    source: d.source ?? 'lsp',
    code: typeof d.code === 'string' || typeof d.code === 'number' ? String(d.code) : undefined,
  };
}

/** Map of relative path → diagnostics from latest LSP publish. */
export function getLspDiagnosticsByFile(): DiagnosticsByFile {
  const out: DiagnosticsByFile = {};
  for (const [uri, list] of diagnosticsByUri) {
    const rel = relFromUri(uri);
    if (!rel) continue;
    out[rel] = list.slice();
    out[rel]?.sort((a, b) => a.range.start.line - b.range.start.line);
  }
  return out;
}

export function getLspBridgeStatus(): {
  connected: boolean;
  workspace: string | null;
  servers: string[];
  message: string;
} {
  if (!workspaceRoot || !connection || proc?.killed || proc?.exitCode !== null) {
    return {
      connected: false,
      workspace: workspaceRoot,
      servers: [],
      message: disconnectedMessage(),
    };
  }
  return {
    connected: true,
    workspace: workspaceRoot,
    servers: ['typescript-language-server'],
    message:
      'LSP session active — hover, symbols, go-to-definition, find references, and publishDiagnostics from TypeScript/JavaScript LS.',
  };
}

function disconnectedMessage(): string {
  if (!workspaceRoot)
    return 'No workspace folder open. Open a project to enable the language bridge.';
  if (!proc && !connection) return 'LSP idle — toggle Editor → TypeScript LS in Settings or reload after opening a workspace.';
  return 'LSP not connected.';
}

function killSession(): void {
  diagnosticsByUri.clear();
  docVersions.clear();
  try {
    connection?.dispose();
  } catch {
    /* noop */
  }
  connection = null;
  try {
    proc?.kill('SIGTERM');
  } catch {
    /* noop */
  }
  proc = null;
}

async function bootstrapConnection(root: string): Promise<{ ok: true } | { ok: false; error: string }> {
  killSession();
  workspaceRoot = root;

  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const args = ['-y', 'typescript-language-server', '--stdio'];

  try {
    const child = spawn(npx, args, {
      cwd: root,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' },
      windowsHide: true,
    });
    proc = child;

    child.stderr?.on('data', (chunk: Buffer) => {
      const msg = chunk.toString().trim();
      if (msg.length > 0 && msg.length < 5000) console.warn('[lsp] server stderr:', msg.slice(0, 800));
    });

    const reader = new StreamMessageReader(child.stdout);
    const writer = new StreamMessageWriter(child.stdin);
    const conn = createProtocolConnection(reader, writer);
    connection = conn;

    conn.onNotification('textDocument/publishDiagnostics', (params: unknown) => {
      const p = params as { uri?: string; diagnostics?: LSPD[] };
      const uri = p.uri;
      if (!uri || !Array.isArray(p.diagnostics)) return;
      const rel = relFromUri(uri);
      if (!rel) return;
      const converted = (p.diagnostics ?? []).map((x) => convertLsDiagnostic(x, rel));
      diagnosticsByUri.set(uri, converted);
    });

    conn.onClose(() => {
      console.warn('[lsp] language server connection closed');
    });

    conn.onError((args) => {
      console.warn('[lsp] connection error', args[0]?.message ?? args);
    });

    conn.listen();

    const rootUri = pathToFileURL(path.resolve(root)).href;
    const initResult = await conn.sendRequest<any>('initialize', {
      processId: null,
      clientInfo: { name: 'router-studio', version: '1.0.0' },
      rootUri,
      workspaceFolders: [
        {
          uri: rootUri,
          name: path.basename(root),
        },
      ],
      capabilities: {
        textDocument: {
          synchronization: {
            dynamicRegistration: false,
            willSave: false,
            didSave: false,
          },
          hover: { dynamicRegistration: false },
          publishDiagnostics: { relatedInformation: false },
          completion: { dynamicRegistration: false },
          documentSymbol: {
            dynamicRegistration: false,
            hierarchicalDocumentSymbolSupport: true,
          },
          definition: { dynamicRegistration: false },
          references: { dynamicRegistration: false },
        },
        workspace: {
          workspaceFolders: true,
          symbol: {
            dynamicRegistration: false,
          },
        },
      },
      initializationOptions: {},
    }).catch((e: Error) => {
      return Promise.reject(e);
    });

    if (!initResult) {
      return { ok: false, error: 'LSP initialize returned empty result.' };
    }

    await conn.sendNotification('initialized', {});
    console.info('[lsp] typescript-language-server initialized for', root);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[lsp] failed to start:', msg);
    killSession();
    return { ok: false, error: msg };
  }
}

export async function ensureLspForWorkspace(enabled: boolean, root: string | null): Promise<void> {
  if (!enabled || !root) {
    killSession();
    workspaceRoot = null;
    return;
  }
  if (workspaceRoot === root && connection && proc && !proc.killed && proc.exitCode === null) return;
  workspaceRoot = root;
  await bootstrapConnection(root);
}

export function stopAllLsp(): void {
  killSession();
}

export async function lspHover(relPath: string, line: number, character: number): Promise<{ contents?: unknown } | null> {
  if (!connection || !workspaceRoot || proc?.killed) return null;
  const uri = fileUri(relPath);
  try {
    const hover = await connection.sendRequest<{ contents?: unknown }>('textDocument/hover', {
      textDocument: { uri },
      position: {
        line: Math.max(0, line - 1),
        character: Math.max(0, character - 1),
      },
    });
    return hover ?? null;
  } catch (e) {
    console.warn('[lsp] hover failed', e instanceof Error ? e.message : e);
    return null;
  }
}

export type { LspDocumentSymbolWire, LspLocationWire, LspRangeWire, LspWorkspaceSymbolHitWire };

function asLspLocations(raw: unknown): LspLocationWire[] {
  if (raw == null) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const out: LspLocationWire[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if (typeof o.uri === 'string' && o.range && typeof o.range === 'object') {
      out.push({ uri: o.uri, range: o.range as LspRangeWire });
      continue;
    }
    if (
      typeof o.targetUri === 'string' &&
      o.targetSelectionRange &&
      typeof o.targetSelectionRange === 'object'
    ) {
      out.push({
        uri: o.targetUri as string,
        range: o.targetSelectionRange as LspRangeWire,
      });
    } else if (typeof o.targetUri === 'string' && o.targetRange && typeof o.targetRange === 'object') {
      out.push({ uri: o.targetUri as string, range: o.targetRange as LspRangeWire });
    }
  }
  return out;
}

export async function lspDocumentSymbols(relPath: string): Promise<LspDocumentSymbolWire[] | null> {
  if (!connection || !workspaceRoot || proc?.killed) return null;
  const uri = fileUri(relPath);
  try {
    const raw = await connection.sendRequest<unknown>('textDocument/documentSymbol', {
      textDocument: { uri },
    });
    if (!Array.isArray(raw)) return null;
    if (raw.length === 0) return [];
    const head = raw[0] as Record<string, unknown>;
    if ('location' in head) {
      const norm = relPath.replace(/\\/g, '/');
      const leaves: LspDocumentSymbolWire[] = [];
      for (const row of raw as Array<{
        name: string;
        kind?: number;
        containerName?: string;
        location: { uri: string; range: LspRangeWire };
      }>) {
        const lr = relFromUri(row.location.uri);
        if (!lr || lr !== norm) continue;
        leaves.push({
          name: row.name,
          detail: row.containerName,
          kind: row.kind ?? 13,
          range: row.location.range,
          selectionRange: row.location.range,
        });
      }
      return leaves;
    }
    return raw as LspDocumentSymbolWire[];
  } catch (e) {
    console.warn('[lsp] documentSymbol failed', e instanceof Error ? e.message : e);
    return null;
  }
}

export async function lspDefinition(
  relPath: string,
  line: number,
  character: number,
): Promise<LspLocationWire[] | null> {
  if (!connection || !workspaceRoot || proc?.killed) return null;
  const uri = fileUri(relPath);
  try {
    const raw = await connection.sendRequest<unknown>('textDocument/definition', {
      textDocument: { uri },
      position: { line: Math.max(0, line - 1), character: Math.max(0, character - 1) },
    });
    const locs = asLspLocations(raw);
    return locs.length > 0 ? locs : null;
  } catch (e) {
    console.warn('[lsp] definition failed', e instanceof Error ? e.message : e);
    return null;
  }
}

export async function lspReferences(
  relPath: string,
  line: number,
  character: number,
  includeDeclaration = true,
): Promise<LspLocationWire[] | null> {
  if (!connection || !workspaceRoot || proc?.killed) return null;
  const uri = fileUri(relPath);
  try {
    const raw = await connection.sendRequest<unknown>('textDocument/references', {
      textDocument: { uri },
      position: { line: Math.max(0, line - 1), character: Math.max(0, character - 1) },
      context: { includeDeclaration },
    });
    const locs = asLspLocations(raw);
    return locs.length > 0 ? locs : null;
  } catch (e) {
    console.warn('[lsp] references failed', e instanceof Error ? e.message : e);
    return null;
  }
}

const SYMBOL_KIND_LABELS: Record<number, string> = {
  1: 'file',
  2: 'module',
  3: 'namespace',
  4: 'package',
  5: 'class',
  6: 'method',
  7: 'property',
  8: 'field',
  9: 'constructor',
  10: 'enum',
  11: 'interface',
  12: 'function',
  13: 'variable',
  14: 'constant',
};

export async function lspWorkspaceSymbolSearch(query: string): Promise<LspWorkspaceSymbolHitWire[]> {
  if (!connection || !workspaceRoot || proc?.killed || !query.trim()) return [];
  try {
    const raw = await connection.sendRequest<
      Array<{
        name: string;
        kind?: number;
        containerName?: string;
        location: { uri: string; range: LspRangeWire };
      }>
    >('workspace/symbol', { query: query.trim().slice(0, 250) });
    if (!Array.isArray(raw)) return [];
    const out: LspWorkspaceSymbolHitWire[] = [];
    for (const si of raw) {
      if (!si?.location?.uri || !si.location.range?.start) continue;
      const rel = relFromUri(si.location.uri);
      if (!rel) continue;
      const ln = si.location.range.start.line + 1;
      const kind = SYMBOL_KIND_LABELS[si.kind ?? 13] ?? 'symbol';
      out.push({
        name: si.name,
        kind,
        file: rel,
        line: ln,
        column: si.location.range.start.character + 1,
        symbol: si.name,
        preview: si.containerName ? `[${kind}] ${si.containerName}.${si.name}` : `[${kind}] ${si.name}`,
        containerName: si.containerName,
      });
    }
    return out;
  } catch (e) {
    console.warn('[lsp] workspace/symbol failed', e instanceof Error ? e.message : e);
    return [];
  }
}

export function isLspTsJsReady(): boolean {
  return !!(connection && workspaceRoot && proc && !proc.killed && proc.exitCode === null);
}

export async function syncDocument(
  kind: 'open' | 'change' | 'close',
  relPath: string,
  langId: string,
  fullText?: string,
): Promise<void> {
  if (!connection || !workspaceRoot || proc?.killed) return;
  const uri = fileUri(relPath);

  if (kind === 'close') {
    docVersions.delete(uri);
    await connection.sendNotification('textDocument/didClose', {
      textDocument: { uri },
    });
    diagnosticsByUri.delete(uri);
    return;
  }

  const version = (docVersions.get(uri) ?? 0) + 1;
  docVersions.set(uri, version);

  if (kind === 'open') {
    await connection.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: mapLang(langId),
        version,
        text: fullText ?? '',
      },
    });
    return;
  }

  // change — full-sync body
  await connection.sendNotification('textDocument/didChange', {
    textDocument: { uri, version },
    contentChanges: [{ text: fullText ?? '' }],
  });
}

function mapLang(id: string): string {
  if (id === 'typescriptreact') return 'typescriptreact';
  if (id === 'javascriptreact') return 'javascriptreact';
  if (id === 'typescript') return 'typescript';
  if (id === 'javascript') return 'javascript';
  return 'typescript';
}
