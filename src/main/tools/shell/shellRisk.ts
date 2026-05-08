/** Pure shell risk scoring for approval UX (no Electron / settings). */

export type ShellRiskScore = 0 | 1 | 2 | 3 | 4 | 5;

/** Score shell commands for approval UX (0 = calm, 5 = destructive / pipe-to-shell). */
export function scoreShellCommand(command: string): {
  score: ShellRiskScore;
  reasons: string[];
  saferAlternative?: string;
} {
  const cmd = command.trim();
  const reasons: string[] = [];
  let score: ShellRiskScore = 0;

  if (/curl\s+.+\|\s*(bash|sh|zsh)/i.test(cmd) || /wget\s+.+\|\s*(bash|sh|zsh)/i.test(cmd)) {
    reasons.push('Downloads piped into a shell');
    score = 4;
  }
  if (/\bsudo\b/i.test(cmd) || /\bmkfs\b/i.test(cmd) || /chmod\s+777\s+\//i.test(cmd)) {
    reasons.push('Elevated or broad filesystem permission change');
    score = Math.max(score, 5) as ShellRiskScore;
  }
  if (/\brm\s+(-rf?|--recursive)\b/i.test(cmd) || /\bdel\s+\/[sf]/i.test(cmd)) {
    reasons.push('Recursive / forced delete');
    score = Math.max(score, 3) as ShellRiskScore;
  }
  if (/\b(npm|pnpm|yarn)\s+install\b|\bpip\s+install\b/i.test(cmd)) {
    reasons.push('Package install');
    score = Math.max(score, 2) as ShellRiskScore;
  }
  if (/\b(git|npm|pnpm|yarn)\s+publish\b/i.test(cmd)) {
    reasons.push('Publish / release');
    score = Math.max(score, 4) as ShellRiskScore;
  }
  if (
    /\b(npm|pnpm|yarn)\s+(run\s+)?test\b|\bjest\b|\bvitest\b|\bmocha\b|\bpytest\b|\bgo\s+test\b|\bcargo\s+test\b|\btsc\b|\beslint\b/i.test(
      cmd,
    )
  ) {
    reasons.push('Tests / static checks');
    score = Math.max(score, 1) as ShellRiskScore;
  }

  let saferAlternative: string | undefined;
  if (score >= 4 && /curl\s+.+\|\s*bash/i.test(cmd)) {
    saferAlternative = 'curl -o setup.sh <url> && review file && bash setup.sh';
  }

  return { score, reasons, saferAlternative };
}
