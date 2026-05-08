/**
 * Safe error conversion utility.
 * 
 * Converts unknown values to Error instances without type assertions.
 * Use this instead of `as Error` or `as NodeJS.ErrnoException` casts.
 */

export function toError(e: unknown): Error {
  if (e instanceof Error) return e;
  return new Error(String(e));
}

export function toErrnoException(e: unknown): NodeJS.ErrnoException {
  const err = toError(e);
  // Preserve errno properties if they exist
  const errno = (e as Record<string, unknown>)?.errno;
  const code = (e as Record<string, unknown>)?.code;
  const path = (e as Record<string, unknown>)?.path;
  const syscall = (e as Record<string, unknown>)?.syscall;
  
  if (errno !== undefined) (err as NodeJS.ErrnoException).errno = errno as number;
  if (code !== undefined) (err as NodeJS.ErrnoException).code = code as string;
  if (path !== undefined) (err as NodeJS.ErrnoException).path = path as string;
  if (syscall !== undefined) (err as NodeJS.ErrnoException).syscall = syscall as string;
  
  return err as NodeJS.ErrnoException;
}

/**
 * Safely get error message from unknown value.
 */
export function getErrorMessage(e: unknown): string {
  return toError(e).message;
}
