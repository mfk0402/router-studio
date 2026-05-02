import { useState, useMemo } from 'react';
import { useApp } from '../store/appStore';
import { makePatch } from '../lib/diffUtils';

interface FileDiff {
  relativePath: string;
  original: string;
  modified: string;
  source: 'patch' | 'replace' | 'new';
}

export default function MultiDiffPreview() {
  const pending = useApp((s) => s.pendingMultiDiff);
  const setPending = useApp((s) => s.setPendingMultiDiff);
  const tabs = useApp((s) => s.tabs);
  const updateTabContent = useApp((s) => s.updateTabContent);
  const markTabSaved = useApp((s) => s.markTabSaved);
  const pushLog = useApp((s) => s.pushLog);

  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const [acceptedFiles, setAcceptedFiles] = useState<Set<string>>(new Set());
  const [rejectedFiles, setRejectedFiles] = useState<Set<string>>(new Set());

  // Ensure selected index is valid
  const selectedFile = pending && pending[selectedFileIdx] ? pending[selectedFileIdx] : null;

  const unified = useMemo(() => {
    if (!selectedFile) return '';
    return makePatch(
      selectedFile.relativePath,
      selectedFile.relativePath,
      selectedFile.original,
      selectedFile.modified,
    );
  }, [selectedFile]);

  if (!pending || pending.length === 0) return null;

  const toggleFileAccepted = (path: string) => {
    setAcceptedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
        rejectedFiles.delete(path);
        setRejectedFiles(new Set(rejectedFiles));
      }
      return next;
    });
  };

  const toggleFileRejected = (path: string) => {
    setRejectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
        acceptedFiles.delete(path);
        setAcceptedFiles(new Set(acceptedFiles));
      }
      return next;
    });
  };

  const acceptAll = () => {
    const all = new Set(pending.map((f) => f.relativePath));
    setAcceptedFiles(all);
    setRejectedFiles(new Set());
  };

  const rejectAll = () => {
    const all = new Set(pending.map((f) => f.relativePath));
    setRejectedFiles(all);
    setAcceptedFiles(new Set());
  };

  const applySelected = async () => {
    const toApply = pending.filter((f) => acceptedFiles.has(f.relativePath));
    
    if (toApply.length === 0) {
      pushLog('warn', 'No files selected to apply.');
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const file of toApply) {
      try {
        await window.api.fs.backupFile(file.relativePath);
        await window.api.fs.writeFile(file.relativePath, file.modified);
        
        const existing = tabs.find((t) => t.relativePath === file.relativePath);
        if (existing) {
          updateTabContent(file.relativePath, file.modified);
          markTabSaved(file.relativePath);
        }
        
        successCount++;
      } catch (e) {
        pushLog('error', `Failed to apply ${file.relativePath}: ${(e as Error).message}`);
        errorCount++;
      }
    }

    pushLog(
      'info',
      `Applied changes to ${successCount} file${successCount !== 1 ? 's' : ''}` +
        (errorCount > 0 ? ` (${errorCount} failed)` : '') +
        ' (backups saved).'
    );
    
    setPending(null);
    setAcceptedFiles(new Set());
    setRejectedFiles(new Set());
  };

  const close = () => {
    setPending(null);
    setAcceptedFiles(new Set());
    setRejectedFiles(new Set());
  };

  // Stats
  const stats = useMemo(() => {
    let totalAdded = 0;
    let totalRemoved = 0;

    for (const file of pending) {
      const origLines = file.original.split('\n').length;
      const modLines = file.modified.split('\n').length;
      const diff = modLines - origLines;
      if (diff > 0) totalAdded += diff;
      else totalRemoved += Math.abs(diff);
    }

    return { totalAdded, totalRemoved, fileCount: pending.length };
  }, [pending]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-border bg-bg-soft shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
          <div>
            <div className="text-sm font-semibold">Multi-File Changes</div>
            <div className="text-[11px] text-fg-muted">
              {stats.fileCount} file{stats.fileCount !== 1 ? 's' : ''} ·{' '}
              <span className="text-success">+{stats.totalAdded}</span>{' '}
              <span className="text-danger">-{stats.totalRemoved}</span> lines
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-fg-muted">
              {acceptedFiles.size} selected
            </span>
            <button
              onClick={acceptAll}
              className="rounded border border-success/40 bg-success/10 px-2 py-1 text-xs text-success hover:bg-success/20"
            >
              Accept All
            </button>
            <button
              onClick={rejectAll}
              className="rounded border border-danger/40 bg-danger/10 px-2 py-1 text-xs text-danger hover:bg-danger/20"
            >
              Reject All
            </button>
            <button
              onClick={close}
              className="rounded border border-border px-3 py-1 text-xs text-fg-muted hover:bg-bg-hover"
            >
              Cancel
            </button>
            <button
              onClick={applySelected}
              disabled={acceptedFiles.size === 0}
              className="rounded bg-success/80 px-3 py-1 text-xs font-medium text-white hover:bg-success disabled:opacity-50"
            >
              Apply Selected ({acceptedFiles.size})
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="flex min-h-0 flex-1">
          {/* File list sidebar */}
          <div className="w-64 flex-shrink-0 overflow-auto border-r border-border-soft bg-bg">
            <div className="p-2 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
              Changed Files
            </div>
            {pending.map((file, idx) => {
              const isAccepted = acceptedFiles.has(file.relativePath);
              const isRejected = rejectedFiles.has(file.relativePath);
              const isSelected = idx === selectedFileIdx;
              
              // Calculate line diff
              const origLines = file.original.split('\n').length;
              const modLines = file.modified.split('\n').length;
              const lineDiff = modLines - origLines;

              return (
                <div
                  key={file.relativePath}
                  className={`flex items-center gap-2 border-b border-border-soft px-2 py-1.5 ${
                    isSelected ? 'bg-accent/10' : 'hover:bg-bg-hover'
                  }`}
                >
                  {/* Checkbox */}
                  <div className="flex gap-1">
                    <button
                      onClick={() => toggleFileAccepted(file.relativePath)}
                      className={`h-4 w-4 rounded border text-[10px] ${
                        isAccepted
                          ? 'border-success bg-success text-white'
                          : 'border-border hover:border-success/50'
                      }`}
                      title="Accept this file"
                    >
                      {isAccepted && '✓'}
                    </button>
                    <button
                      onClick={() => toggleFileRejected(file.relativePath)}
                      className={`h-4 w-4 rounded border text-[10px] ${
                        isRejected
                          ? 'border-danger bg-danger text-white'
                          : 'border-border hover:border-danger/50'
                      }`}
                      title="Reject this file"
                    >
                      {isRejected && '✗'}
                    </button>
                  </div>

                  {/* File info */}
                  <button
                    onClick={() => setSelectedFileIdx(idx)}
                    className="flex flex-1 items-center gap-2 overflow-hidden text-left"
                  >
                    <span className="truncate text-xs text-fg">
                      {file.relativePath.split('/').pop()}
                    </span>
                    <span className={`text-[10px] ${lineDiff >= 0 ? 'text-success' : 'text-danger'}`}>
                      {lineDiff >= 0 ? '+' : ''}{lineDiff}
                    </span>
                  </button>

                  {/* Status badge */}
                  <span
                    className={`rounded px-1 py-0.5 text-[9px] ${
                      file.source === 'new'
                        ? 'bg-success/20 text-success'
                        : file.source === 'patch'
                        ? 'bg-accent/20 text-accent'
                        : 'bg-fg-subtle/20 text-fg-subtle'
                    }`}
                  >
                    {file.source}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Diff view */}
          <div className="flex min-h-0 flex-1 flex-col">
            {selectedFile ? (
              <>
                {/* File path header */}
                <div className="border-b border-border-soft px-4 py-2">
                  <div className="text-xs font-medium text-fg">{selectedFile.relativePath}</div>
                  <div className="text-[10px] text-fg-muted">source: {selectedFile.source}</div>
                </div>

                {/* Side-by-side diff */}
                <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 p-2">
                  <DiffPane label="Original" code={selectedFile.original} />
                  <DiffPane label="Proposed" code={selectedFile.modified} />
                </div>

                {/* Unified diff */}
                <div className="max-h-[25%] overflow-auto border-t border-border-soft bg-[#0b0d12] p-3 font-mono text-xs text-fg-muted">
                  <div className="mb-1 text-[11px] uppercase tracking-wide text-fg-subtle">
                    Unified diff
                  </div>
                  <pre className="whitespace-pre">{colorizeDiff(unified)}</pre>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-fg-muted">
                Select a file to view changes
              </div>
            )}
          </div>
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
