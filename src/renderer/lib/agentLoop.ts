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
