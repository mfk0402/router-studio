import { useEffect, useMemo, useState, useRef } from 'react';
import * as monaco from 'monaco-editor';
import { useApp } from '../store/appStore';
import FileTree from './FileTree';
import OutlinePanel from './OutlinePanel';
import SourceControlPanel from './SourceControlPanel';
import type { FileEntry } from '../../shared/types';
import { extToLanguage } from '../lib/fileUtils';

type SidebarTab = 'explorer' | 'outline' | 'git';

export default function Sidebar() {
  const projectRoot = useApp((s) => s.projectRoot);
  const fileTree = useApp((s) => s.fileTree);
  const setProjectRoot = useApp((s) => s.setProjectRoot);
  const setFileTree = useApp((s) => s.setFileTree);
  const pushLog = useApp((s) => s.pushLog);
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
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, pushLog]);

  const openFolder = async () => {
    pushLog('info', 'Open Folder requested…');
    try {
      const root = await window.api.fs.openFolder();
      if (!root) {
        pushLog('info', 'Open Folder canceled.');
        return;
      }
      setProjectRoot(root);
      const tree = await window.api.fs.listFiles();
      setFileTree(tree);
      pushLog('info', `Opened folder: ${root}`);
    } catch (e) {
      console.error('[openFolder]', e);
      pushLog('error', `Open Folder failed: ${(e as Error).message}`);
    }
  };

  const refresh = async () => {
    if (!projectRoot) return;
    const tree = await window.api.fs.listFiles();
    setFileTree(tree);
  };

  const explorerHeader = useMemo(
    () => (
      <div className="flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
        <span>Explorer</span>
        <div className="flex gap-1">
          <button
            className="rounded px-1 text-fg-muted hover:bg-bg-hover hover:text-fg"
            title="Refresh"
            onClick={refresh}
          >
            ↻
          </button>
          <button
            className="rounded px-1 text-fg-muted hover:bg-bg-hover hover:text-fg"
            title="Open Folder"
            onClick={openFolder}
          >
            📁
          </button>
        </div>
      </div>
    ),
    [projectRoot],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Sidebar tabs */}
      <div className="flex border-b border-border-soft">
        <button
          onClick={() => setActiveTab('explorer')}
          className={`flex-1 px-2 py-2 text-xs font-medium transition-colors ${
            activeTab === 'explorer'
              ? 'border-b-2 border-accent text-fg'
              : 'text-fg-muted hover:text-fg'
          }`}
          title="Explorer (Files)"
        >
          📁
        </button>
        <button
          onClick={() => setActiveTab('outline')}
          className={`flex-1 px-2 py-2 text-xs font-medium transition-colors ${
            activeTab === 'outline'
              ? 'border-b-2 border-accent text-fg'
              : 'text-fg-muted hover:text-fg'
          }`}
          title="Outline (Symbols)"
        >
          🗂️
        </button>
        <button
          onClick={() => setActiveTab('git')}
          className={`flex-1 px-2 py-2 text-xs font-medium transition-colors ${
            activeTab === 'git'
              ? 'border-b-2 border-accent text-fg'
              : 'text-fg-muted hover:text-fg'
          }`}
          title="Source Control (Git)"
        >
          🔀
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'explorer' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {explorerHeader}
          <div className="px-2 pb-2">
            <input
              type="text"
              placeholder="Search files…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-md border border-border bg-bg px-2 py-1 text-xs text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-1 pb-4">
            {!projectRoot ? (
              <div className="p-3 text-center text-xs text-fg-muted">
                No project folder open.
                <button
                  onClick={openFolder}
                  className="mx-auto mt-2 block rounded-md bg-accent px-2 py-1 text-white hover:bg-accent/80"
                >
                  Open Folder
                </button>
              </div>
            ) : searchResults ? (
              <SearchResults results={searchResults} loading={loadingSearch} />
            ) : fileTree ? (
              <FileTree node={fileTree} depth={0} />
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
  );
}

function SearchResults({ results, loading }: { results: FileEntry[]; loading: boolean }) {
  const openTab = useApp((s) => s.openTab);
  const pushLog = useApp((s) => s.pushLog);

  const open = async (f: FileEntry) => {
    try {
      const content = await window.api.fs.readFile(f.relativePath);
      openTab({
        relativePath: f.relativePath,
        name: f.name,
        language: extToLanguage(f.name),
        content,
        original: content,
        dirty: false,
      });
    } catch (e) {
      pushLog('error', `Open failed: ${(e as Error).message}`);
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

