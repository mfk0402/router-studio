import { useEffect, useState, useMemo } from 'react';
import * as monaco from 'monaco-editor';
import { useApp } from '../store/appStore';
import type { FileEntry } from '../../shared/types';
import { extToLanguage } from '../lib/fileUtils';

// Symbol kind icons (same as OutlinePanel)
const SYMBOL_ICONS: Record<number, string> = {
  [monaco.languages.SymbolKind.File]: '📄',
  [monaco.languages.SymbolKind.Module]: '📦',
  [monaco.languages.SymbolKind.Namespace]: '📁',
  [monaco.languages.SymbolKind.Package]: '📦',
  [monaco.languages.SymbolKind.Class]: '🔷',
  [monaco.languages.SymbolKind.Method]: '🔹',
  [monaco.languages.SymbolKind.Property]: '📋',
  [monaco.languages.SymbolKind.Field]: '📋',
  [monaco.languages.SymbolKind.Constructor]: '🔨',
  [monaco.languages.SymbolKind.Enum]: '📊',
  [monaco.languages.SymbolKind.Interface]: '🔶',
  [monaco.languages.SymbolKind.Function]: '⚡',
  [monaco.languages.SymbolKind.Variable]: '📌',
  [monaco.languages.SymbolKind.Constant]: '🔒',
  [monaco.languages.SymbolKind.String]: '📝',
  [monaco.languages.SymbolKind.Number]: '#',
  [monaco.languages.SymbolKind.Boolean]: '✓',
  [monaco.languages.SymbolKind.Array]: '[]',
  [monaco.languages.SymbolKind.Object]: '{}',
  [monaco.languages.SymbolKind.Key]: '🔑',
  [monaco.languages.SymbolKind.Null]: '∅',
  [monaco.languages.SymbolKind.EnumMember]: '📊',
  [monaco.languages.SymbolKind.Struct]: '🏗️',
  [monaco.languages.SymbolKind.Event]: '⚡',
  [monaco.languages.SymbolKind.Operator]: '±',
  [monaco.languages.SymbolKind.TypeParameter]: 'T',
};

interface SymbolResult {
  name: string;
  kind: number;
  containerName?: string;
  line: number;
}

type QuickOpenMode = 'file' | 'symbol';

