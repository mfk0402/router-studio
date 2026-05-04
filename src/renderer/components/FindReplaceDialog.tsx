import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../store/appStore';
import { toast } from './ToastContainer';

interface SearchResult {
  file: string;
  line: number;
  column: number;
  lineContent: string;
  matchStart: number;
  matchEnd: number;
}

interface FileResults {
  file: string;
  results: SearchResult[];
}

export function FindReplaceDialog() {
  const showFindReplace = useApp((s) => s.showFindReplace);
  const setShowFindReplace = useApp((s) => s.setShowFindReplace);

  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [includePattern, setIncludePattern] = useState('');
  const [excludePattern, setExcludePattern] = useState('**/node_modules/**');

  const [results, setResults] = useState<FileResults[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalMatches, setTotalMatches] = useState(0);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [selectedResults, setSelectedResults] = useState<Set<string>>(new Set());

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showFindReplace) {
      searchInputRef.current?.focus();
    }
  }, [showFindReplace]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setResults([]);
      setTotalMatches(0);
      return;
    }

    setLoading(true);
    try {
      // Use the grep tool from main process
      const response = await window.api.tools.execute('grep', {
        pattern: searchQuery,
        path: '.',
        case_sensitive: caseSensitive,
        context_lines: 0,
      });

      if (response.success && typeof response.result === 'string') {
        const lines = response.result.split('\n').filter(Boolean);
        const fileMap = new Map<string, SearchResult[]>();

        for (const line of lines) {
          // Parse grep output: file:line:content
          const match = line.match(/^([^:]+):(\d+):(.*)$/);
          if (match) {
            const [, file, lineNum, lineContent] = match;

            // Find match position in line
            let matchStart = -1;
            let matchEnd = -1;
            try {
              const regex = useRegex
                ? new RegExp(searchQuery, caseSensitive ? 'g' : 'gi')
                : new RegExp(
                    searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
                    caseSensitive ? 'g' : 'gi',
                  );
              const execMatch = regex.exec(lineContent);
              if (execMatch) {
                matchStart = execMatch.index;
                matchEnd = execMatch.index + execMatch[0].length;
              }
            } catch {
              matchStart = lineContent.toLowerCase().indexOf(searchQuery.toLowerCase());
              matchEnd = matchStart + searchQuery.length;
            }

            if (!fileMap.has(file)) {
              fileMap.set(file, []);
            }
            fileMap.get(file)!.push({
              file,
              line: parseInt(lineNum, 10),
              column: matchStart >= 0 ? matchStart : 0,
              lineContent,
              matchStart: matchStart >= 0 ? matchStart : 0,
              matchEnd: matchEnd >= 0 ? matchEnd : lineContent.length,
            });
          }
        }

        const fileResults: FileResults[] = Array.from(fileMap.entries())
          .map(([file, results]) => ({ file, results }))
          .sort((a, b) => a.file.localeCompare(b.file));

        setResults(fileResults);
        setTotalMatches(lines.length);
        setExpandedFiles(new Set(fileResults.map((f) => f.file)));

        // Select all by default
        const allKeys = new Set<string>();
        for (const fr of fileResults) {
          for (const r of fr.results) {
            allKeys.add(`${r.file}:${r.line}:${r.column}`);
          }
        }
        setSelectedResults(allKeys);
      } else {
        setResults([]);
        setTotalMatches(0);
      }
    } catch (e) {
      toast.error(`Search failed: ${(e as Error).message}`);
      setResults([]);
      setTotalMatches(0);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, caseSensitive, useRegex]);

  const handleReplace = async (result: SearchResult) => {
    try {
      const content = await window.api.fs.readFile(result.file);
      const lines = content.split('\n');
      const lineIdx = result.line - 1;

      if (lineIdx >= 0 && lineIdx < lines.length) {
        const line = lines[lineIdx];
        const regex = useRegex
          ? new RegExp(searchQuery, caseSensitive ? '' : 'i')
          : new RegExp(
              searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
              caseSensitive ? '' : 'i',
            );

        lines[lineIdx] = line.replace(regex, replaceQuery);
        const newContent = lines.join('\n');
        await window.api.fs.writeFile(result.file, newContent);

        toast.success(`Replaced in ${result.file}:${result.line}`);

        // Re-run search to update results
        handleSearch();
      }
    } catch (e) {
      toast.error(`Replace failed: ${(e as Error).message}`);
    }
  };

  const handleReplaceSelected = async () => {
    if (selectedResults.size === 0) {
      toast.info('No results selected');
      return;
    }

    const fileChanges = new Map<string, { content: string; changes: SearchResult[] }>();

    // Group changes by file
    for (const fr of results) {
      for (const r of fr.results) {
        const key = `${r.file}:${r.line}:${r.column}`;
        if (selectedResults.has(key)) {
          if (!fileChanges.has(r.file)) {
            const content = await window.api.fs.readFile(r.file);
            fileChanges.set(r.file, { content, changes: [] });
          }
          fileChanges.get(r.file)!.changes.push(r);
        }
      }
    }

    let replaced = 0;
    for (const [file, { content, changes }] of fileChanges) {
      try {
        const lines = content.split('\n');

        // Sort changes by line number descending to avoid offset issues
        const sortedChanges = [...changes].sort((a, b) => b.line - a.line);

        for (const change of sortedChanges) {
          const lineIdx = change.line - 1;
          if (lineIdx >= 0 && lineIdx < lines.length) {
            const regex = useRegex
              ? new RegExp(searchQuery, caseSensitive ? '' : 'i')
              : new RegExp(
                  searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
                  caseSensitive ? '' : 'i',
                );
            lines[lineIdx] = lines[lineIdx].replace(regex, replaceQuery);
            replaced++;
          }
        }

        await window.api.fs.writeFile(file, lines.join('\n'));
      } catch (e) {
        toast.error(`Failed to update ${file}: ${(e as Error).message}`);
      }
    }

    toast.success(`Replaced ${replaced} occurrences in ${fileChanges.size} files`);
    handleSearch();
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

  const toggleResult = (key: string) => {
    setSelectedResults((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const selectAllInFile = (file: string) => {
    setSelectedResults((prev) => {
      const next = new Set(prev);
      const fileResult = results.find((f) => f.file === file);
      if (fileResult) {
        for (const r of fileResult.results) {
          next.add(`${r.file}:${r.line}:${r.column}`);
        }
      }
      return next;
    });
  };

  const deselectAllInFile = (file: string) => {
    setSelectedResults((prev) => {
      const next = new Set(prev);
      const fileResult = results.find((f) => f.file === file);
      if (fileResult) {
        for (const r of fileResult.results) {
          next.delete(`${r.file}:${r.line}:${r.column}`);
        }
      }
      return next;
    });
  };

  const handleGoToResult = async (result: SearchResult) => {
    try {
      const content = await window.api.fs.readFile(result.file);
      const ext = result.file.split('.').pop() || '';
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
        relativePath: result.file,
        name: result.file.split('/').pop() || result.file,
        language: languageMap[ext] || 'plaintext',
        content,
        original: content,
        dirty: false,
      });

      toast.info(`Go to line ${result.line}`);
    } catch (e) {
      toast.error(`Failed to open file: ${(e as Error).message}`);
    }
  };

  if (!showFindReplace) return null;

  return (
    <div className="modal-scrim fixed inset-0 z-50 flex items-start justify-center pt-20 ds-transition">
      <div className="glass-panel glass-modal-lg flex w-[700px] max-h-[80vh] flex-col ds-transition">
        <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
          <h2 className="text-sm font-medium text-fg">Find and Replace in Files</h2>
          <button
            type="button"
            onClick={() => setShowFindReplace(false)}
            className="text-fg-muted hover:text-fg"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-3 border-b border-border-soft p-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search"
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </div>
            <button
              type="button"
              onClick={handleSearch}
              disabled={loading}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {loading ? 'Searching…' : 'Search'}
            </button>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={replaceQuery}
              onChange={(e) => setReplaceQuery(e.target.value)}
              placeholder="Replace"
              className="flex-1 rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
            <button
              type="button"
              onClick={handleReplaceSelected}
              disabled={loading || selectedResults.size === 0}
              className="rounded-md bg-success px-4 py-2 text-sm font-medium text-white hover:bg-success/90 disabled:opacity-50"
            >
              Replace Selected ({selectedResults.size})
            </button>
          </div>

          <div className="flex items-center gap-4 text-xs text-fg-muted">
            <label className="flex cursor-pointer items-center gap-1 hover:text-fg">
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => setCaseSensitive(e.target.checked)}
                className="h-3 w-3 accent-accent"
              />
              Case sensitive
            </label>
            <label className="flex cursor-pointer items-center gap-1 hover:text-fg">
              <input
                type="checkbox"
                checked={wholeWord}
                onChange={(e) => setWholeWord(e.target.checked)}
                className="h-3 w-3 accent-accent"
              />
              Whole word
            </label>
            <label className="flex cursor-pointer items-center gap-1 hover:text-fg">
              <input
                type="checkbox"
                checked={useRegex}
                onChange={(e) => setUseRegex(e.target.checked)}
                className="h-3 w-3 accent-accent"
              />
              Regex
            </label>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex h-32 items-center justify-center text-fg-muted">
              <svg className="mr-2 h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Searching…
            </div>
          ) : results.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-fg-muted">
              {searchQuery ? 'No results found' : 'Enter a search term'}
            </div>
          ) : (
            <div>
              <div className="border-b border-border-soft px-4 py-2 text-xs text-fg-muted">
                {totalMatches} results in {results.length} files
              </div>
              {results.map((fr) => (
                <div key={fr.file}>
                  <button
                    type="button"
                    onClick={() => toggleFile(fr.file)}
                    className="flex w-full items-center gap-2 border-b border-border-soft px-4 py-2 text-left hover:bg-bg-hover"
                  >
                    <svg
                      className={`h-3 w-3 text-fg-subtle transition-transform ${expandedFiles.has(fr.file) ? 'rotate-90' : ''}`}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-sm text-cyan">{fr.file}</span>
                    <span className="text-xs text-fg-subtle">({fr.results.length})</span>
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          selectAllInFile(fr.file);
                        }}
                        className="px-1 text-xs text-fg-subtle hover:text-fg"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deselectAllInFile(fr.file);
                        }}
                        className="px-1 text-xs text-fg-subtle hover:text-fg"
                      >
                        Deselect
                      </button>
                    </div>
                  </button>

                  {expandedFiles.has(fr.file) && (
                    <div className="bg-bg-deep/50">
                      {fr.results.map((r, idx) => {
                        const key = `${r.file}:${r.line}:${r.column}`;
                        const isSelected = selectedResults.has(key);

                        return (
                          <div
                            key={idx}
                            className="group flex items-start gap-2 px-6 py-1.5 hover:bg-bg-hover"
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleResult(key)}
                              className="mt-1 h-3 w-3 accent-accent"
                            />
                            <span className="w-12 text-right text-xs text-fg-subtle">{r.line}</span>
                            <div className="flex-1 truncate font-mono text-xs text-fg-muted">
                              {r.lineContent.slice(0, r.matchStart)}
                              <span className="bg-accent/35 text-fg">
                                {r.lineContent.slice(r.matchStart, r.matchEnd)}
                              </span>
                              {r.lineContent.slice(r.matchEnd)}
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                              <button
                                type="button"
                                onClick={() => handleGoToResult(r)}
                                className="p-1 text-fg-muted hover:text-fg"
                                title="Go to location"
                              >
                                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleReplace(r)}
                                className="p-1 text-fg-muted hover:text-success"
                                title="Replace this occurrence"
                              >
                                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
