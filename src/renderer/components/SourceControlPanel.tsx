import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../store/appStore';
import { useSettings } from '../store/settingsStore';
import { sendChatCompletion } from '../lib/openrouterClient';
import { getCompletionRouting } from '../lib/completionRouting';
import type { NormalizedModel } from '../../shared/types';

interface GitFile {
  path: string;
  status: 'M' | 'A' | 'D' | 'R' | 'C' | 'U' | '?' | '!';
  staged: boolean;
  oldPath?: string;
}

interface GitHunk {
  header: string;
  content: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
}

interface FileDiff {
  path: string;
  hunks: GitHunk[];
  isBinary: boolean;
}

type PanelView = 'changes' | 'history';

export default function SourceControlPanel() {
  const [view, setView] = useState<PanelView>('changes');
  const [stagedFiles, setStagedFiles] = useState<GitFile[]>([]);
  const [unstagedFiles, setUnstagedFiles] = useState<GitFile[]>([]);
  const [commitMessage, setCommitMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingMessage, setIsGeneratingMessage] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileDiff, setFileDiff] = useState<FileDiff | null>(null);
  const [selectedHunks, setSelectedHunks] = useState<Set<number>>(new Set());
  const [recentCommits, setRecentCommits] = useState<Array<{
    hash: string;
    message: string;
    author: string;
    date: string;
  }>>([]);
  const [error, setError] = useState<string | null>(null);

  const pushLog = useApp((s) => s.pushLog);
  const settings = useSettings((s) => s.settings);

  // Fetch git status
  const refreshStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.api.tools.execute('git_status', {});
      if (!result.success) {
        setError(result.error || 'Failed to get git status');
        return;
      }

      const output = result.result as {
        branch: string;
        staged: string[];
        unstaged: string[];
        untracked?: string[];
      };

      const parseStatusEntry = (line: string, stagedFlag: boolean): GitFile => {
        const m = line.match(/^([MADRCU?!])\s+(.+)$/);
        if (m) {
          return { path: m[2], status: m[1] as GitFile['status'], staged: stagedFlag };
        }
        return { path: line.trim(), status: 'M', staged: stagedFlag };
      };

      const staged = (output.staged || []).map((line: string) => parseStatusEntry(line, true));
      let unstaged = (output.unstaged || []).map((line: string) => parseStatusEntry(line, false));
      const untracked = (output.untracked || []).map((p: string) => ({
        path: p,
        status: '?' as const,
        staged: false,
      }));
      unstaged = [...unstaged, ...untracked];

      setStagedFiles(staged);
      setUnstagedFiles(unstaged);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch recent commits
  const fetchRecentCommits = useCallback(async () => {
    try {
      const result = await window.api.tools.execute('git_log', { limit: 15 });
      if (result.success && result.result) {
        const data = result.result as {
          commits: unknown[];
          format?: string;
        };
        if (data.format === 'oneline' && Array.isArray(data.commits)) {
          setRecentCommits(
            (data.commits as string[]).map((line) => {
              const idx = line.indexOf(' ');
              const hash = idx > 0 ? line.slice(0, idx) : line;
              const message = idx > 0 ? line.slice(idx + 1) : '';
              return { hash, message, author: '', date: '' };
            }),
          );
        } else if (Array.isArray(data.commits)) {
          const rows = data.commits as Array<{
            hash: string;
            author: string;
            date: string;
            subject: string;
          }>;
          setRecentCommits(
            rows.map((c) => ({
              hash: (c.hash ?? '').slice(0, 7),
              message: c.subject ?? '',
              author: c.author ?? '',
              date: c.date ?? '',
            })),
          );
        }
      }
    } catch {
      // Silently fail for commit history
    }
  }, []);

  // Fetch diff for a file
  const fetchFileDiff = useCallback(async (path: string, staged: boolean) => {
    try {
      const args = staged ? { staged: true } : {};
      const result = await window.api.tools.execute('git_diff', { path, ...args });
      if (result.success && result.result) {
        const diffOutput = (result.result as { diff: string }).diff || '';
        
        // Parse the diff into hunks
        const hunks: GitHunk[] = [];
        const hunkRegex = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@(.*)$/gm;
        let match;
        const hunkHeaders: Array<{ index: number; header: string; oldStart: number; oldLines: number; newStart: number; newLines: number }> = [];
        
        while ((match = hunkRegex.exec(diffOutput)) !== null) {
          hunkHeaders.push({
            index: match.index,
            header: match[0],
            oldStart: parseInt(match[1], 10),
            oldLines: parseInt(match[2] || '1', 10),
            newStart: parseInt(match[3], 10),
            newLines: parseInt(match[4] || '1', 10),
          });
        }

        for (let i = 0; i < hunkHeaders.length; i++) {
          const start = hunkHeaders[i].index;
          const end = i < hunkHeaders.length - 1 ? hunkHeaders[i + 1].index : diffOutput.length;
          const content = diffOutput.slice(start, end).trim();
          
          hunks.push({
            header: hunkHeaders[i].header,
            content,
            oldStart: hunkHeaders[i].oldStart,
            oldLines: hunkHeaders[i].oldLines,
            newStart: hunkHeaders[i].newStart,
            newLines: hunkHeaders[i].newLines,
          });
        }

        setFileDiff({
          path,
          hunks,
          isBinary: diffOutput.includes('Binary files'),
        });
        setSelectedHunks(new Set(hunks.map((_, i) => i)));
      }
    } catch (e) {
      pushLog('error', `Failed to get diff: ${(e as Error).message}`);
    }
  }, [pushLog]);

  // Stage a file
  const stageFile = async (path: string) => {
    try {
      const result = await window.api.tools.execute('git_add', { paths: [path] });
      if (result.success) {
        await refreshStatus();
        pushLog('info', `Staged: ${path}`);
      } else {
        pushLog('error', result.error ?? 'Stage failed');
      }
    } catch (e) {
      pushLog('error', `Stage failed: ${(e as Error).message}`);
    }
  };

  // Unstage a file
  const unstageFile = async (path: string) => {
    try {
      const result = await window.api.tools.execute('run_shell', { command: `git reset HEAD "${path}"` });
      if (result.success) {
        await refreshStatus();
        pushLog('info', `Unstaged: ${path}`);
      }
    } catch (e) {
      pushLog('error', `Unstage failed: ${(e as Error).message}`);
    }
  };

  // Discard changes
  const discardChanges = async (path: string) => {
    if (!confirm(`Discard all changes to ${path}? This cannot be undone.`)) return;
    
    try {
      const result = await window.api.tools.execute('run_shell', { command: `git checkout -- "${path}"` });
      if (result.success) {
        await refreshStatus();
        pushLog('info', `Discarded changes: ${path}`);
      }
    } catch (e) {
      pushLog('error', `Discard failed: ${(e as Error).message}`);
    }
  };

  // Stage all changes
  const stageAll = async () => {
    try {
      const result = await window.api.tools.execute('git_add', { all: true });
      if (result.success) {
        await refreshStatus();
        pushLog('info', 'Staged all changes');
      } else {
        pushLog('error', result.error ?? 'Stage all failed');
      }
    } catch (e) {
      pushLog('error', `Stage all failed: ${(e as Error).message}`);
    }
  };

  // Unstage all
  const unstageAll = async () => {
    try {
      const result = await window.api.tools.execute('run_shell', { command: 'git reset HEAD' });
      if (result.success) {
        await refreshStatus();
        pushLog('info', 'Unstaged all changes');
      }
    } catch (e) {
      pushLog('error', `Unstage all failed: ${(e as Error).message}`);
    }
  };

  // Commit changes
  const commit = async () => {
    if (!commitMessage.trim()) {
      pushLog('warn', 'Please enter a commit message');
      return;
    }
    if (stagedFiles.length === 0) {
      pushLog('warn', 'No staged changes to commit');
      return;
    }

    try {
      const result = await window.api.tools.execute('git_commit', { message: commitMessage.trim() });
      if (result.success) {
        setCommitMessage('');
        await refreshStatus();
        await fetchRecentCommits();
        pushLog('info', 'Commit successful');
      } else {
        pushLog('error', `Commit failed: ${result.error}`);
      }
    } catch (e) {
      pushLog('error', `Commit failed: ${(e as Error).message}`);
    }
  };

  // Generate AI commit message
  const generateCommitMessage = async () => {
    if (!settings.apiKey) {
      pushLog('error', 'API key not set. Please configure in Settings.');
      return;
    }

    if (stagedFiles.length === 0 && unstagedFiles.length === 0) {
      pushLog('warn', 'No changes to describe');
      return;
    }

    setIsGeneratingMessage(true);

    try {
      // Get the diff to describe
      const diffResult = await window.api.tools.execute('git_diff', { staged: stagedFiles.length > 0 });
      const diffContent = diffResult.success 
        ? (diffResult.result as { diff: string }).diff || ''
        : '';

      if (!diffContent.trim()) {
        pushLog('warn', 'No diff content to describe');
        setIsGeneratingMessage(false);
        return;
      }

      const model = settings.defaultModel || 'anthropic/claude-3.5-sonnet';
      
      const systemPrompt = `You are an expert at writing clear, concise git commit messages. Follow these guidelines:
- Use the imperative mood ("Add feature" not "Added feature")
- First line should be 50 characters or less
- Be specific about what changed
- Don't include "feat:", "fix:" prefixes unless the project uses conventional commits
- Output ONLY the commit message, no explanations`;

      const userPrompt = `Write a commit message for these changes:

${diffContent.slice(0, 4000)}${diffContent.length > 4000 ? '\n\n... (diff truncated)' : ''}`;

      let message = '';

      const routing = getCompletionRouting(settings);
      await sendChatCompletion({
        apiKey: routing.apiKey,
        openAiBaseUrl: routing.openAiBaseUrl,
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        maxTokens: 200,
        stream: true,
        freeMode: {
          enabled: false,
          strategy: 'router',
          freeModels: [] as NormalizedModel[],
        },
        fallbackModel: settings.fallbackModel || undefined,
        completionFallbackModels: settings.completionFallbackModels,
        onStreamChunk: (chunk) => {
          if (chunk.type === 'delta' && chunk.content) {
            message += chunk.content;
            setCommitMessage(message.trim());
          }
        },
      });

      pushLog('info', 'Generated commit message');
    } catch (e) {
      pushLog('error', `Failed to generate message: ${(e as Error).message}`);
    } finally {
      setIsGeneratingMessage(false);
    }
  };

  // Initial load
  useEffect(() => {
    refreshStatus();
    fetchRecentCommits();
  }, [refreshStatus, fetchRecentCommits]);

  // File status icon
  const getStatusIcon = (status: GitFile['status']) => {
    switch (status) {
      case 'M': return <span className="text-yellow-500">M</span>;
      case 'A': return <span className="text-green-500">A</span>;
      case 'D': return <span className="text-red-500">D</span>;
      case 'R': return <span className="text-blue-500">R</span>;
      case 'C': return <span className="text-blue-500">C</span>;
      case 'U': return <span className="text-orange-500">U</span>;
      case '?': return <span className="text-gray-500">?</span>;
      default: return <span className="text-fg-muted">{status}</span>;
    }
  };

  const hasChanges = stagedFiles.length > 0 || unstagedFiles.length > 0;

  return (
    <div className="flex h-full flex-col bg-bg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-soft px-3 py-2">
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          <span className="text-xs font-medium text-fg">Source Control</span>
        </div>
        <button
          onClick={refreshStatus}
          disabled={isLoading}
          className="rounded p-1 text-fg-muted hover:bg-bg-hover hover:text-fg disabled:opacity-50"
          title="Refresh"
        >
          <svg className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* View tabs */}
      <div className="flex border-b border-border-soft">
        <button
          onClick={() => setView('changes')}
          className={`flex-1 px-3 py-1.5 text-xs ${view === 'changes' ? 'border-b-2 border-accent text-fg' : 'text-fg-muted hover:text-fg'}`}
        >
          Changes {hasChanges && <span className="ml-1 rounded-full bg-accent/20 px-1.5 text-accent">{stagedFiles.length + unstagedFiles.length}</span>}
        </button>
        <button
          onClick={() => setView('history')}
          className={`flex-1 px-3 py-1.5 text-xs ${view === 'history' ? 'border-b-2 border-accent text-fg' : 'text-fg-muted hover:text-fg'}`}
        >
          History
        </button>
      </div>

      {error && (
        <div className="mx-3 mt-2 rounded bg-danger/10 px-2 py-1 text-xs text-danger">
          {error}
        </div>
      )}

      {view === 'changes' ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-auto">
          {/* Commit message input */}
          <div className="border-b border-border-soft p-3">
            <div className="flex items-center gap-2">
              <textarea
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="Commit message..."
                rows={2}
                className="flex-1 resize-none rounded border border-border bg-bg-elevated px-2 py-1.5 text-xs text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    commit();
                  }
                }}
              />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={commit}
                disabled={stagedFiles.length === 0 || !commitMessage.trim()}
                className="rounded bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
              >
                Commit ({stagedFiles.length})
              </button>
              <button
                onClick={generateCommitMessage}
                disabled={isGeneratingMessage || !hasChanges}
                className="rounded border border-border px-2 py-1 text-xs text-fg-muted hover:bg-bg-hover hover:text-fg disabled:opacity-50"
                title="Generate commit message with AI"
              >
                {isGeneratingMessage ? '✨ Generating...' : '✨ AI Message'}
              </button>
            </div>
          </div>

          {/* Staged changes */}
          <div className="border-b border-border-soft">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-[11px] font-medium uppercase text-fg-muted">
                Staged Changes ({stagedFiles.length})
              </span>
              {stagedFiles.length > 0 && (
                <button
                  onClick={unstageAll}
                  className="text-[10px] text-fg-subtle hover:text-fg"
                  title="Unstage all"
                >
                  − All
                </button>
              )}
            </div>
            {stagedFiles.length === 0 ? (
              <div className="px-3 pb-2 text-[11px] text-fg-subtle">No staged changes</div>
            ) : (
              <div className="space-y-0.5 pb-2">
                {stagedFiles.map((file) => (
                  <div
                    key={file.path}
                    className={`group flex cursor-pointer items-center gap-2 px-3 py-1 hover:bg-bg-hover ${
                      selectedFile === file.path ? 'bg-accent/10' : ''
                    }`}
                    onClick={() => {
                      setSelectedFile(file.path);
                      fetchFileDiff(file.path, true);
                    }}
                  >
                    <span className="w-4 text-center text-[10px] font-mono">{getStatusIcon(file.status)}</span>
                    <span className="flex-1 truncate text-xs text-fg">{file.path}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        unstageFile(file.path);
                      }}
                      className="hidden rounded p-0.5 text-fg-muted hover:bg-bg-elevated hover:text-fg group-hover:block"
                      title="Unstage"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Unstaged changes */}
          <div>
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-[11px] font-medium uppercase text-fg-muted">
                Changes ({unstagedFiles.length})
              </span>
              {unstagedFiles.length > 0 && (
                <button
                  onClick={stageAll}
                  className="text-[10px] text-fg-subtle hover:text-fg"
                  title="Stage all"
                >
                  + All
                </button>
              )}
            </div>
            {unstagedFiles.length === 0 ? (
              <div className="px-3 pb-2 text-[11px] text-fg-subtle">No changes</div>
            ) : (
              <div className="space-y-0.5 pb-2">
                {unstagedFiles.map((file) => (
                  <div
                    key={file.path}
                    className={`group flex cursor-pointer items-center gap-2 px-3 py-1 hover:bg-bg-hover ${
                      selectedFile === file.path ? 'bg-accent/10' : ''
                    }`}
                    onClick={() => {
                      setSelectedFile(file.path);
                      fetchFileDiff(file.path, false);
                    }}
                  >
                    <span className="w-4 text-center text-[10px] font-mono">{getStatusIcon(file.status)}</span>
                    <span className="flex-1 truncate text-xs text-fg">{file.path}</span>
                    <div className="hidden items-center gap-1 group-hover:flex">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          stageFile(file.path);
                        }}
                        className="rounded p-0.5 text-fg-muted hover:bg-bg-elevated hover:text-fg"
                        title="Stage"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          discardChanges(file.path);
                        }}
                        className="rounded p-0.5 text-danger hover:bg-danger/10"
                        title="Discard changes"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* File diff preview */}
          {selectedFile && fileDiff && (
            <div className="flex-1 border-t border-border-soft overflow-auto">
              <div className="sticky top-0 flex items-center justify-between bg-bg-elevated px-3 py-2">
                <span className="text-xs font-medium text-fg">{selectedFile}</span>
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setFileDiff(null);
                  }}
                  className="text-fg-muted hover:text-fg"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {fileDiff.isBinary ? (
                <div className="p-3 text-xs text-fg-muted">Binary file</div>
              ) : (
                <div className="space-y-2 p-2">
                  {fileDiff.hunks.map((hunk, idx) => (
                    <div key={idx} className="rounded border border-border-soft overflow-hidden">
                      <div className="flex items-center gap-2 bg-bg-elevated px-2 py-1">
                        <input
                          type="checkbox"
                          checked={selectedHunks.has(idx)}
                          onChange={(e) => {
                            const newSet = new Set(selectedHunks);
                            if (e.target.checked) {
                              newSet.add(idx);
                            } else {
                              newSet.delete(idx);
                            }
                            setSelectedHunks(newSet);
                          }}
                          className="h-3 w-3"
                        />
                        <span className="font-mono text-[10px] text-fg-muted">{hunk.header}</span>
                      </div>
                      <pre className="overflow-x-auto p-2 text-[11px] leading-relaxed">
                        {hunk.content.split('\n').slice(1).map((line, lineIdx) => {
                          let bgClass = '';
                          let textClass = 'text-fg';
                          if (line.startsWith('+')) {
                            bgClass = 'bg-green-500/10';
                            textClass = 'text-green-400';
                          } else if (line.startsWith('-')) {
                            bgClass = 'bg-red-500/10';
                            textClass = 'text-red-400';
                          }
                          return (
                            <div key={lineIdx} className={`${bgClass} -mx-2 px-2`}>
                              <code className={textClass}>{line}</code>
                            </div>
                          );
                        })}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* History view */
        <div className="flex-1 overflow-auto">
          {recentCommits.length === 0 ? (
            <div className="p-3 text-xs text-fg-muted">No commits yet</div>
          ) : (
            <div className="space-y-0.5 py-2">
              {recentCommits.map((commit) => (
                <div
                  key={commit.hash}
                  className="px-3 py-2 hover:bg-bg-hover cursor-pointer"
                  title={`${commit.hash}\n${commit.author}\n${commit.date}`}
                >
                  <div className="flex items-start gap-2">
                    <span className="font-mono text-[10px] text-accent">{commit.hash.slice(0, 7)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-xs text-fg">{commit.message}</div>
                      <div className="mt-0.5 text-[10px] text-fg-subtle">
                        {commit.author} · {commit.date}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
