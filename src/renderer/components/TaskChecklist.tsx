import type { TaskPlanStep } from '../../shared/types';

const STATUS_ICON: Record<TaskPlanStep['status'], string> = {
  pending: '○',
  running: '◐',
  ok: '✓',
  fail: '✗',
  skipped: '⊘',
};

export function TaskChecklist({
  steps,
  className = '',
  showHeader = true,
}: {
  steps: TaskPlanStep[];
  className?: string;
  /** When false, omit the Plan heading (e.g. inside an enclosing details summary). */
  showHeader?: boolean;
}) {
  if (!steps.length) return null;
  return (
    <div className={'mb-3 rounded-lg border border-border-soft bg-bg-soft/60 px-3 py-2 text-[11px] ' + className}>
      {showHeader ? (
        <div className="mb-1.5 font-semibold uppercase tracking-wide text-fg-subtle">Plan</div>
      ) : null}
      <ul className="space-y-1 text-fg-muted">
        {steps.map((s) => (
          <li key={s.id} className="flex items-start gap-2">
            <span className="shrink-0 font-mono text-fg" title={s.status}>
              {STATUS_ICON[s.status]}
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-fg">{s.label}</span>
              {s.detail ? (
                <span className="mt-0.5 block text-[10px] text-fg-subtle">{s.detail}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
