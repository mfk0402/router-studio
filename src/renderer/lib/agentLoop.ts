/**
 * Parse and drive the [[TASK_COMPLETE / CONTINUE / BLOCKED / ERROR]] protocol.
 *
 * Design notes
 * - Markers live in the assistant's rendered text — the parser strips any
 *   surrounding whitespace and looks at the tail of the message.
 * - We intentionally don't remove the marker from the displayed message; it's
 *   useful context for the user and simple to skim.
 * - Partial/legacy responses without a marker default to 'unknown', and the
 *   caller should treat them as terminal (i.e. NOT auto-continue). Silently
 *   re-prompting a model that hasn't been told about the protocol is how you
 *   burn money in a runaway loop.
 */

export type MarkerKind = 'complete' | 'continue' | 'blocked' | 'error' | 'unknown';

export interface ParsedMarker {
  kind: MarkerKind;
  /** Everything inside the bracketed token, e.g. "BLOCKED: need api key". */
  raw: string | null;
  /** The free-form reason for BLOCKED/ERROR, or null otherwise. */
  reason: string | null;
}

// Accept optional leading whitespace and trailing punctuation. Case-insensitive.
const MARKER_RE = /\[\[\s*(TASK[_ ]COMPLETE|CONTINUE|BLOCKED(?:\s*:\s*[^\]]*)?|ERROR(?:\s*:\s*[^\]]*)?)\s*\]\]/gi;

export function parseLastMarker(text: string): ParsedMarker {
  if (!text) return { kind: 'unknown', raw: null, reason: null };

  let last: RegExpExecArray | null = null;
  MARKER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  // Walk all matches and keep the last one — this matters because sometimes
  // the model will *describe* the markers earlier in its reply while citing
  // the protocol itself. The definitive signal is the final one.
  while ((m = MARKER_RE.exec(text)) !== null) {
    last = m;
  }
  if (!last) return { kind: 'unknown', raw: null, reason: null };

  const inner = last[1].trim();
  const upper = inner.toUpperCase();

  if (upper.startsWith('TASK_COMPLETE') || upper.startsWith('TASK COMPLETE')) {
    return { kind: 'complete', raw: inner, reason: null };
  }
  if (upper === 'CONTINUE') {
    return { kind: 'continue', raw: inner, reason: null };
  }
  if (upper.startsWith('BLOCKED')) {
    const idx = inner.indexOf(':');
    const reason = idx >= 0 ? inner.slice(idx + 1).trim() : '';
    return { kind: 'blocked', raw: inner, reason: reason || null };
  }
  if (upper.startsWith('ERROR')) {
    const idx = inner.indexOf(':');
    const reason = idx >= 0 ? inner.slice(idx + 1).trim() : '';
    return { kind: 'error', raw: inner, reason: reason || null };
  }
  return { kind: 'unknown', raw: inner, reason: null };
}

/** Generate a short human title from the user's initial goal. */
export function deriveTaskTitle(goal: string): string {
  const clean = goal.replace(/\s+/g, ' ').trim();
  if (clean.length <= 60) return clean || 'Untitled task';
  return clean.slice(0, 57) + '…';
}

/** Generate an id safe for both URLs and filenames. */
export function newTaskId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `task-${Date.now().toString(36)}-${rand}`;
}

/** True when the user likely expects real repo edits (not advice-only). Used to reject premature [[TASK_COMPLETE]]. */
export function looksLikeConcreteRepoWork(goal: string): boolean {
  const g = goal.trim();
  if (g.length < 10) return false;
  if (/\b(across|throughout)\s+(?:the\s+)?(?:codebase|project|repo)\b/i.test(g)) return true;
  if (/\bmulti[- ]file\b/i.test(g)) return true;
  if (/\blarge(r)?\s+refactor\b/i.test(g)) return true;
  if (
    /\b(migrate|renaming|refactor)\b/i.test(g) &&
    /\b(codebase|project|repo|files?|modules?|folders?)\b/i.test(g)
  )
    return true;
  if (/\b(fix|implement|apply|patch)\s+(?:all|these|every|those|them)\b/i.test(g)) return true;
  if (/\bfix\b[\s\S]{0,220}\b(issue|bug|file|files|code|codebase|project|change)s?\b/i.test(g)) return true;
  return (
    /\b(fix|implement|apply|patch|refactor|change|update|correct)\b/i.test(g) &&
    /\b(code|file|files|codebase|project|repo|typescript|javascript|\bts\b|tsx|jsx|rust|python)\b/i.test(g)
  );
}
