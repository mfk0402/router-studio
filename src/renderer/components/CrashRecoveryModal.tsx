import { useState, useEffect } from 'react';
import { useApp } from '../store/appStore';
import type { AutosaveEntry } from '../../shared/types';

export function CrashRecoveryModal() {
  const crashDetected = useApp((s) => s.crashDetected);
  const setCrashDetected = useApp((s) => s.setCrashDetected);
  const loadSession = useApp((s) => s.loadSession);
  const clearSession = useApp((s) => s.clearSession);
  const clearAutosaves = useApp((s) => s.clearAutosaves);
  const clearCrashFlag = useApp((s) => s.clearCrashFlag);
  const loadAutosaves = useApp((s) => s.loadAutosaves);

  const [autosaves, setAutosaves] = useState<AutosaveEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (crashDetected) {
      loadAutosaves().then(setAutosaves);
    }
  }, [crashDetected, loadAutosaves]);

  if (!crashDetected) return null;

  const handleRecover = async () => {
    setLoading(true);
    try {
      await loadSession();
      await clearCrashFlag();
      setCrashDetected(false);
    } finally {
      setLoading(false);
    }
  };

  const handleDiscard = async () => {
    setLoading(true);
    try {
      await clearSession();
      await clearAutosaves();
      await clearCrashFlag();
      setCrashDetected(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-scrim fixed inset-0 z-[100] flex items-center justify-center p-4 ds-transition">
      <div className="glass-panel glass-modal-lg flex w-[500px] max-h-[80vh] flex-col overflow-hidden ds-transition">
        <div className="flex items-center gap-3 border-b border-border-soft p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warn/20">
            <svg className="h-6 w-6 text-warn" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-fg">Session Recovery</h2>
            <p className="text-sm text-fg-muted">Router Studio didn&apos;t shut down cleanly</p>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <p className="mb-4 text-sm text-fg-muted">
            The application was not closed properly. Would you like to restore your previous session?
          </p>

          {autosaves.length > 0 && (
            <div className="mb-4">
              <h3 className="mb-2 text-sm font-medium text-fg">Unsaved files detected</h3>
              <ul className="max-h-40 overflow-auto rounded-lg border border-border-soft bg-bg-deep p-2">
                {autosaves.map((a) => (
                  <li
                    key={a.relativePath}
                    className="flex items-center gap-2 rounded px-2 py-1 text-sm text-fg-muted hover:bg-bg-hover"
                  >
                    <svg className="h-4 w-4 shrink-0 text-warn" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="truncate">{a.relativePath}</span>
                    <span className="ml-auto shrink-0 text-xs text-fg-subtle">
                      {new Date(a.savedAt).toLocaleTimeString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-lg border border-cyan/25 bg-cyan/10 p-3 text-sm text-cyan">
            <strong className="text-fg">Tip:</strong>{' '}
            <span className="text-fg-muted">
              Restoring reloads open files, tabs, and chat history from the last auto-save.
            </span>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-border-soft p-4">
          <button
            type="button"
            onClick={handleDiscard}
            disabled={loading}
            className="rounded-md px-4 py-2 text-sm text-fg-muted transition-colors duration-layout hover:bg-bg-hover hover:text-fg disabled:opacity-50"
          >
            Start Fresh
          </button>
          <button
            type="button"
            onClick={handleRecover}
            disabled={loading}
            className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors duration-layout hover:bg-accent/90 disabled:opacity-50"
          >
            {loading && (
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            Restore Session
          </button>
        </div>
      </div>
    </div>
  );
}
