/**
 * Heuristic detection for prompt-injection style phrases inside tool output / fetched text.
 */
const PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: 'ignore_previous_instructions', re: /ignore\s+(all\s+)?(previous|prior)\s+instructions/i },
  { label: 'override_system', re: /system\s*prompt|developer\s*message.*override/i },
  { label: 'exfiltrate', re: /exfiltrate|send\s+(me\s+)?(your|the)\s*(api\s*)?key/i },
  { label: 'disable_safety', re: /disable\s+(safety|filters|moderation)/i },
  { label: 'bash_revoke', re: /;\s*sudo\s+|curl\s+.+\|\s*(bash|sh)/i },
];

export function detectSuspiciousContent(text: string): { flagged: boolean; patterns: string[] } {
  const hits: string[] = [];
  for (const p of PATTERNS) {
    if (p.re.test(text)) hits.push(p.label);
  }
  return { flagged: hits.length > 0, patterns: hits };
}
