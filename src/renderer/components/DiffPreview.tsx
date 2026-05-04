import { useMemo } from 'react';
import { useApp } from '../store/appStore';
import { makePatch } from '../lib/diffUtils';

export default function DiffPreview() {
  const pending = useApp((s) => s.pendingDiff);
  const setPending = useApp((s) => s.setPendingDiff);
  const tabs = useApp((s) => s.tabs);
  const updateTabContent = useApp((s) => s.updateTabContent);
  const markTabSaved = useApp((s) => s.markTabSaved);
  const pushLog = useApp((s) => s.pushLog);

  const unified = useMemo(() => {
    if (!pending) return '';
    return makePatch(
      pending.relativePath,
      pending.relativePath,
      pending.original,
      pending.modified,
    );
  }, [pending]);

  if (!pending) return null;

  const apply = async () => {
    try {
      await window.api.fs.backupFile(pending.relativePath);
      await window.api.fs.writeFile(pending.relativePath, pending.modified);
      const existing = tabs.find((t) => t.relativePath === pending.relativePath);
      if (existing) {
        updateTabContent(pending.relativePath, pending.modified);
        markTabSaved(pending.relativePath);
      }
      pushLog('info', `Applied changes to ${pending.relativePath} (backup saved).`);
      setPending(null);
    } catch (e) {
      pushLog('error', `Apply failed: ${(e as Error).message}`);
    }
  };

  return (
    <div className="modal-scrim fixed inset-0 z-40 flex items-center justify-center p-6 ds-transition">
      <div className="glass-panel glass-modal-lg flex h-full w-full max-w-5xl flex-col overflow-hidden ds-transition">
        <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
          <div>
            <div className="text-sm font-semibold">Diff Preview</div>
            <div className="text-[11px] text-fg-muted">
              {pending.relativePath} · source: {pending.source}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPending(null)}
              className="rounded-md border border-border px-3 py-1 text-xs text-fg-muted hover:bg-bg-hover hover:text-fg"
            >
              Cancel
            </button>
            <button
              onClick={apply}
              className="rounded-md bg-success/80 px-3 py-1 text-xs font-medium text-white hover:bg-success"
            >
              Apply Changes
            </button>
          </div>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 p-2">
          <DiffPane label="Original" code={pending.original} />
          <DiffPane label="Proposed" code={pending.modified} />
        </div>
        <div className="max-h-[30%] overflow-auto border-t border-border-soft bg-[#0b0d12] p-3 font-mono text-xs text-fg-muted">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-fg-subtle">
            Unified diff
          </div>
          <pre className="whitespace-pre">{colorizeDiff(unified)}</pre>
        </div>
      </div>
    </div>
  );
}

function DiffPane({ label, code }: { label: string; code: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-border bg-[#0b0d12]">
      <div className="border-b border-border-soft px-3 py-1 text-[11px] uppercase text-fg-subtle">
        {label}
      </div>
      <pre className="flex-1 overflow-auto p-3 font-mono text-xs text-fg-muted">{code}</pre>
    </div>
  );
}

function colorizeDiff(src: string): React.ReactNode {
  const lines = src.split('\n');
  return lines.map((l, i) => {
    let cls = 'text-fg-muted';
    if (l.startsWith('+++') || l.startsWith('---')) cls = 'text-fg';
    else if (l.startsWith('@@')) cls = 'text-accent';
    else if (l.startsWith('+')) cls = 'text-success';
    else if (l.startsWith('-')) cls = 'text-danger';
    return (
      <div key={i} className={cls}>
        {l || '\u00A0'}
      </div>
    );
  });
}
