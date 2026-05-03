import { dialog, BrowserWindow } from 'electron';
import { promises as fs } from 'node:fs';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import type { FileEntry } from '../shared/types.js';

/**
 * All file operations are sandboxed to a single "project root" directory
 * chosen by the user via the native folder picker. All paths passed in
 * from the renderer are treated as RELATIVE to the root, joined safely,
 * and rejected if they escape the root.
 */

let projectRoot: string | null = null;

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'out',
  'build',
  '.turbo',
  '.cache',
  '.vite',
  'release',
]);

const MAX_ENTRIES = 10_000;

export function getRoot(): string | null {
  return projectRoot;
}

export async function setRoot(root: string): Promise<boolean> {
  try {
    const stat = await fs.stat(root);
    if (!stat.isDirectory()) return false;
    projectRoot = path.resolve(root);
    return true;
  } catch {
    return false;
  }
}

export async function openFolder(win?: BrowserWindow | null): Promise<string | null> {
  const options: Electron.OpenDialogOptions = {
    title: 'Open Project Folder',
    properties: ['openDirectory', 'createDirectory'],
  };
  // IMPORTANT: passing `undefined` as the first arg of showOpenDialog on Windows
  // causes the dialog to open behind the main window (or fail silently). Always
  // anchor the dialog to the main window when one is available.
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) return null;
  const picked = result.filePaths[0];
  const ok = await setRoot(picked);
  return ok ? projectRoot : null;
}

function requireRoot(): string {
  if (!projectRoot) {
    throw new Error('No project folder is open. Use "Open Folder" first.');
  }
  return projectRoot;
}

function resolveSafe(relativePath: string): string {
  const root = requireRoot();
  // Normalize separators and strip leading slashes.
  const cleaned = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const abs = path.resolve(root, cleaned);
  const rel = path.relative(root, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Path traversal blocked: ' + relativePath);
  }
  return abs;
}

export async function listFiles(): Promise<FileEntry | null> {
  if (!projectRoot) return null;
  const root = projectRoot;
  let count = 0;

  async function walk(abs: string, rel: string, name: string): Promise<FileEntry> {
    const node: FileEntry = {
      name,
      path: abs,
      relativePath: rel.replace(/\\/g, '/') || '.',
      isDirectory: true,
      children: [],
    };
    let entries: Dirent[];
    try {
      entries = (await fs.readdir(abs, { withFileTypes: true })) as Dirent[];
    } catch {
      return node;
    }
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });
    for (const e of entries) {
      if (count++ > MAX_ENTRIES) break;
      if (e.isDirectory() && SKIP_DIRS.has(e.name)) continue;
      if (e.name.startsWith('.') && SKIP_DIRS.has(e.name)) continue;
      const childAbs = path.join(abs, e.name);
      const childRel = path.join(rel, e.name);
      if (e.isDirectory()) {
        node.children!.push(await walk(childAbs, childRel, e.name));
      } else if (e.isFile()) {
        node.children!.push({
          name: e.name,
          path: childAbs,
          relativePath: childRel.replace(/\\/g, '/'),
          isDirectory: false,
        });
      }
    }
    return node;
  }

  return walk(root, '', path.basename(root));
}

export async function readFile(relativePath: string): Promise<string> {
  const abs = resolveSafe(relativePath);
  return fs.readFile(abs, 'utf8');
}

/** Like readFile, but returns null if the file is missing (ENOENT). Other errors still throw. */
export async function readFileIfExists(relativePath: string): Promise<string | null> {
  const abs = resolveSafe(relativePath);
  try {
    return await fs.readFile(abs, 'utf8');
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
    throw e;
  }
}

export async function writeFile(relativePath: string, content: string): Promise<void> {
  const abs = resolveSafe(relativePath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, 'utf8');
}

export async function createFile(relativePath: string, content = ''): Promise<void> {
  const abs = resolveSafe(relativePath);
  try {
    await fs.access(abs);
    throw new Error('File already exists: ' + relativePath);
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      if (e instanceof Error && e.message.startsWith('File already exists')) throw e;
    }
  }
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, 'utf8');
}

export async function deleteFile(relativePath: string): Promise<void> {
  const abs = resolveSafe(relativePath);
  const stat = await fs.stat(abs);
  if (stat.isDirectory()) {
    await fs.rm(abs, { recursive: true, force: true });
  } else {
    await fs.unlink(abs);
  }
}

export async function renameFile(oldRel: string, newRel: string): Promise<void> {
  const oldAbs = resolveSafe(oldRel);
  const newAbs = resolveSafe(newRel);
  await fs.mkdir(path.dirname(newAbs), { recursive: true });
  await fs.rename(oldAbs, newAbs);
}

export async function searchFiles(query: string): Promise<FileEntry[]> {
  if (!projectRoot || !query) return [];
  const q = query.toLowerCase();
  const root = projectRoot;
  const results: FileEntry[] = [];
  let count = 0;

  async function walk(abs: string, rel: string): Promise<void> {
    if (results.length >= 200 || count > MAX_ENTRIES) return;
    let entries: Dirent[];
    try {
      entries = (await fs.readdir(abs, { withFileTypes: true })) as Dirent[];
    } catch {
      return;
    }
    for (const e of entries) {
      if (results.length >= 200) return;
      count++;
      if (e.isDirectory() && SKIP_DIRS.has(e.name)) continue;
      const childAbs = path.join(abs, e.name);
      const childRel = path.join(rel, e.name);
      if (e.isDirectory()) {
        await walk(childAbs, childRel);
      } else {
        if (e.name.toLowerCase().includes(q) || childRel.toLowerCase().includes(q)) {
          results.push({
            name: e.name,
            path: childAbs,
            relativePath: childRel.replace(/\\/g, '/'),
            isDirectory: false,
          });
        }
      }
    }
  }

  await walk(root, '');
  return results;
}

export async function backupFile(relativePath: string): Promise<string> {
  const abs = resolveSafe(relativePath);
  const backupPath = abs + '.bak.' + Date.now();
  try {
    await fs.copyFile(abs, backupPath);
  } catch {
    // ignore if source doesn't exist yet
  }
  return backupPath;
}
