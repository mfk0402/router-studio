import { memo, useCallback, useEffect, useMemo, useState, useRef, type ReactNode } from 'react';
import * as monaco from 'monaco-editor';
import { useApp } from '../store/appStore';
import FileTree from './FileTree';
import OutlinePanel from './OutlinePanel';
import SourceControlPanel from './SourceControlPanel';
import type { FileEntry } from '../../shared/types';
import { extToLanguage } from '../lib/fileUtils';

type SidebarTab = 'explorer' | 'outline' | 'git';

function ActivityIcon({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex h-11 w-full shrink-0 items-center justify-center border-l-2 text-[1.15rem] leading-none transition-colors duration-layout ${
        active
          ? 'border-l-accent bg-accent/10 text-fg'
          : 'border-l-transparent text-fg-muted hover:bg-bg-hover hover:text-fg'
      }`}
    >
      {children}
    </button>
  );
}

function Sidebar() {
  const projectRoot = useApp((s) => s.projectRoot);
  const fileTree = useApp((s) => s.fileTree);
  const projectLoading = useApp((s) => s.projectLoading);
  const projectLoadingLabel = useApp((s) => s.projectLoadingLabel);
  const setProjectRoot = useApp((s) => s.setProjectRoot);
  const pickAndOpenProjectFolder = useApp((s) => s.pickAndOpenProjectFolder);
  const setFileTree = useApp((s) => s.setFileTree);
  const setProjectLoading = useApp((s) => s.setProjectLoading);
  const pushLog = useApp((s) => s.pushLog);
  const setShowSettings = useApp((s) => s.setShowSettings);
  const editorInstance = useApp((s) => s.editorInstance);
  const [activeTab, setActiveTab] = useState<SidebarTab>('explorer');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FileEntry[] | null>(null);
  const [loadingSearch, setLoadingSearch] = useState(false);
  // Create a ref that tracks the editor instance
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  editorRef.current = editorInstance as monaco.editor.IStandaloneCodeEditor | null;

  useEffect(() => {
    (async () => {
      const existing = await window.api.fs.getRoot();
      if (existing) {
        setProjectRoot(existing);
        const tree = await window.api.fs.listFiles();
        setFileTree(tree);
      }
    })();
  }, [setProjectRoot, setFileTree]);

  useEffect(() => {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    setLoadingSearch(true);
    const handle = setTimeout(async () => {
      try {
        const res = await window.api.fs.searchFiles(query);
        if (!cancelled) setSearchResults(res);
      } catch (e) {
        if (!cancelled) pushLog('error', `Search failed: ${(e as Error).message}`);
      } finally {
        if (!cancelled) setLoadingSearch(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, pushLog]);

  const openFolder = useCallback(() => {
    void pickAndOpenProjectFolder();
  }, [pickAndOpenProjectFolder]);

  const refresh = useCallback(async () => {
    if (!projectRoot) return;
    setProjectLoading(true, 'Refreshing files...');
    try {
      const tree = await window.api.fs.listFiles();
      setFileTree(tree);
    } catch (e) {
      pushLog('warn', `Refresh failed: ${(e as Error).message}`);
    } finally {
      setProjectLoading(false);
    }
  }, [projectRoot, pushLog, setFileTree, setProjectLoading]);

  const explorerHeader = useMemo(
    () => (
      <div className="flex items-center justify-between px-3 py-2">
        <span className="section-label">Explorer</span>
        <div className="flex gap-0.5">
          <button
            type="button"
            className="rounded px-1.5 py-1 text-sm text-fg-muted hover:bg-bg-hover hover:text-fg"
            title="Refresh"
            onClick={refresh}
          >
            ↻
          </button>
          <button
            type="button"
            className="rounded px-1.5 py-1 text-sm text-fg-muted hover:bg-bg-hover hover:text-fg"
            title="Open Folder"
            onClick={openFolder}
          >
            📁
          </button>
        </div>
      </div>
    ),
    [openFolder, refresh],
  );

  return (
    <div className="flex h-full min-h-0 flex-row">
      <nav className="activity-bar flex flex-col items-stretch py-1.5" aria-label="Side bar views">
        <ActivityIcon
          active={activeTab === 'explorer'}
          onClick={() => setActiveTab('explorer')}
          title="Explorer (files)"
        >
          📁
        </ActivityIcon>
        <ActivityIcon
          active={activeTab === 'outline'}
          onClick={() => setActiveTab('outline')}
          title="Outline (symbols)"
        >
          🗂️
        </ActivityIcon>
        <ActivityIcon
          active={activeTab === 'git'}
          onClick={() => setActiveTab('git')}
          title="Source control"
        >
          🔀
        </ActivityIcon>
        <div className="min-h-2 flex-1" aria-hidden />
        <button
          type="button"
          title="Settings"
          className="flex h-11 w-full shrink-0 items-center justify-center border-l-2 border-l-transparent text-[1.05rem] text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg"
          onClick={() => setShowSettings(true)}
        >
          ⚙️
        </button>
      </nav>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Panel content */}
      {activeTab === 'explorer' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {explorerHeader}
            <div className="px-3 pb-1 pt-1">
            <input
              type="text"
              placeholder="Search files…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs text-fg placeholder:text-fg-subtle shadow-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
            />
          </div>
          <div
            className="min-h-0 flex-1 overflow-auto px-2 pb-6 pt-1"
            onContextMenuCapture={(e) => {
              e.preventDefault();
            }}
          >
            {!projectRoot ? (
              <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
                <p className="max-w-[14rem] text-xs leading-relaxed text-fg-muted">
                  No project folder open.
                </p>
                <button
                  type="button"
                  onClick={openFolder}
                  disabled={projectLoading}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white shadow-md shadow-accent/20 transition-colors hover:bg-accent/90 disabled:cursor-wait disabled:opacity-70"
                >
                  {projectLoading ? <span className="loading-spinner h-3 w-3" aria-hidden /> : null}
                  <span>{projectLoading ? projectLoadingLabel ?? 'Opening...' : 'Open Folder'}</span>
                </button>
              </div>
            ) : searchResults ? (
              <MemoSearchResults results={searchResults} loading={loadingSearch} />
            ) : fileTree ? (
              <FileTree node={fileTree} depth={0} />
            ) : projectLoading ? (
              <div className="flex items-center gap-2 p-3 text-xs text-fg-muted">
                <span className="loading-spinner" aria-hidden />
                <span>{projectLoadingLabel ?? 'Loading files...'}</span>
              </div>
            ) : (
              <div className="p-3 text-xs text-fg-muted">Loading…</div>
            )}
          </div>
        </div>
      ) : activeTab === 'outline' ? (
        <OutlinePanel editorRef={editorRef} />
      ) : (
        <SourceControlPanel />
      )}
      </div>
    </div>
  );
}

export default memo(Sidebar);

function SearchResults({ results, loading }: { results: FileEntry[]; loading: boolean }) {
  const open = async (f: FileEntry) => {
    try {
      const content = await window.api.fs.readFile(f.relativePath);
      useApp.getState().openTab({
        relativePath: f.relativePath,
        name: f.name,
        language: extToLanguage(f.name),
        content,
        original: content,
        dirty: false,
      });
    } catch (e) {
      useApp.getState().pushLog('error', `Open failed: ${(e as Error).message}`);
    }
  };

  if (loading && results.length === 0) {
    return <div className="p-3 text-xs text-fg-muted">Searching…</div>;
  }
  if (results.length === 0) {
    return <div className="p-3 text-xs text-fg-muted">No matches.</div>;
  }
  return (
    <div className="space-y-0.5">
      {results.map((r) => (
        <button
          key={r.relativePath}
          onClick={() => open(r)}
          className="block w-full truncate rounded px-2 py-1 text-left text-xs text-fg-muted hover:bg-bg-hover hover:text-fg"
          title={r.relativePath}
        >
          <span className="text-fg">{r.name}</span>
          <span className="ml-2 text-fg-subtle">{r.relativePath}</span>
        </button>
      ))}
    </div>
  );
}

const MemoSearchResults = memo(SearchResults);
