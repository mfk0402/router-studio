import type { ProductMode } from '../../shared/types';

const PREFIX_RE = /^(?:@(chat|learn|edit|agent|architect|review|ship))\s+/i;

/** True if `m` is a valid ProductMode token. */
function asProductMode(raw: string): ProductMode | undefined {
  const x = raw.toLowerCase() as ProductMode;
  if (
    x === 'chat' ||
    x === 'learn' ||
    x === 'edit' ||
    x === 'agent' ||
    x === 'architect' ||
    x === 'review' ||
    x === 'ship'
  ) {
    return x;
  }
  return undefined;
}

/**
 * Strip leading `@chat ` / `@agent ` style prefix for a one-shot mode override (tools + system prompt).
 */
export function stripInlineModePrefix(text: string): {
  stripped: string;
  modeOverride?: ProductMode;
} {
  const m = text.match(PREFIX_RE);
  if (!m?.[1]) return { stripped: text };
  const mode = asProductMode(m[1]);
  if (!mode) return { stripped: text };
  const stripped = text.slice(m[0].length).trimStart();
  return { stripped, modeOverride: mode };
}
