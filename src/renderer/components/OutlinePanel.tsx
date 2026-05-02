import { useState, useEffect, useCallback, useMemo } from 'react';
import * as monaco from 'monaco-editor';
import { useApp } from '../store/appStore';

// Monaco symbol kinds mapped to icons and labels
const SYMBOL_ICONS: Record<number, { icon: string; label: string }> = {
  [monaco.languages.SymbolKind.File]: { icon: '📄', label: 'File' },
  [monaco.languages.SymbolKind.Module]: { icon: '📦', label: 'Module' },
  [monaco.languages.SymbolKind.Namespace]: { icon: '📁', label: 'Namespace' },
  [monaco.languages.SymbolKind.Package]: { icon: '📦', label: 'Package' },
  [monaco.languages.SymbolKind.Class]: { icon: '🔷', label: 'Class' },
  [monaco.languages.SymbolKind.Method]: { icon: '🔹', label: 'Method' },
  [monaco.languages.SymbolKind.Property]: { icon: '📋', label: 'Property' },
  [monaco.languages.SymbolKind.Field]: { icon: '📋', label: 'Field' },
  [monaco.languages.SymbolKind.Constructor]: { icon: '🔨', label: 'Constructor' },
  [monaco.languages.SymbolKind.Enum]: { icon: '📊', label: 'Enum' },
  [monaco.languages.SymbolKind.Interface]: { icon: '🔶', label: 'Interface' },
  [monaco.languages.SymbolKind.Function]: { icon: '⚡', label: 'Function' },
  [monaco.languages.SymbolKind.Variable]: { icon: '📌', label: 'Variable' },
  [monaco.languages.SymbolKind.Constant]: { icon: '🔒', label: 'Constant' },
  [monaco.languages.SymbolKind.String]: { icon: '📝', label: 'String' },
  [monaco.languages.SymbolKind.Number]: { icon: '#', label: 'Number' },
  [monaco.languages.SymbolKind.Boolean]: { icon: '✓', label: 'Boolean' },
  [monaco.languages.SymbolKind.Array]: { icon: '[]', label: 'Array' },
  [monaco.languages.SymbolKind.Object]: { icon: '{}', label: 'Object' },
  [monaco.languages.SymbolKind.Key]: { icon: '🔑', label: 'Key' },
  [monaco.languages.SymbolKind.Null]: { icon: '∅', label: 'Null' },
  [monaco.languages.SymbolKind.EnumMember]: { icon: '📊', label: 'Enum Member' },
  [monaco.languages.SymbolKind.Struct]: { icon: '🏗️', label: 'Struct' },
  [monaco.languages.SymbolKind.Event]: { icon: '⚡', label: 'Event' },
  [monaco.languages.SymbolKind.Operator]: { icon: '±', label: 'Operator' },
  [monaco.languages.SymbolKind.TypeParameter]: { icon: 'T', label: 'Type Parameter' },
};

export interface DocumentSymbol {
  name: string;
  detail: string;
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
  children: DocumentSymbol[];
}

interface OutlinePanelProps {
  editorRef: React.RefObject<monaco.editor.IStandaloneCodeEditor | null>;
}

