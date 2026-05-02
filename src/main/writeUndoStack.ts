import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface WriteUndoEntry {
  relativePath: string;
  /** null = file did not exist before the mutating tool ran */
  previousContent: string | null;
}

const stack: WriteUndoEntry[] = [];
const MAX_ENTRIES = 40;

export function pushWriteUndo(projectRoot: string, relativePath: string, previousContent: string | null): void {
  void projectRoot;
  const norm = relativePath.replace(/\\/g, '/');
  stack.push({ relativePath: norm, previousContent });
  while (stack.length > MAX_ENTRIES) {
    stack.shift();
  }
}

export function clearWriteUndoStack(): void {
  stack.length = 0;
}

export async function undoAllWriteSnapshots(
  projectRoot: string,
): Promise<{ restored: string[]; deleted: string[]; errors: string[] }> {
  const restored: string[] = [];
  const deleted: string[] = [];
  const errors: string[] = [];

  while (stack.length > 0) {
    const entry = stack.pop()!;
    const abs = path.resolve(projectRoot, entry.relativePath);
    if (!abs.startsWith(path.resolve(projectRoot))) {
      errors.push(`Skipped (path escape): ${entry.relativePath}`);
      continue;
    }
    try {
      if (entry.previousContent === null) {
        try {
          await fs.unlink(abs);
          deleted.push(entry.relativePath);
        } catch (e) {
          errors.push(`${entry.relativePath}: ${(e as Error).message}`);
        }
      } else {
        const dir = path.dirname(abs);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(abs, entry.previousContent, 'utf8');
        restored.push(entry.relativePath);
      }
    } catch (e) {
      errors.push(`${entry.relativePath}: ${(e as Error).message}`);
    }
  }

  return { restored, deleted, errors };
}

export function writeUndoDepth(): number {
  return stack.length;
}
