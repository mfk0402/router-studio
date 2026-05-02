/**
 * Lightweight shell command heuristics (not a full parser).
 */
export function shellStaticHints(command: string): string[] {
  const hints: string[] = [];
  const trim = command.trim();

  if (/\|\s*(?:bash|sh|zsh|pwsh)\b/i.test(trim)) {
    hints.push('Command pipes into a shell interpreter (review the pipe source carefully).');
  }
  if (/(?:^|[;&\|])\s*curl\b[^\n]*\|/i.test(command)) {
    hints.push('curl may be piping remote content — verify the upstream URL and payload.');
  }
  if (/(?:^|[;&\|])\s*wget\b[^\n]*\|/i.test(command)) {
    hints.push('wget may be piping remote content.');
  }
  if (/\b(base64\s+-d|base64\s+--decode)\b.*\|/i.test(command)) {
    hints.push('Base64 decode in a pipeline can hide destructive payloads.');
  }
  if (/(?:^|[;&])(?:\s*)rm\b.*/i.test(command) && command.split(/[;&|]/).length > 1) {
    hints.push('rm appears in a compound command — confirm each segment.');
  }
  if (/>[>&]?\s*(\/etc\/|C:\\\\Windows\\\\System32)/i.test(command)) {
    hints.push('Redirects target a system directory.');
  }

  return hints;
}
