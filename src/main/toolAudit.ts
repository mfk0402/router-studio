import { app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const AUDIT_FILENAME = 'tool-audit.jsonl';

function auditPath(): string {
  return path.join(app.getPath('userData'), AUDIT_FILENAME);
}

export async function appendToolAuditLine(entry: Record<string, unknown>): Promise<void> {
  try {
    const line = JSON.stringify(entry) + '\n';
    await fs.appendFile(auditPath(), line, 'utf8');
  } catch (e) {
    console.error('[tool-audit] append failed', e);
  }
}

export async function readToolAuditTail(maxLines: number): Promise<string[]> {
  const cap = Math.min(Math.max(1, maxLines), 5000);
  try {
    const raw = await fs.readFile(auditPath(), 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    return lines.slice(-cap);
  } catch {
    return [];
  }
}

export function getToolAuditFilePath(): string {
  return auditPath();
}
