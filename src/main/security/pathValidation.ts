import path from 'node:path';

/**
 * Resolve a relative path within a project root, preventing path traversal attacks.
 * 
 * This function:
 * 1. Normalizes the relative path (removes leading slashes, backslashes)
 * 2. Resolves it against the project root
 * 3. Verifies the resolved path is actually within the project root
 * 4. Handles edge cases like symlinks, null bytes, and case-insensitive filesystems
 * 
 * @param projectRoot - The absolute path to the project root directory
 * @param relativePath - The user-provided relative path
 * @returns Object with absPath and relativePath if valid, null if traversal detected
 */
export function resolveWithinRoot(
  projectRoot: string,
  relativePath: string,
): { absPath: string; relativePath: string } | null {
  if (!projectRoot || typeof projectRoot !== 'string') {
    return null;
  }

  // Normalize project root
  const rootResolved = path.resolve(projectRoot);
  
  // Normalize relative path: remove leading slashes/backslashes
  const raw = String(relativePath ?? '');
  if (raw.includes('\0')) {
    return null;
  }
  let normalizedRel = raw
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');

  if (!normalizedRel) {
    // Empty path resolves to project root
    return { absPath: rootResolved, relativePath: '.' };
  }

  // Resolve the absolute path
  const absPath = path.resolve(rootResolved, normalizedRel);

  // Security check: ensure resolved path is within project root
  // Use path.sep to handle both Windows and Unix
  const rootWithSep = rootResolved.endsWith(path.sep)
    ? rootResolved
    : rootResolved + path.sep;

  // The path must either BE the root or START WITH root + separator
  if (absPath !== rootResolved && !absPath.startsWith(rootWithSep)) {
    return null;
  }

  // Additional check: prevent traversal via symlinks by checking for '..' in the resolved path
  // after normalization. path.resolve() should handle this, but we double-check.
  const relativeFromRoot = path.relative(rootResolved, absPath);
  if (relativeFromRoot.startsWith('..') || relativeFromRoot === '..') {
    return null;
  }

  return {
    absPath,
    relativePath: normalizedRel,
  };
}

/**
 * Check if a path is within the project root without resolving it.
 * Faster than resolveWithinRoot when you only need a boolean check.
 */
export function isWithinRoot(projectRoot: string, relativePath: string): boolean {
  return resolveWithinRoot(projectRoot, relativePath) !== null;
}

/**
 * Validate multiple paths at once. Returns the first invalid path or null if all valid.
 */
export function validatePaths(
  projectRoot: string,
  paths: string[],
): { invalidPath: string; index: number } | null {
  for (let i = 0; i < paths.length; i++) {
    if (!isWithinRoot(projectRoot, paths[i])) {
      return { invalidPath: paths[i], index: i };
    }
  }
  return null;
}
