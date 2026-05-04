import type { TaskPlanStep, TaskPlanStepStatus } from '../../shared/types';

export function defaultAgentPlan(): TaskPlanStep[] {  return [
    { id: 'discover', label: 'Discover context', status: 'pending' },
    { id: 'plan', label: 'Plan approach', status: 'pending' },
    { id: 'implement', label: 'Implement changes', status: 'pending' },
    { id: 'verify', label: 'Verify (tests / diagnostics)', status: 'pending' },
  ];
}

function normalizeStatus(raw: string): TaskPlanStepStatus {
  const x = raw.toLowerCase();
  if (x === 'skip') return 'skipped';
  if (x === 'ok' || x === 'fail' || x === 'skipped' || x === 'running' || x === 'pending') return x;
  return 'pending';
}

/** Apply [[STEP:id:status]] markers from the assistant message into a copy of `plan`. */
export function applyPlanMarkers(plan: TaskPlanStep[], content: string): TaskPlanStep[] {
  const next = plan.map((s) => ({ ...s }));
  const re = /\[\[STEP:([^:[\]]+):(ok|fail|skip|skipped|running|pending)\]\]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const id = m[1]?.trim();
    const st = normalizeStatus(m[2] ?? '');
    if (!id) continue;
    const row = next.find((x) => x.id === id);
    if (row) row.status = st;
  }
  return next;
}
