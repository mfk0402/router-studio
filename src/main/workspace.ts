import { spawn } from 'node:child_process';
import { dialog, BrowserWindow } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Native picker for a parent directory (e.g. where to clone a repository).
 */
export async function pickParentDirectory(win: BrowserWindow | null): Promise<string | null> {
  const options: Electron.OpenDialogOptions = {
    title: 'Select folder to clone into',
    properties: ['openDirectory', 'createDirectory'],
  };
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
}

function cloneDirectoryName(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '').replace(/^git@[^:]+:/, '');
  let base = trimmed.replace(/\.git$/i, '');
  const slashIdx = Math.max(base.lastIndexOf('/'), base.lastIndexOf('\\'));
  if (slashIdx >= 0) base = base.slice(slashIdx + 1);
  base = base.replace(/[^a-zA-Z0-9._-]/g, '_');
  return base || 'repository';
}

export type GitCloneResult =
  | { ok: true; projectPath: string }
  | { ok: false; error: string };

/**
 * Run `git clone` under `parentDir`. Requires a system `git` on PATH.
 */
export async function gitCloneRepository(repoUrl: string, parentDir: string): Promise<GitCloneResult> {
  const cleanUrl = repoUrl.trim();
  if (!cleanUrl) {
    return { ok: false, error: 'Repository URL is empty' };
  }

  const resolvedParent = path.resolve(parentDir);
  try {
    const st = await fs.stat(resolvedParent);
    if (!st.isDirectory()) {
      return { ok: false, error: 'Parent path is not a directory' };
    }
  } catch {
    return { ok: false, error: 'Parent folder does not exist' };
  }

  const dirName = cloneDirectoryName(cleanUrl);
  const dest = path.join(resolvedParent, dirName);
  try {
    await fs.access(dest);
    return { ok: false, error: `Target folder already exists: ${dirName}` };
  } catch {
    /* expected — clone target should not exist */
  }

  const result = await new Promise<{ code: number | null; stderr: string }>((resolve) => {
    const child = spawn('git', ['clone', cleanUrl, dirName], {
      cwd: resolvedParent,
      windowsHide: true,
    });
    let stderr = '';
    child.stderr?.on('data', (d) => {
      stderr += String(d);
    });
    child.on('error', (err) => {
      resolve({ code: -1, stderr: err.message });
    });
    child.on('close', (code) => resolve({ code, stderr }));
  });

  if (result.code !== 0) {
    const msg = result.stderr.trim() || `git clone failed (exit ${result.code})`;
    return { ok: false, error: msg };
  }

  return { ok: true, projectPath: dest };
}
