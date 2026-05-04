/**
 * Guardrails for agent / tool loops — extend as Router Studio adds telemetry hooks.
 */

export interface StopCheckInput {
  /** Total individual tool executions so far (not model rounds). */
  toolCallsTotal?: number;
  /** Settings → max tool hops (model rounds with tools). */
  maxToolHops?: number;
}

/** Effective cap on tool executions derived from hop budget (rough multiplier). */
function effectiveMaxToolCalls(maxToolHops: number): number {
  if (!maxToolHops || maxToolHops <= 0) return 0;
  return Math.max(maxToolHops * 6, maxToolHops + 10);
}

export function stopReason(input: StopCheckInput): string | null {
  const hops = input.maxToolHops ?? 0;
  const tc = input.toolCallsTotal ?? 0;
  const cap = effectiveMaxToolCalls(hops);
  if (cap > 0 && tc >= cap) {
    return `Reached maximum tool calls (${cap}). Raise **max tool hops** in Settings or narrow the task.`;
  }
  return null;
}

/** Same-step failure ladder for Plan→Build→Verify (renderer can increment externally). */
export function shouldAbortRepeatedStepFailures(count: number): boolean {
  return count >= 3;
}