export default function QuickOpen() {
  const open = useApp((s) => s.showQuickOpen);
  const setOpen = useApp((s) => s.setShowQuickOpen);
  const openTab = useApp((s) => s.openTab);
  const pushLog = useApp((s) => s.pushLog);
  const projectRoot = useApp((s) => s.projectRoot);
  const editorInstance = useApp((s) => s.editorInstance);

  const [query, setQuery] = useState('');
  const [fileResults, setFileResults] = useState<FileEntry[]>([]);
  const [symbolResults, setSymbolResults] = useState<SymbolResult[]>([]);
  const [selected, setSelected] = useState(0);

  // Determine mode based on query prefix
  const mode: QuickOpenMode = query.startsWith('@') ? 'symbol' : 'file';
  const searchQuery = mode === 'symbol' ? query.slice(1) : query;
  const results = mode === 'symbol' ? symbolResults : fileResults;

  useEffect(() => {
    if (!open) {
      setQuery('');
      setFileResults([]);
      setSymbolResults([]);
      setSelected(0);
    }
  }, [open]);

  // File search
  useEffect(() => {
    if (!open || !projectRoot || mode !== 'file') return;
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const res = await window.api.fs.searchFiles(searchQuery || '');
        if (!cancelled) {
          setFileResults(res.slice(0, 50));
          setSelected(0);
        }
      } catch (e) {
        if (!cancelled) pushLog('error', `Search failed: ${(e as Error).message}`);
      }
    }, 80);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [searchQuery, open, projectRoot, pushLog, mode]);

  // Symbol search
  useEffect(() => {
    if (!open || mode !== 'symbol') return;
    
    const editor = editorInstance as monaco.editor.IStandaloneCodeEditor | null;
    if (!editor) {
      setSymbolResults([]);
      return;
    }

    const model = editor.getModel();
    if (!model) {
      setSymbolResults([]);
      return;
    }

    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const content = model.getValue();
        const language = model.getLanguageId();
        const extractedSymbols = extractSymbolsFromCode(content, language);
        if (cancelled) return;

        // Flatten and filter symbols
        const flattened = flattenMonacoSymbols(extractedSymbols);
        const filtered = searchQuery
          ? flattened.filter((s) => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
          : flattened;

        setSymbolResults(filtered.slice(0, 50));
        setSelected(0);
      } catch (e) {
        if (!cancelled) {
          console.error('[QuickOpen] Symbol search failed:', e);
          setSymbolResults([]);
        }
      }
    }, 100);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [searchQuery, open, mode, editorInstance]);

  if (!open) return null;

  const pickFile = async (f: FileEntry) => {
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
      setOpen(false);
    } catch (e) {
      pushLog('error', `Open failed: ${(e as Error).message}`);
    }
  };

  const pickSymbol = (s: SymbolResult) => {
    const editor = editorInstance as monaco.editor.IStandaloneCodeEditor | null;
    if (!editor) return;

    editor.revealLineInCenter(s.line);
    editor.setPosition({ lineNumber: s.line, column: 1 });
    editor.focus();
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(results.length - 1, s + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(0, s - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (mode === 'file') {
        const f = fileResults[selected];
        if (f) void pickFile(f);
      } else {
        const s = symbolResults[selected];
        if (s) pickSymbol(s);
      }
    }
  };

  const placeholder = mode === 'symbol'
    ? 'Go to symbol in current file…'
    : projectRoot
    ? 'Go to file… (type @ for symbols)'
    : 'Open a folder first';

  return (
    <div
      className="modal-scrim fixed inset-0 z-50 flex items-start justify-center pt-24 ds-transition"
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-panel glass-modal-lg flex w-full max-w-xl flex-col overflow-hidden ds-transition"
      >
        {/* Mode indicator */}
        <div className="flex items-center gap-2 border-b border-border-soft px-4 py-1.5">
          <span className={`text-[10px] font-medium ${mode === 'file' ? 'text-accent' : 'text-fg-subtle'}`}>
            Files
          </span>
          <span className="text-fg-subtle">|</span>
          <span className={`text-[10px] font-medium ${mode === 'symbol' ? 'text-accent' : 'text-fg-subtle'}`}>
            @Symbols
          </span>
        </div>

        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={mode === 'file' && !projectRoot}
          className="w-full bg-transparent px-4 py-3 text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
        />
        <div className="max-h-80 overflow-auto border-t border-border-soft">
          {mode === 'file' ? (
            fileResults.length === 0 ? (
              <div className="p-4 text-center text-xs text-fg-muted">
                {projectRoot ? 'Type to search files…' : 'No folder open.'}
              </div>
            ) : (
              fileResults.map((f, i) => (
                <button
                  key={f.relativePath}
                  onClick={() => pickFile(f)}
                  className={[
                    'flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-xs',
                    i === selected ? 'bg-bg-hover text-fg' : 'text-fg-muted hover:bg-bg-hover',
                  ].join(' ')}
                >
                  <span className="truncate text-fg">{f.name}</span>
                  <span className="truncate text-fg-subtle">{f.relativePath}</span>
                </button>
              ))
            )
          ) : (
            symbolResults.length === 0 ? (
              <div className="p-4 text-center text-xs text-fg-muted">
                {editorInstance ? 'No symbols found (type @ then symbol name)' : 'Open a file first'}
              </div>
            ) : (
              symbolResults.map((s, i) => (
                <button
                  key={`${s.name}-${s.line}`}
                  onClick={() => pickSymbol(s)}
                  className={[
                    'flex w-full items-center gap-3 px-4 py-2 text-left text-xs',
                    i === selected ? 'bg-bg-hover text-fg' : 'text-fg-muted hover:bg-bg-hover',
                  ].join(' ')}
                >
                  <span className="flex-shrink-0">{SYMBOL_ICONS[s.kind] || '•'}</span>
                  <span className="truncate text-fg">{s.name}</span>
                  {s.containerName && (
                    <span className="truncate text-fg-subtle">in {s.containerName}</span>
                  )}
                  <span className="ml-auto text-fg-subtle">:{s.line}</span>
                </button>
              ))
            )
          )}
        </div>
      </div>
    </div>
  );
}

