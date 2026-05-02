/**
 * Best-effort redaction of common secret patterns in user-visible strings and logs.
 * Not a substitute for never logging secrets — only a safety net.
 */
export function redactSecrets(input: string): string {
  if (!input) return input;
  let out = input;

  // OpenRouter / generic sk-* keys (avoid greedy spanning past token boundaries)
  out = out.replace(/\bsk-or-v1-[A-Za-z0-9_-]{8,}\b/g, 'sk-or-v1-[REDACTED]');
  out = out.replace(/\bsk-(?:proj_|live_|test_)?[A-Za-z0-9]{20,}\b/g, 'sk-[REDACTED]');
  out = out.replace(/\bsk-ant-api\d{2}-[A-Za-z0-9_-]{8,}\b/g, 'sk-ant-api[REDACTED]');

  out = out.replace(/\bBearer\s+[A-Za-z0-9._\-+/=]+\b/gi, 'Bearer [REDACTED]');
  out = out.replace(/\bBasic\s+[A-Za-z0-9+/=]+\b/gi, 'Basic [REDACTED]');

  out = out.replace(/\bAKIA[0-9A-Z]{16}\b/g, 'AKIA[REDACTED]');
  out = out.replace(/\bASIA[0-9A-Z]{16}\b/g, 'ASIA[REDACTED]');

  out = out.replace(/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/gi, 'gh*_REDACTED');
  out = out.replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/gi, 'github_pat_[REDACTED]');

  return out;
}
