/**
 * Heuristic detection for prompt-injection style phrases inside tool output / fetched text.
 */
const PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: 'ignore_previous_instructions', re: /ignore\s+(all\s+)?(previous|prior)\s+instructions/i },
  /** Avoid matching benign docs that mention “system prompt”; require directive-style wording nearby. */
  {
    label: 'override_system',
    re:
      /\b(?:ignore|disregard|forget|discard|omit|circumvent|bypass)\b[\s\S]{0,120}\bsystem\b[\s_*`'"-]{0,3}prompt\b|\b(?:override|rewrite|replace)\s+(?:the\s+)?(?:entire\s+)?system\b[\s_*`'"-]{0,3}prompt\b|\bdeveloper\s*(?:\/|-|\s)?\s*message\b[\s\S]{0,140}\b(?:ignore|override|replace|discard)\b|\b(?:new|replacement|alternate)\s+system\s*prompt\b\s*:/i,
  },
  { label: 'exfiltrate', re: /exfiltrate|send\s+(me\s+)?(your|the)\s*(api\s*)?key/i },
  { label: 'disable_safety', re: /disable\s+(safety|filters|moderation)/i },
  { label: 'bash_revoke', re: /;\s*sudo\s+|curl\s+.+\|\s*(bash|sh)/i },
];

export function detectSuspiciousContent(text: string): { flagged: boolean; patterns: string[] } {
  const hits: string[] = [];
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    if (p.re.test(text)) hits.push(p.label);
  }
  return { flagged: hits.length > 0, patterns: hits };
}
