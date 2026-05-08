import { useState, useEffect, useCallback } from 'react';
import type { Diagnostic, DiagnosticsByFile, DiagnosticSeverity } from '../../shared/types';
import { useApp } from '../store/appStore';
import { toast } from './ToastContainer';

interface Props {
  onClose?: () => void;
}

const SEVERITY_ICONS: Record<DiagnosticSeverity, string> = {
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
  hint: '💡',
};

const SEVERITY_COLORS: Record<DiagnosticSeverity, string> = {
  error: 'text-red-400',
  warning: 'text-yellow-400',
  info: 'text-blue-400',
  hint: 'text-green-400',
};

const SEVERITY_BG: Record<DiagnosticSeverity, string> = {
  error: 'bg-red-500/10',
  warning: 'bg-yellow-500/10',
  info: 'bg-blue-500/10',
  hint: 'bg-green-500/10',
};

export function ProblemsPanel({ onClose }: Props) {
  const [diagnostics, setDiagnostics] = useState<DiagnosticsByFile>({});
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | DiagnosticSeverity>('all');
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const runDiagnostics = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.api.diagnostics.runAll();
      setDiagnostics(result);

      // Auto-expand all files
      setExpandedFiles(new Set(Object.keys(result)));

      const counts = countDiagnostics(result);
      useApp.getState().pushLog(
        'info',
        `Diagnostics: ${counts.errors} errors, ${counts.warnings} warnings`,
      );
    } catch (e) {
      useApp.getState().pushLog('error', `Failed to run diagnostics: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    runDiagnostics();
  }, [runDiagnostics]);

  const countDiagnostics = (diags: DiagnosticsByFile) => {
    let errors = 0;
    let warnings = 0;
    let info = 0;
    let hints = 0;

    for (const file of Object.values(diags)) {
      for (const d of file) {
        switch (d.severity) {
          case 'error':
            errors++;
            break;
          case 'warning':
            warnings++;
            break;
          case 'info':
            info++;
            break;
          case 'hint':
            hints++;
            break;
        }
      }
    }

    return { errors, warnings, info, hints, total: errors + warnings + info + hints };
  };

  const toggleFile = (file: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(file)) {
        next.delete(file);
      } else {
        next.add(file);
      }
      return next;
    });
  };

  const handleGoToDiagnostic = async (diag: Diagnostic) => {
    try {
      // Open the file in the editor
      const content = await window.api.fs.readFile(diag.file);
      const ext = diag.file.split('.').pop() || '';
      const languageMap: Record<string, string> = {
        ts: 'typescript',
        tsx: 'typescriptreact',
        js: 'javascript',
        jsx: 'javascriptreact',
        py: 'python',
        go: 'go',
        rs: 'rust',
        json: 'json',
        md: 'markdown',
        css: 'css',
        html: 'html',
      };

      useApp.getState().openTab({
        relativePath: diag.file,
        name: diag.file.split('/').pop() || diag.file,
        language: languageMap[ext] || 'plaintext',
        content,
        original: content,
        dirty: false,
      });

      toast.info(`Go to line ${diag.range.start.line}`);
    } catch (e) {
      toast.error(`Failed to open file: ${(e as Error).message}`);
    }
  };

  const handleFixWithAI = (diag: Diagnostic) => {
    const prompt = `Please help me fix this ${diag.severity} in \`${diag.file}\`:

**Location:** Line ${diag.range.start.line}, Column ${diag.range.start.column}
**Source:** ${diag.source || 'unknown'}${diag.code ? ` (${diag.code})` : ''}
**Message:** ${diag.message}

Please analyze the issue and provide a fix.`;

    useApp.getState().addChatMessage({
      id: crypto.randomUUID(),
      role: 'user',
      content: prompt,
      createdAt: Date.now(),
    });

    useApp.getState().setAiPanelFocused(true);
    toast.info('Sent to AI for fixing');
  };

  const handleFixAllWithAI = () => {
    const allDiags = Object.entries(diagnostics)
      .flatMap(([file, diags]) =>
        diags.map((d) => `- **${file}:${d.range.start.line}** [${d.severity}]: ${d.message}`),
      )
      .slice(0, 20); // Limit to first 20

    if (allDiags.length === 0) {
      toast.info('No diagnostics to fix');
      return;
    }

    const prompt = `Please help me fix these issues in my codebase:

${allDiags.join('\n')}

Please analyze each issue and provide fixes.`;

    useApp.getState().addChatMessage({
      id: crypto.randomUUID(),
      role: 'user',
      content: prompt,
      createdAt: Date.now(),
    });

    useApp.getState().setAiPanelFocused(true);
    toast.info('Sent all issues to AI');
  };

  const filteredDiagnostics = Object.entries(diagnostics).reduce((acc, [file, diags]) => {
    const filtered = filter === 'all' ? diags : diags.filter((d) => d.severity === filter);
    if (filtered.length > 0) {
      acc[file] = filtered;
    }
    return acc;
  }, {} as DiagnosticsByFile);

  const counts = countDiagnostics(diagnostics);

  return (
    <div className="flex h-full flex-col bg-bg-deep">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#333] px-3 py-2">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-white">Problems</span>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-red-400">{counts.errors} errors</span>
            <span className="text-yellow-400">{counts.warnings} warnings</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="rounded bg-[#333] px-2 py-1 text-xs text-gray-300 outline-none"
          >
            <option value="all">All</option>
            <option value="error">Errors</option>
            <option value="warning">Warnings</option>
            <option value="info">Info</option>
            <option value="hint">Hints</option>
          </select>
          <button
            onClick={runDiagnostics}
            disabled={loading}
            className="rounded bg-[#333] p-1 text-gray-400 hover:bg-[#444] hover:text-white disabled:opacity-50"
            title="Refresh diagnostics"
          >
            <svg
              className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
          {counts.total > 0 && (
            <button
              onClick={handleFixAllWithAI}
              className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
              title="Send all problems to AI for fixing"
            >
              Fix All with AI
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="rounded p-1 text-gray-400 hover:bg-[#333] hover:text-white"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading && Object.keys(diagnostics).length === 0 ? (
          <div className="flex h-32 items-center justify-center text-gray-500">
            <svg className="mr-2 h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Running diagnostics...
          </div>
        ) : Object.keys(filteredDiagnostics).length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center text-gray-500">
            <svg className="mb-2 h-8 w-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            No problems found!
          </div>
        ) : (
          <div className="divide-y divide-[#333]">
            {Object.entries(filteredDiagnostics).map(([file, diags]) => (
              <div key={file}>
                {/* File header */}
                <button
                  onClick={() => toggleFile(file)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-bg-hover"
                >
                  <svg
                    className={`h-3 w-3 text-gray-500 transition-transform ${expandedFiles.has(file) ? 'rotate-90' : ''}`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-sm text-blue-400">{file}</span>
                  <span className="text-xs text-gray-500">({diags.length})</span>
                </button>

                {/* Diagnostics list */}
                {expandedFiles.has(file) && (
                  <div className="bg-[#1a1a1a]">
                    {diags.map((diag) => (
                      <div
                        key={diag.id}
                        className={`group flex items-start gap-2 px-6 py-2 hover:bg-bg-hover ${SEVERITY_BG[diag.severity]}`}
                      >
                        <span className={`mt-0.5 ${SEVERITY_COLORS[diag.severity]}`}>
                          {SEVERITY_ICONS[diag.severity]}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">
                              Ln {diag.range.start.line}, Col {diag.range.start.column}
                            </span>
                            {diag.code && (
                              <span className="text-xs text-gray-600">({diag.code})</span>
                            )}
                            {diag.source && (
                              <span className="text-xs text-gray-600">[{diag.source}]</span>
                            )}
                          </div>
                          <p className="text-sm text-gray-300 truncate">{diag.message}</p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                          <button
                            onClick={() => handleGoToDiagnostic(diag)}
                            className="rounded p-1 text-gray-400 hover:bg-[#333] hover:text-white"
                            title="Go to location"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                              />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleFixWithAI(diag)}
                            className="rounded p-1 text-gray-400 hover:bg-blue-600 hover:text-white"
                            title="Fix with AI"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13 10V3L4 14h7v7l9-11h-7z"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