export default function OutlinePanel({ editorRef }: OutlinePanelProps) {
  const [symbols, setSymbols] = useState<DocumentSymbol[]>([]);
  const [expandedSymbols, setExpandedSymbols] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [sortBy, setSortBy] = useState<'position' | 'name' | 'kind'>('position');
  const [isLoading, setIsLoading] = useState(false);

  const activeTabPath = useApp((s) => s.activeTabPath);

  // Fetch document symbols from Monaco
  const fetchSymbols = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) {
      setSymbols([]);
      return;
    }

    const model = editor.getModel();
    if (!model) {
      setSymbols([]);
      return;
    }

    setIsLoading(true);

    try {
      // Extract symbols using regex patterns (works for common languages)
      const content = model.getValue();
      const language = model.getLanguageId();
      const extractedSymbols = extractSymbolsFromCode(content, language);
      
      if (extractedSymbols.length > 0) {
        setSymbols(extractedSymbols);
        // Auto-expand top-level items
        const topLevelKeys = extractedSymbols.map((s) => `${s.name}-${s.kind}`);
        setExpandedSymbols(new Set(topLevelKeys));
      } else {
        setSymbols([]);
      }
    } catch (e) {
      console.error('[OutlinePanel] Failed to get symbols:', e);
      setSymbols([]);
    } finally {
      setIsLoading(false);
    }
  }, [editorRef]);

  // Refetch symbols when the active tab changes or editor model changes
  useEffect(() => {
    fetchSymbols();

    const editor = editorRef.current;
    if (!editor) return;

    // Re-fetch when model content changes (debounced)
    let timeoutId: ReturnType<typeof setTimeout>;
    const disposable = editor.onDidChangeModelContent(() => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(fetchSymbols, 500);
    });

    return () => {
      clearTimeout(timeoutId);
      disposable.dispose();
    };
  }, [activeTabPath, fetchSymbols]);

  // Toggle symbol expansion
  const toggleExpand = (symbolKey: string) => {
    setExpandedSymbols((prev) => {
      const next = new Set(prev);
      if (next.has(symbolKey)) {
        next.delete(symbolKey);
      } else {
        next.add(symbolKey);
      }
      return next;
    });
  };

  // Navigate to symbol
  const goToSymbol = (symbol: DocumentSymbol) => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.revealLineInCenter(symbol.selectionRange.startLineNumber);
    editor.setPosition({
      lineNumber: symbol.selectionRange.startLineNumber,
      column: symbol.selectionRange.startColumn,
    });
    editor.focus();
  };

  // Filter and sort symbols
  const processedSymbols = useMemo(() => {
    let result = [...symbols];

    // Filter by name
    if (filter.trim()) {
      const filterLower = filter.toLowerCase();
      const filterSymbols = (syms: DocumentSymbol[]): DocumentSymbol[] => {
        return syms
          .map((s) => ({
            ...s,
            children: filterSymbols(s.children || []),
          }))
          .filter(
            (s) =>
              s.name.toLowerCase().includes(filterLower) ||
              s.children.length > 0
          );
      };
      result = filterSymbols(result);
    }

    // Sort
    const sortSymbols = (syms: DocumentSymbol[]): DocumentSymbol[] => {
      const sorted = [...syms].sort((a, b) => {
        switch (sortBy) {
          case 'name':
            return a.name.localeCompare(b.name);
          case 'kind':
            return a.kind - b.kind || a.name.localeCompare(b.name);
          case 'position':
          default:
            return a.range.startLineNumber - b.range.startLineNumber;
        }
      });
      return sorted.map((s) => ({ ...s, children: sortSymbols(s.children || []) }));
    };
    result = sortSymbols(result);

    return result;
  }, [symbols, filter, sortBy]);

  // Render a symbol and its children
  const renderSymbol = (symbol: DocumentSymbol, depth: number = 0) => {
    const symbolKey = `${symbol.name}-${symbol.kind}-${symbol.range.startLineNumber}`;
    const isExpanded = expandedSymbols.has(symbolKey);
    const hasChildren = symbol.children && symbol.children.length > 0;
    const info = SYMBOL_ICONS[symbol.kind] || { icon: '•', label: 'Symbol' };

    return (
      <div key={symbolKey}>
        <div
          className="flex cursor-pointer items-center gap-1 rounded px-2 py-1 hover:bg-bg-hover"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          onClick={() => goToSymbol(symbol)}
        >
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(symbolKey);
              }}
              className="flex h-4 w-4 items-center justify-center text-fg-subtle hover:text-fg"
            >
              {isExpanded ? '▼' : '▶'}
            </button>
          ) : (
            <span className="w-4" />
          )}
          <span className="flex-shrink-0 text-xs" title={info.label}>
            {info.icon}
          </span>
          <span className="truncate text-xs text-fg">{symbol.name}</span>
          {symbol.detail && (
            <span className="ml-auto truncate text-[10px] text-fg-subtle">{symbol.detail}</span>
          )}
          <span className="ml-1 text-[10px] text-fg-subtle">:{symbol.range.startLineNumber}</span>
        </div>
        {hasChildren && isExpanded && (
          <div>
            {symbol.children.map((child) => renderSymbol(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (!activeTabPath) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-xs text-fg-muted">
        Open a file to see its outline
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-soft px-3 py-2">
        <span className="text-xs font-medium text-fg">Outline</span>
        <div className="flex items-center gap-1">
          <button
            onClick={fetchSymbols}
            className="rounded p-1 text-fg-muted hover:bg-bg-hover hover:text-fg"
            title="Refresh"
          >
            ↻
          </button>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'position' | 'name' | 'kind')}
            className="rounded border border-border bg-bg px-1.5 py-0.5 text-[10px] text-fg"
          >
            <option value="position">By Position</option>
            <option value="name">By Name</option>
            <option value="kind">By Kind</option>
          </select>
        </div>
      </div>

      {/* Filter */}
      <div className="border-b border-border-soft px-2 py-1.5">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter symbols..."
          className="w-full rounded border border-border bg-bg px-2 py-1 text-xs text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
        />
      </div>

      {/* Symbol list */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center p-4 text-xs text-fg-muted">
            Loading symbols...
          </div>
        ) : processedSymbols.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-4 text-center">
            <span className="text-xs text-fg-muted">
              {filter ? 'No matching symbols' : 'No symbols found'}
            </span>
            <span className="text-[10px] text-fg-subtle">
              Symbol support depends on the language
            </span>
          </div>
        ) : (
          <div className="py-1">
            {processedSymbols.map((symbol) => renderSymbol(symbol))}
          </div>
        )}
      </div>

      {/* Footer with stats */}
      {symbols.length > 0 && (
        <div className="border-t border-border-soft px-3 py-1 text-[10px] text-fg-subtle">
          {symbols.length} symbol{symbols.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}

// Export symbols for use in QuickOpen
export function useDocumentSymbols(editorRef: React.RefObject<monaco.editor.IStandaloneCodeEditor | null>) {
  const [symbols, setSymbols] = useState<DocumentSymbol[]>([]);

  const fetchSymbols = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return [];

    const model = editor.getModel();
    if (!model) return [];

    try {
      const content = model.getValue();
      const language = model.getLanguageId();
      const extractedSymbols = extractSymbolsFromCode(content, language);
      const flattened = flattenSymbols(extractedSymbols);
      setSymbols(flattened);
      return flattened;
    } catch {
      return [];
    }
  }, [editorRef]);

  return { symbols, fetchSymbols };
}

// Flatten nested symbols for quick open
function flattenSymbols(symbols: DocumentSymbol[], prefix = ''): DocumentSymbol[] {
  const result: DocumentSymbol[] = [];
  for (const symbol of symbols) {
    const name = prefix ? `${prefix}.${symbol.name}` : symbol.name;
    result.push({ ...symbol, name });
    if (symbol.children && symbol.children.length > 0) {
      result.push(...flattenSymbols(symbol.children, name));
    }
  }
  return result;
}

// Extract symbols from code using regex patterns
function extractSymbolsFromCode(content: string, language: string): DocumentSymbol[] {
  const symbols: DocumentSymbol[] = [];
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
      { regex: /^\s+(?:get|set)\s+(\w+)\s*\(/m, kind: monaco.languages.SymbolKind.Property },
    ],
    javascript: [
      { regex: /^(?:export\s+)?class\s+(\w+)/m, kind: monaco.languages.SymbolKind.Class },
      { regex: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/m, kind: monaco.languages.SymbolKind.Function },
      { regex: /^(?:export\s+)?const\s+(\w+)\s*=/m, kind: monaco.languages.SymbolKind.Constant },
      { regex: /^(?:export\s+)?let\s+(\w+)\s*=/m, kind: monaco.languages.SymbolKind.Variable },
      { regex: /^(?:export\s+)?var\s+(\w+)\s*=/m, kind: monaco.languages.SymbolKind.Variable },
      { regex: /^\s+(\w+)\s*\([^)]*\)\s*{/m, kind: monaco.languages.SymbolKind.Method },
    ],
    python: [
      { regex: /^class\s+(\w+)/m, kind: monaco.languages.SymbolKind.Class },
      { regex: /^(?:async\s+)?def\s+(\w+)/m, kind: monaco.languages.SymbolKind.Function },
      { regex: /^\s+(?:async\s+)?def\s+(\w+)/m, kind: monaco.languages.SymbolKind.Method },
      { regex: /^(\w+)\s*=/m, kind: monaco.languages.SymbolKind.Variable },
    ],
    go: [
      { regex: /^type\s+(\w+)\s+struct/m, kind: monaco.languages.SymbolKind.Struct },
      { regex: /^type\s+(\w+)\s+interface/m, kind: monaco.languages.SymbolKind.Interface },
      { regex: /^func\s+\(\w+\s+\*?\w+\)\s+(\w+)/m, kind: monaco.languages.SymbolKind.Method },
      { regex: /^func\s+(\w+)/m, kind: monaco.languages.SymbolKind.Function },
      { regex: /^var\s+(\w+)/m, kind: monaco.languages.SymbolKind.Variable },
      { regex: /^const\s+(\w+)/m, kind: monaco.languages.SymbolKind.Constant },
    ],
    rust: [
      { regex: /^(?:pub\s+)?struct\s+(\w+)/m, kind: monaco.languages.SymbolKind.Struct },
      { regex: /^(?:pub\s+)?enum\s+(\w+)/m, kind: monaco.languages.SymbolKind.Enum },
      { regex: /^(?:pub\s+)?trait\s+(\w+)/m, kind: monaco.languages.SymbolKind.Interface },
      { regex: /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/m, kind: monaco.languages.SymbolKind.Function },
      { regex: /^\s+(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/m, kind: monaco.languages.SymbolKind.Method },
      { regex: /^(?:pub\s+)?const\s+(\w+)/m, kind: monaco.languages.SymbolKind.Constant },
      { regex: /^(?:pub\s+)?static\s+(\w+)/m, kind: monaco.languages.SymbolKind.Variable },
    ],
    java: [
      { regex: /^(?:public\s+)?(?:abstract\s+)?class\s+(\w+)/m, kind: monaco.languages.SymbolKind.Class },
      { regex: /^(?:public\s+)?interface\s+(\w+)/m, kind: monaco.languages.SymbolKind.Interface },
      { regex: /^(?:public\s+)?enum\s+(\w+)/m, kind: monaco.languages.SymbolKind.Enum },
      { regex: /^\s+(?:public|private|protected)?\s*(?:static\s+)?(?:\w+(?:<[^>]+>)?)\s+(\w+)\s*\(/m, kind: monaco.languages.SymbolKind.Method },
    ],
    c: [
      { regex: /^(?:typedef\s+)?struct\s+(\w+)/m, kind: monaco.languages.SymbolKind.Struct },
      { regex: /^(?:typedef\s+)?enum\s+(\w+)/m, kind: monaco.languages.SymbolKind.Enum },
      { regex: /^(?:\w+\s+)+(\w+)\s*\([^)]*\)\s*{/m, kind: monaco.languages.SymbolKind.Function },
      { regex: /^#define\s+(\w+)/m, kind: monaco.languages.SymbolKind.Constant },
    ],
    cpp: [
      { regex: /^(?:template\s*<[^>]+>\s*)?class\s+(\w+)/m, kind: monaco.languages.SymbolKind.Class },
      { regex: /^(?:template\s*<[^>]+>\s*)?struct\s+(\w+)/m, kind: monaco.languages.SymbolKind.Struct },
      { regex: /^namespace\s+(\w+)/m, kind: monaco.languages.SymbolKind.Namespace },
      { regex: /^(?:\w+\s+)+(\w+)\s*\([^)]*\)\s*(?:const)?\s*{/m, kind: monaco.languages.SymbolKind.Function },
    ],
    csharp: [
      { regex: /^(?:public\s+)?(?:partial\s+)?class\s+(\w+)/m, kind: monaco.languages.SymbolKind.Class },
      { regex: /^(?:public\s+)?interface\s+(\w+)/m, kind: monaco.languages.SymbolKind.Interface },
      { regex: /^(?:public\s+)?enum\s+(\w+)/m, kind: monaco.languages.SymbolKind.Enum },
      { regex: /^(?:public\s+)?struct\s+(\w+)/m, kind: monaco.languages.SymbolKind.Struct },
      { regex: /^\s+(?:public|private|protected|internal)?\s*(?:static\s+)?(?:async\s+)?(?:\w+(?:<[^>]+>)?)\s+(\w+)\s*\(/m, kind: monaco.languages.SymbolKind.Method },
    ],
    php: [
      { regex: /^(?:abstract\s+)?class\s+(\w+)/m, kind: monaco.languages.SymbolKind.Class },
      { regex: /^interface\s+(\w+)/m, kind: monaco.languages.SymbolKind.Interface },
      { regex: /^trait\s+(\w+)/m, kind: monaco.languages.SymbolKind.Class },
      { regex: /^(?:public|private|protected)?\s*(?:static\s+)?function\s+(\w+)/m, kind: monaco.languages.SymbolKind.Function },
    ],
    ruby: [
      { regex: /^class\s+(\w+)/m, kind: monaco.languages.SymbolKind.Class },
      { regex: /^module\s+(\w+)/m, kind: monaco.languages.SymbolKind.Module },
      { regex: /^\s*def\s+(\w+)/m, kind: monaco.languages.SymbolKind.Method },
    ],
    css: [
      { regex: /^\.(\w[\w-]*)/m, kind: monaco.languages.SymbolKind.Class },
      { regex: /^#(\w[\w-]*)/m, kind: monaco.languages.SymbolKind.Variable },
      { regex: /^@(\w+)/m, kind: monaco.languages.SymbolKind.Key },
    ],
    html: [
      { regex: /<(\w+)[^>]*id="([^"]+)"/m, kind: monaco.languages.SymbolKind.Variable, group: 2 },
      { regex: /<(\w+)[^>]*class="([^"]+)"/m, kind: monaco.languages.SymbolKind.Class, group: 2 },
    ],
    json: [
      { regex: /"(\w+)"\s*:/m, kind: monaco.languages.SymbolKind.Key },
    ],
    yaml: [
      { regex: /^(\w[\w-]*):/m, kind: monaco.languages.SymbolKind.Key },
    ],
    markdown: [
      { regex: /^#+\s+(.+)$/m, kind: monaco.languages.SymbolKind.String },
    ],
  };

  // Get patterns for the language (fall back to generic if not found)
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
              startColumn: match.index! + 1,
              endLineNumber: lineNum + 1,
              endColumn: match.index! + match[0].length + 1,
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
