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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70">
      <div className="bg-[#1e1e1e] border border-[#444] rounded-lg shadow-2xl w-[500px] max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-[#333] flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-yellow-600/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Session Recovery</h2>
            <p className="text-sm text-gray-400">Router Studio didn't shut down cleanly</p>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 overflow-auto flex-1">
          <p className="text-gray-300 mb-4">
            The application was not closed properly. Would you like to restore your previous session?
          </p>

          {autosaves.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-400 mb-2">Unsaved Files Detected:</h3>
              <ul className="bg-[#252526] rounded p-2 max-h-40 overflow-auto">
                {autosaves.map((a) => (
                  <li key={a.relativePath} className="text-sm text-gray-300 py-1 px-2 hover:bg-[#333] rounded flex items-center gap-2">
                    <svg className="w-4 h-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="truncate">{a.relativePath}</span>
                    <span className="text-xs text-gray-500 ml-auto">
                      {new Date(a.savedAt).toLocaleTimeString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="bg-blue-900/20 border border-blue-800/50 rounded p-3 text-sm text-blue-300">
            <strong>Tip:</strong> Restoring will reload your open files, tabs, and chat history from the last auto-save.
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#333] flex justify-end gap-3">
          <button
            onClick={handleDiscard}
            disabled={loading}
            className="px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-[#333] rounded transition disabled:opacity-50"
          >
            Start Fresh
          </button>
          <button
            onClick={handleRecover}
            disabled={loading}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition disabled:opacity-50 flex items-center gap-2"
          >
            {loading && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
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
