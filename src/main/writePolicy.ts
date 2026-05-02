import type { AppSettings } from '../shared/types.js';

/** Same semantics as tools/index globToRegex (single glob, ** supported). */
export function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/{{GLOBSTAR}}/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function matchesAnyGlob(relativePath: string, globs: string[]): boolean {
  const norm = relativePath.replace(/\\/g, '/');
  for (const g of globs) {
    if (!g.trim()) continue;
    try {
      if (globToRegex(g.trim()).test(norm)) return true;
    } catch {
      continue;
    }
  }
  return false;
}

/**
 * Enforce deny globs, allow-by-default / deny-by-default policy for agent writes.
 */
export function assertWriteAllowed(
  settings: AppSettings,
  relativePath: string,
): { ok: true } | { ok: false; error: string } {
  const norm = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');

  if (matchesAnyGlob(norm, settings.writeDenyPaths ?? [])) {
    return {
      ok: false,
      error: `Write blocked: path matches a deny-pattern (Settings → Agent write safety).`,
    };
  }

  if (settings.agentWriteDenyDefault) {
    const allows = settings.writeAllowPaths ?? [];
    if (allows.length === 0) {
      return {
        ok: false,
        error:
          'Deny-by-default is on and the write allow list is empty. Add path globs in Settings, or turn off deny-by-default.',
      };
    }
    if (!matchesAnyGlob(norm, allows)) {
      return {
        ok: false,
        error: `Write blocked by deny-by-default: "${norm}" does not match any entry in write allow paths.`,
      };
    }
  }

  return { ok: true };
}
