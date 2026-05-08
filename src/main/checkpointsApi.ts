import { app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  WorkspaceCheckpointPayload,
  WorkspaceCheckpointSummary,
} from '../shared/types.js';

const CHECKPOINTS_SUBDIR = 'workspace-checkpoints';

export function checkpointsUserDataDir(): string {
  return path.join(app.getPath('userData'), CHECKPOINTS_SUBDIR);
}

function normalizeRel(p: string): string {
  return String(p ?? '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
}

async function collectFilePaths(
  projectRoot: string,
  relativePath: string,
  maxFiles = 80,
): Promise<string[]> {
  const rootResolved = path.resolve(projectRoot);
  const rootWithSep = rootResolved.endsWith(path.sep) ? rootResolved : rootResolved + path.sep;
  const withinRoot = (abs: string) => abs === rootResolved || abs.startsWith(rootWithSep);
  const rel = normalizeRel(relativePath);
  if (!rel || rel.includes('..')) return [];
  const abs = path.resolve(rootResolved, rel);
  if (!withinRoot(abs)) return [];
  try {
    const st = await fs.stat(abs);
    if (st.isFile()) return [rel];
    if (!st.isDirectory()) return [];
  } catch {
    return [];
  }

  const out: string[] = [];
  async function walk(dirAbs: string): Promise<void> {
    if (out.length >= maxFiles) return;
    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
    try {
      entries = await fs.readdir(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= maxFiles) return;
      const childAbs = path.join(dirAbs, entry.name);
      const childRel = path.relative(rootResolved, childAbs).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'out') continue;
        await walk(childAbs);
      } else if (entry.isFile()) {
        out.push(childRel);
      }
    }
  }
  await walk(abs);
  return out;
}

function parsePayload(raw: string): WorkspaceCheckpointPayload | null {
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const id = typeof j.id === 'string' ? j.id : '';
    const label = typeof j.label === 'string' ? j.label : '';
    const createdAt = typeof j.createdAt === 'number' ? j.createdAt : 0;
    const projectRoot = typeof j.projectRoot === 'string' ? j.projectRoot : '';
    const filesRaw = j.files;
    if (!id || !label || !projectRoot || !Array.isArray(filesRaw)) return null;
    const files: Array<{ path: string; content: string }> = [];
    for (const row of filesRaw) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const rp = normalizeRel(String(r.path ?? ''));
      const content = r.content != null ? String(r.content) : '';
      if (!rp || rp.includes('..')) continue;
      files.push({ path: rp, content });
    }
    if (files.length === 0) return null;
    return { id, label, createdAt, projectRoot, files };
  } catch {
    return null;
  }
}

export async function listCheckpointSummaries(): Promise<WorkspaceCheckpointSummary[]> {
  const dir = checkpointsUserDataDir();
  let names: string[] = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  const jsonFiles = names.filter((n) => n.endsWith('.json'));
  const out: WorkspaceCheckpointSummary[] = [];
  for (const name of jsonFiles) {
    const id = name.replace(/\.json$/i, '');
    try {
      const raw = await fs.readFile(path.join(dir, name), 'utf8');
      const p = parsePayload(raw);
      if (!p) continue;
      out.push({
        id: p.id,
        label: p.label,
        createdAt: p.createdAt,
        fileCount: p.files.length,
        capturedRoot: p.projectRoot,
      });
    } catch {
      continue;
    }
  }
  out.sort((a, b) => b.createdAt - a.createdAt);
  return out;
}

function checkpointJsonPath(id: string): string | null {
  const safeId = path.basename(String(id ?? '').replace(/[/\\]/g, ''));
  if (!safeId) return null;
  return path.join(checkpointsUserDataDir(), `${safeId}.json`);
}

export async function readCheckpoint(id: string): Promise<WorkspaceCheckpointPayload | null> {
  const fp = checkpointJsonPath(id);
  if (!fp) return null;
  try {
    const raw = await fs.readFile(fp, 'utf8');
    return parsePayload(raw);
  } catch {
    return null;
  }
}

export async function saveWorkspaceCheckpoint(
  projectRoot: string,
  label: string,
  relativePaths: string[],
): Promise<WorkspaceCheckpointSummary | null> {
  const rootResolved = path.resolve(projectRoot);
  const rootWithSep = rootResolved.endsWith(path.sep) ? rootResolved : rootResolved + path.sep;
  const withinRoot = (abs: string) => abs === rootResolved || abs.startsWith(rootWithSep);
  const unique = new Set<string>();
  for (const raw of relativePaths) {
    const collected = await collectFilePaths(rootResolved, raw);
    for (const rel of collected) unique.add(rel);
  }

  const files: Array<{ path: string; content: string }> = [];
  for (const rel of unique) {
    const abs = path.resolve(rootResolved, rel);
    if (!withinRoot(abs)) continue;
    try {
      const st = await fs.stat(abs);
      if (!st.isFile() || st.size > 2_000_000) continue;
      const content = await fs.readFile(abs, 'utf8');
      if (content.includes('\0')) continue;
      files.push({ path: rel, content });
    } catch {
      continue;
    }
  }
  if (files.length === 0) return null;

  const dir = checkpointsUserDataDir();
  await fs.mkdir(dir, { recursive: true });
  const id = randomUUID();
  const payload: WorkspaceCheckpointPayload = {
    id,
    label: label.trim() || 'Agent checkpoint',
    createdAt: Date.now(),
    projectRoot: rootResolved,
    files,
  };
  await fs.writeFile(path.join(dir, `${id}.json`), JSON.stringify(payload, null, 2), 'utf8');
  return {
    id,
    label: payload.label,
    createdAt: payload.createdAt,
    fileCount: files.length,
    capturedRoot: rootResolved,
  };
}

/** Removes the checkpoint JSON from userData. Returns ok:false if id is invalid or file missing. */
export async function deleteCheckpoint(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const fp = checkpointJsonPath(id);
  if (!fp) {
    return { ok: false, error: 'Invalid checkpoint id.' };
  }
  try {
    await fs.unlink(fp);
    return { ok: true };
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      return { ok: false, error: 'Checkpoint not found.' };
    }
    return { ok: false, error: `Failed to delete checkpoint: ${err.message}` };
  }
}

export async function restoreCheckpoint(
  checkpointId: string,
  targetProjectRoot: string,
): Promise<{ ok: true; written: string[] } | { ok: false; error: string }> {
  const payload = await readCheckpoint(checkpointId);
  if (!payload) {
    return { ok: false, error: 'Checkpoint not found or invalid.' };
  }
  const rootResolved = path.resolve(targetProjectRoot);
  const rootWithSep = rootResolved.endsWith(path.sep) ? rootResolved : rootResolved + path.sep;
  const withinRoot = (abs: string) => abs === rootResolved || abs.startsWith(rootWithSep);

  const written: string[] = [];
  for (const f of payload.files) {
    const rel = normalizeRel(f.path);
    if (!rel || rel.includes('..')) {
      return { ok: false, error: `Invalid path in checkpoint: ${f.path}` };
    }
    const abs = path.resolve(rootResolved, rel);
    if (!withinRoot(abs)) {
      return { ok: false, error: `Path escapes project: ${rel}` };
    }
    try {
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, f.content, 'utf8');
      written.push(rel.replace(/\\/g, '/'));
    } catch (e) {
      return { ok: false, error: `Write failed (${rel}): ${(e as Error).message}` };
    }
  }
  return { ok: true, written };
}
