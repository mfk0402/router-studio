import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store/appStore';
import { PRODUCT_ROADMAP, roadmapCounts, type RoadmapStatus } from '@shared/roadmap';

function StatusBadge({ status }: { status: RoadmapStatus }) {
  const cls =
    status === 'shipped'
      ? 'border-success/30 bg-success/12 text-success'
      : status === 'in_progress'
        ? 'border-accent/35 bg-accent/12 text-accent'
        : 'border-border-soft bg-bg-soft text-fg-muted';
  const label =
    status === 'shipped' ? 'Shipped' : status === 'in_progress' ? 'In progress' : 'Planned';
  return (
    <span
      className={`whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {label}
    </span>
  );
}

export default function RoadmapModal() {
  const open = useApp((s) => s.showRoadmap);
  const setOpen = useApp((s) => s.setShowRoadmap);
  const [filter, setFilter] = useState<RoadmapStatus | 'all'>('all');

  const counts = useMemo(() => roadmapCounts(), [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  const filterCls = (active: boolean) =>
    `rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors duration-layout ${
      active ? 'bg-accent/15 text-accent' : 'text-fg-muted hover:bg-bg-hover hover:text-fg'
    }`;

  if (!open) return null;

  return (
    <div
      className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border-soft bg-bg-elevated shadow-float ring-1 ring-subtle"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border-soft px-5 py-4 shadow-chrome">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-fg">Product roadmap</h2>
              <p className="mt-1 max-w-xl text-xs leading-relaxed text-fg-muted">
                Living backlog for Router Studio — also tracked in{' '}
                <code className="rounded bg-bg-soft px-1 font-mono text-[10px] text-fg-subtle">
                  src/shared/roadmap.ts
                </code>
                .
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-[10px] text-fg-subtle">Escape to close</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-border-soft bg-bg-soft px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg"
              >
                Close
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-fg-subtle">
            <span>
              <strong className="text-success">{counts.shipped}</strong> shipped
            </span>
            <span className="text-border">·</span>
            <span>
              <strong className="text-accent">{counts.in_progress}</strong> in progress
            </span>
            <span className="text-border">·</span>
            <span>
              <strong className="text-fg-muted">{counts.planned}</strong> planned
            </span>
            <span className="ml-auto hidden sm:inline">Filter:</span>
            <div className="flex flex-wrap gap-1">
              {(['all', 'shipped', 'in_progress', 'planned'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={filterCls(filter === key)}
                  onClick={() => setFilter(key)}
                >
                  {key === 'all' ? 'All' : key === 'in_progress' ? 'In progress' : key === 'shipped' ? 'Shipped' : 'Planned'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-8">
            {PRODUCT_ROADMAP.map((phase) => {
              const items =
                filter === 'all' ? phase.items : phase.items.filter((i) => i.status === filter);
              if (items.length === 0) return null;
              return (
                <section key={phase.id}>
                  <div className="sticky top-0 z-[1] -mx-2 mb-3 bg-bg-elevated/95 px-2 py-2 backdrop-blur-sm">
                    <h3 className="text-sm font-semibold text-fg">{phase.title}</h3>
                    {phase.summary && (
                      <p className="mt-0.5 text-[11px] leading-snug text-fg-muted">{phase.summary}</p>
                    )}
                  </div>
                  <ul className="space-y-2">
                    {items.map((item) => (
                      <li
                        key={item.id}
                        className="flex gap-3 rounded-lg border border-border-soft bg-bg-soft/80 px-3 py-2.5 transition-colors hover:border-border"
                      >
                        <div className="pt-0.5">
                          <StatusBadge status={item.status} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-fg">{item.title}</div>
                          {item.detail && (
                            <p className="mt-1 text-[11px] leading-snug text-fg-muted">{item.detail}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>

        <div className="border-t border-border-soft px-5 py-3">
          <p className="text-[11px] leading-snug text-fg-subtle">
            Open from the command palette with <kbd className="rounded border border-border-soft bg-bg-deep px-1 font-mono text-[10px]">roadmap</kbd>,{' '}
            <kbd className="rounded border border-border-soft bg-bg-deep px-1 font-mono text-[10px]">backlog</kbd>, or{' '}
            <kbd className="rounded border border-border-soft bg-bg-deep px-1 font-mono text-[10px]">features</kbd>. Longer notes:{' '}
            <code className="rounded bg-bg-soft px-1 font-mono text-[10px] text-fg-muted">docs/ROADMAP.md</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