// Helper types and functions
interface MonacoSymbol {
  name: string;
  detail?: string;
  kind: number;
  range: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
  selectionRange: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
  children?: MonacoSymbol[];
}

function flattenMonacoSymbols(symbols: MonacoSymbol[], containerName = ''): SymbolResult[] {
  const result: SymbolResult[] = [];
  for (const symbol of symbols) {
    result.push({
      name: symbol.name,
      kind: symbol.kind,
      containerName: containerName || undefined,
      line: symbol.selectionRange.startLineNumber,
    });
    if (symbol.children && symbol.children.length > 0) {
      result.push(...flattenMonacoSymbols(symbol.children, symbol.name));
    }
  }
  return result;
}

// Extract symbols from code using regex patterns
function extractSymbolsFromCode(content: string, language: string): MonacoSymbol[] {
  const symbols: MonacoSymbol[] = [];
  const lines = content.split('\n');

  // Language-specific patterns
  const patterns: Record<string, Array<{ regex: RegExp; kind: number; group?: number }>> = {
    typescript: [
      { regex: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/m, kind: monaco.languages.SymbolKind.Class },
      { regex: /^(?:export\s+)?interface\s+(\w+)/m, kind: monaco.languages.SymbolKind.Interface },
      { regex: /^(?:export\s+)?type\s+(\w+)/m, kind: monaco.languages.SymbolKind.Interface },
      { regex: /^(?:export\s+)?enum\s+(\w+)/m, kind: monaco.languages.SymbolKind.Enum },
      { regex: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/m, kind: monaco.languages.SymbolKind.Function },
      { regex: /^(?:export\s+)?const\s+(\w+)\s*=/m, kind: monaco.languages.SymbolKind.Constant },
      { regex: /^(?:export\s+)?let\s+(\w+)\s*=/m, kind: monaco.languages.SymbolKind.Variable },
      { regex: /^\s+(?:async\s+)?(\w+)\s*\([^)]*\)\s*[:{]/m, kind: monaco.languages.SymbolKind.Method },
    ],
    javascript: [
      { regex: /^(?:export\s+)?class\s+(\w+)/m, kind: monaco.languages.SymbolKind.Class },
      { regex: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/m, kind: monaco.languages.SymbolKind.Function },
      { regex: /^(?:export\s+)?const\s+(\w+)\s*=/m, kind: monaco.languages.SymbolKind.Constant },
      { regex: /^(?:export\s+)?let\s+(\w+)\s*=/m, kind: monaco.languages.SymbolKind.Variable },
    ],
    python: [
      { regex: /^class\s+(\w+)/m, kind: monaco.languages.SymbolKind.Class },
      { regex: /^(?:async\s+)?def\s+(\w+)/m, kind: monaco.languages.SymbolKind.Function },
      { regex: /^\s+(?:async\s+)?def\s+(\w+)/m, kind: monaco.languages.SymbolKind.Method },
    ],
  };

  // Get patterns for the language (fall back to typescript/js if not found)
  const langPatterns = patterns[language] || patterns['typescript'] || [];

  // Process each line
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    
    for (const pattern of langPatterns) {
      const match = line.match(pattern.regex);
      if (match) {
        const name = match[pattern.group || 1];
        if (name && !name.startsWith('_') && name !== 'constructor') {
          symbols.push({
            name,
            detail: '',
            kind: pattern.kind,
            range: {
              startLineNumber: lineNum + 1,
              startColumn: 1,
              endLineNumber: lineNum + 1,
              endColumn: line.length + 1,
            },
            selectionRange: {
              startLineNumber: lineNum + 1,
              startColumn: (match.index || 0) + 1,
              endLineNumber: lineNum + 1,
              endColumn: (match.index || 0) + match[0].length + 1,
            },
            children: [],
          });
        }
        break; // Only match one pattern per line
      }
    }
  }

  return symbols;
}
