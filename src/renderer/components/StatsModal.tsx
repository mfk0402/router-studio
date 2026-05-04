import { useCallback, useEffect, useState } from 'react';
import type { LocalUsageStats } from '../../shared/types';
import { useApp } from '../store/appStore';
import { toast } from './ToastContainer';

function formatInt(n: number): string {
  return new Intl.NumberFormat().format(Math.floor(n));
}

function formatTs(ms: number): string {
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return '—';
  }
}

export default function StatsModal() {
  const open = useApp((s) => s.showUsageStats);
  const setOpen = useApp((s) => s.setShowUsageStats);
  const [stats, setStats] = useState<LocalUsageStats | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const s = await window.api.stats.get();
      setStats(s);
    } catch (e) {
      toast.error('Could not load local statistics', (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const handleReset = async () => {
    if (
      !window.confirm(
        'Reset all local usage counters? This does not affect chat history or settings.',
      )
    ) {
      return;
    }
    try {
      const next = await window.api.stats.reset();
      setStats(next);
      toast.success('Local statistics reset');
    } catch (e) {
      toast.error('Reset failed', (e as Error).message);
    }
  };

  if (!open) return null;

  return (
    <div
      className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="glass-panel glass-modal-lg flex w-full max-w-lg flex-col overflow-hidden ds-transition ring-1 ring-subtle"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border-soft px-5 py-4 shadow-chrome">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-fg">Local usage statistics</h2>
              <p className="mt-1 text-xs leading-relaxed text-fg-muted">
                Aggregates completions and agent tool runs from this machine only. Stored under your
                app user-data folder — nothing is sent to Router Studio.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="shrink-0 rounded-md border border-border-soft bg-bg-soft px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg"
            >
              Close
            </button>
          </div>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4 text-sm">
          {loading && !stats ? (
            <p className="text-fg-muted">Loading…</p>
          ) : stats ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="API completions (attempted)" value={formatInt(stats.completionsRecorded)} />
                <StatCard label="Successful completions" value={formatInt(stats.completionsSuccess)} />
                <StatCard label="Failed completions" value={formatInt(stats.completionsFailure)} />
                <StatCard label="Tool runs succeeded" value={formatInt(stats.toolRunsSuccess)} />
                <StatCard label="Tool runs denied / error" value={formatInt(stats.toolRunsFailure)} />
              </div>
              <div className="rounded-md border border-border-soft bg-bg-soft p-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
                  Tokens (from provider usage reports)
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-fg-muted">Prompt tokens · </span>
                    <span className="font-mono text-fg">{formatInt(stats.promptTokens)}</span>
                  </div>
                  <div>
                    <span className="text-fg-muted">Completion tokens · </span>
                    <span className="font-mono text-fg">{formatInt(stats.completionTokens)}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-fg-muted">Cached prompt tokens · </span>
                    <span className="font-mono text-fg">{formatInt(stats.cachedPromptTokens)}</span>
                  </div>
                </div>
                <p className="mt-2 text-[10px] text-fg-subtle">
                  Totals increment when OpenRouter returns usage fields (streaming final chunks or
                  non-stream responses). Estimates are not mixed in here.
                </p>
              </div>
              <div className="text-[11px] text-fg-subtle">
                <span className="text-fg-muted">Recording started:</span> {formatTs(stats.createdAt)}
                <br />
                <span className="text-fg-muted">Last update:</span> {formatTs(stats.updatedAt)}
              </div>
            </>
          ) : (
            <p className="text-fg-muted">No data loaded.</p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border-soft bg-bg-soft px-5 py-3">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="rounded-md border border-border-soft px-3 py-1.5 text-xs font-medium text-fg-muted hover:bg-bg-hover hover:text-fg disabled:opacity-50"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="rounded-md border border-danger/35 bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/15"
          >
            Reset counters
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border-soft bg-bg-soft p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-fg-muted">{label}</div>
      <div className="mt-1 font-mono text-lg text-fg">{value}</div>
    </div>
  );
}
