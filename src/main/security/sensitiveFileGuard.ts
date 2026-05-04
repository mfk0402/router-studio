import { promises as fs } from 'node:fs';
import path from 'node:path';

const POLICY_REL = path.join('.routerstudio', 'policy.json');

function looksSensitive(relativePath: string): boolean {
  const p = relativePath.replace(/\\/g, '/').toLowerCase();
  if (p.includes('.env')) return true;
  if (p.endsWith('.pem') || p.endsWith('.key')) return true;
  if (p.includes('id_rsa') || p.includes('id_ed25519')) return true;
  if (p.includes('/secrets/') || p.includes('/credentials')) return true;
  return false;
}

async function policyAllowsSensitive(projectRoot: string): Promise<boolean> {
  try {
    const abs = path.join(projectRoot, POLICY_REL);
    const raw = await fs.readFile(abs, 'utf8');
    const j = JSON.parse(raw) as { allowSensitiveReads?: boolean };
    return Boolean(j.allowSensitiveReads);
  } catch {
    return false;
  }
}

/** Block reads/writes of obvious secret material unless policy explicitly allows. */
export async function assertSensitivePathAllowed(
  projectRoot: string | null | undefined,
  relativePath: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!projectRoot) return { ok: true };
  if (!looksSensitive(relativePath)) return { ok: true };
  const ok = await policyAllowsSensitive(projectRoot);
  if (!ok) {
    return {
      ok: false,
      error: `Sensitive path blocked: ${relativePath}. Create ${POLICY_REL.replace(/\\/g, '/')} with {"allowSensitiveReads": true} to allow reads/writes (use with care).`,
    };
  }
  return { ok: true };
}
