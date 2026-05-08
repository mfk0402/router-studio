import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import Editor, { loader, type OnMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { useApp } from '../store/appStore';
import { useSettings } from '../store/settingsStore';
import { useResolvedTheme } from '../hooks/useResolvedTheme';
import { useShallow } from 'zustand/react/shallow';
import { registerGhostInlineCompletions } from '../lib/ghostInlineCompletion';
import { registerUserSnippetCompletions } from '../lib/userSnippetsMonaco';
import InlineEditWidget from './InlineEditWidget';
import { lspHoverToMonacoMarkdown } from '../lib/lspHoverMarkdown';
import type { LspRangeWire } from '../../shared/lspWire';

import CodeActionsMenu from './CodeActionsMenu';
import ContextMenu from './ContextMenu';
import type { ContextMenuItem } from './ContextMenu';

// Ensure Monaco uses bundled workers (fully local, no CDN required).
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript' || label === 'typescriptreact' || label === 'javascriptreact')
      return new tsWorker();
    return new editorWorker();
  },
};

// Use the npm-bundled monaco instance so nothing is fetched from a CDN.
loader.config({ monaco });

/** Syntax tokens — midnight / GitHub-dark inspired (matches README preview + Monaco chrome). */
const ROUTER_STUDIO_DARK_RULES: monaco.editor.ITokenThemeRule[] = [
  { token: 'comment', foreground: '8b949e', fontStyle: 'italic' },
  { token: 'string', foreground: 'a5d6ff' },
  { token: 'string.yaml', foreground: 'a5d6ff' },
  { token: 'literal', foreground: '79c0ff' },
  { token: 'number', foreground: '79c0ff' },
  { token: 'regexp', foreground: '7ee787' },
  { token: 'keyword', foreground: 'ff7b72' },
  { token: 'keyword.flow', foreground: 'ff7b72' },
  { token: 'keyword.json', foreground: 'ff7b72' },
  { token: 'operator', foreground: '8b949e' },
  { token: 'tag', foreground: '7ee787' },
  { token: 'type', foreground: 'ffa657' },
  { token: 'type.identifier', foreground: 'ffa657' },
  { token: 'struct', foreground: 'ffa657' },
  { token: 'class', foreground: 'ffa657' },
  { token: 'interface', foreground: 'ffa657' },
  { token: 'enum', foreground: 'ffa657' },
  { token: 'namespace', foreground: '79c0ff' },
  { token: 'function', foreground: 'd2a8ff' },
  { token: 'function.static', foreground: 'd2a8ff' },
  { token: 'method', foreground: 'd2a8ff' },
  { token: 'parameter', foreground: '79c0ff' },
  { token: 'variable', foreground: 'e6edf3' },
  { token: 'variable.readonly', foreground: '79c0ff' },
  { token: 'variable.predefined', foreground: '79c0ff' },
  { token: 'property.readonly', foreground: '79c0ff' },
  { token: 'property', foreground: 'e6edf3' },
  { token: 'decorator', foreground: 'd2a8ff' },
  { token: 'annotation', foreground: 'd2a8ff' },
  { token: 'delimiter', foreground: '8b949e' },
  { token: 'delimiter.bracket', foreground: 'c9d1d9' },
  { token: 'identifier', foreground: 'e6edf3' },
];

const ROUTER_STUDIO_LIGHT_RULES: monaco.editor.ITokenThemeRule[] = [
  { token: 'comment', foreground: '64748b', fontStyle: 'italic' },
  { token: 'string', foreground: '0369a1' },
  { token: 'string.yaml', foreground: '0369a1' },
  { token: 'literal', foreground: 'a16207' },
  { token: 'number', foreground: 'c2410c' },
  { token: 'regexp', foreground: 'be123c' },
  { token: 'keyword', foreground: '7c3aed' },
  { token: 'keyword.flow', foreground: '6d28d9' },
  { token: 'keyword.json', foreground: '7c3aed' },
  { token: 'operator', foreground: '475569' },
  { token: 'tag', foreground: 'be185d' },
  { token: 'type', foreground: 'a16207' },
  { token: 'type.identifier', foreground: 'a16207' },
  { token: 'struct', foreground: '9a3412' },
  { token: 'class', foreground: 'b45309' },
  { token: 'interface', foreground: 'b45309' },
  { token: 'enum', foreground: 'b45309' },
  { token: 'namespace', foreground: '075985' },
  { token: 'function', foreground: '0369a1' },
  { token: 'function.static', foreground: '0284c7' },
  { token: 'method', foreground: '0369a1' },
  { token: 'parameter', foreground: '1d4ed8' },
  { token: 'variable', foreground: '0f172a' },
  { token: 'variable.readonly', foreground: '1e40af' },
  { token: 'variable.predefined', foreground: '0369a1' },
  { token: 'property.readonly', foreground: '334155' },
  { token: 'property', foreground: '334155' },
  { token: 'decorator', foreground: '6d28d9' },
  { token: 'annotation', foreground: '6d28d9' },
  { token: 'delimiter', foreground: '64748b' },
  { token: 'delimiter.bracket', foreground: '475569' },
  { token: 'identifier', foreground: '1e293b' },
];

/** Router Studio dark — midnight editor (#0d1117) + blue focus, aligned with workbench chrome. */
monaco.editor.defineTheme('router-studio-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: ROUTER_STUDIO_DARK_RULES,
  colors: {
    'editor.background': '#0d1117',
    'editor.foreground': '#e6edf3',
    'editorLineNumber.foreground': '#6e7681',
    'editorLineNumber.activeForeground': '#8b949e',
    'editorCursor.foreground': '#58a6ff',
    'editor.selectionBackground': '#388bfd44',
    'editor.inactiveSelectionBackground': '#388bfd22',
    'editor.selectionHighlightBackground': '#388bfd33',
    'editor.lineHighlightBackground': '#21262d',
    'editor.lineHighlightBorder': '#21262d22',
    'editorGutter.background': '#161b22',
    'editorGutter.modifiedBackground': '#bb800933',
    'editorGutter.addedBackground': '#2ea04344',
    'editorGutter.deletedBackground': '#f8514944',
    'editorWhitespace.foreground': '#484f5866',
    'editorIndentGuide.background': '#21262d99',
    'editorIndentGuide.activeBackground': '#484f58cc',
    'editorBracketMatch.background': '#388bfd22',
    'editorBracketMatch.border': '#58a6ff66',
    'scrollbar.shadow': '#00000000',
    'scrollbarSlider.background': '#484f5888',
    'scrollbarSlider.hoverBackground': '#484f58bb',
    'scrollbarSlider.activeBackground': '#6e7681aa',
    'minimap.background': '#161b22',
    'minimap.selectionHighlight': '#388bfd66',
    'minimapSlider.background': '#388bfd33',
    'minimapSlider.hoverBackground': '#388bfd55',
    'minimapSlider.activeBackground': '#388bfd77',
  },
});

monaco.editor.defineTheme('router-studio-light', {
  base: 'vs',
  inherit: true,
  rules: ROUTER_STUDIO_LIGHT_RULES,
  colors: {
    'editor.background': '#f8fafc',
    'editor.foreground': '#0f172a',
    'editorLineNumber.foreground': '#94a3b8',
    'editorLineNumber.activeForeground': '#64748b',
    'editorCursor.foreground': '#0284c7',
    'editor.selectionBackground': '#6366f140',
    'editor.inactiveSelectionBackground': '#6366f122',
    'editor.selectionHighlightBackground': '#6366f128',
    'editor.lineHighlightBackground': '#f1f5f9',
    'editor.lineHighlightBorder': '#e2e8f022',
    'editorGutter.background': '#f1f5f9',
    'editorGutter.modifiedBackground': '#6366f133',
    'editorGutter.addedBackground': '#22c55e44',
    'editorGutter.deletedBackground': '#ef444444',
    'editorWhitespace.foreground': '#cbd5e166',
    'editorIndentGuide.background': '#e2e8f099',
    'editorIndentGuide.activeBackground': '#cbd5e1cc',
    'editorBracketMatch.background': '#6366f122',
    'editorBracketMatch.border': '#0284c766',
    'scrollbar.shadow': '#00000000',
    'scrollbarSlider.background': '#cbd5e188',
    'scrollbarSlider.hoverBackground': '#94a3b8aa',
    'scrollbarSlider.activeBackground': '#64748bcc',
    'minimap.background': '#f1f5f9',
    'minimap.selectionHighlight': '#6366f166',
    'minimapSlider.background': '#6366f133',
    'minimapSlider.hoverBackground': '#6366f155',
    'minimapSlider.activeBackground': '#6366f177',
  },
});

function lspRangeWireToMonaco(r: LspRangeWire): monaco.IRange {
  return {
    startLineNumber: r.start.line + 1,
    startColumn: r.start.character + 1,
    endLineNumber: r.end.line + 1,
    endColumn: r.end.character + 1,
  };
}

interface InlineEditState {
  isOpen: boolean;
  selection: monaco.Selection | null;
  selectedText: string;
}

function MonacoEditorPane() {
  const uiTheme = useResolvedTheme();
  const tab = useApp(
    useShallow((s) => {
      const p = s.activeTabPath;
      if (!p) return null;
      return s.tabs.find((t) => t.relativePath === p) ?? null;
    }),
  );
  const updateTabContent = useApp((s) => s.updateTabContent);
  const setSelectedCode = useApp((s) => s.setSelectedCode);
  const setEditorInstance = useApp((s) => s.setEditorInstance);
  const pushLog = useApp((s) => s.pushLog);
  const markTabSaved = useApp((s) => s.markTabSaved);
  const formatOnSave = useSettings((s) => s.settings.formatOnSave);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  const editorRevealRequest = useApp((s) => s.editorRevealRequest);
  const clearEditorRevealRequest = useApp((s) => s.clearEditorRevealRequest);

  const editorSettings = useSettings((s) => s.settings.editor);
  const projectRoot = useApp((s) => s.projectRoot);
  const tsLsEnabled = editorSettings?.typescriptLanguageServer ?? false;

  const lspTrackedPathRef = useRef<string | null>(null);
  const lspDebounceTimerRef = useRef<number | null>(null);
  const tabForLspRef = useRef(tab);
  tabForLspRef.current = tab;

  const formatOnSaveRef = useRef(formatOnSave);
  formatOnSaveRef.current = formatOnSave;
  const pushLogRef = useRef(pushLog);
  pushLogRef.current = pushLog;
  const markTabSavedRef = useRef(markTabSaved);
  markTabSavedRef.current = markTabSaved;

  useEffect(() => {
    if (!editorRevealRequest || !tab || tab.relativePath !== editorRevealRequest.relativePath) {
      return;
    }
    const ed = editorRef.current;
    if (!ed) return;
    const req = editorRevealRequest;
    let cancelled = false;
    let handle = 0;
    let attempts = 0;

    const tryOnce = () => {
      const model = ed.getModel();
      if (!model || model.isDisposed()) return false;
      const line = Math.max(1, Math.min(req.lineNumber, model.getLineCount()));
      const col = Math.max(1, req.column ?? 1);
      ed.revealLineInCenter(line);
      ed.setPosition({ lineNumber: line, column: col });
      ed.focus();
      return true;
    };

    if (tryOnce()) {
      clearEditorRevealRequest();
      return;
    }

    const loop = () => {
      handle = window.setTimeout(() => {
        if (cancelled) return;
        if (tryOnce()) {
          clearEditorRevealRequest();
          return;
        }
        attempts += 1;
        if (attempts >= 18) {
          clearEditorRevealRequest();
          return;
        }
        loop();
      }, 45);
    };
    loop();

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [editorRevealRequest, tab, clearEditorRevealRequest]);

  const LSP_MONACO_LANG = useMemo(
    () => new Set(['typescript', 'javascript', 'typescriptreact', 'javascriptreact']),
    [],
  );

  useEffect(() => {
    void window.api.lsp.configure(projectRoot ?? null);
  }, [projectRoot, tsLsEnabled]);

  useEffect(() => {
    if (lspDebounceTimerRef.current) {
      clearTimeout(lspDebounceTimerRef.current);
      lspDebounceTimerRef.current = null;
    }

    const closeTracked = () => {
      const prevPath = lspTrackedPathRef.current;
      if (prevPath) {
        void window.api.lsp.syncDoc({
          kind: 'close',
          relPath: prevPath,
          languageId: 'typescript',
        });
        lspTrackedPathRef.current = null;
      }
    };

    if (!projectRoot || !tsLsEnabled || !tab || !LSP_MONACO_LANG.has(tab.language)) {
      closeTracked();
      return;
    }

    const rel = tab.relativePath;
    const langId = tab.language;
    let cancelled = false;

    void (async () => {
      const prev = lspTrackedPathRef.current;
      try {
        if (prev && prev !== rel && !cancelled) {
          await window.api.lsp.syncDoc({
            kind: 'close',
            relPath: prev,
            languageId: 'typescript',
          });
          if (cancelled) return;
          if (lspTrackedPathRef.current === prev) lspTrackedPathRef.current = null;
        }
        if (cancelled) return;

        if (lspTrackedPathRef.current !== rel) {
          await window.api.lsp.syncDoc({
            kind: 'open',
            relPath: rel,
            languageId: langId,
            text: tab.content,
          });
          if (cancelled) return;
          lspTrackedPathRef.current = rel;
        }

        const ct = tabForLspRef.current;
        if (cancelled || !ct || ct.relativePath !== rel || lspTrackedPathRef.current !== rel) return;

        lspDebounceTimerRef.current = window.setTimeout(() => {
          const latest = tabForLspRef.current;
          void window.api.lsp.syncDoc({
            kind: 'change',
            relPath: rel,
            languageId: latest?.relativePath === rel ? latest.language : langId,
            text: latest?.relativePath === rel ? latest.content : undefined,
          });
          lspDebounceTimerRef.current = null;
        }, 280);
      } catch (e) {
        console.warn('[lsp]', e);
      }
    })();

    return () => {
      cancelled = true;
      if (lspDebounceTimerRef.current) {
        clearTimeout(lspDebounceTimerRef.current);
        lspDebounceTimerRef.current = null;
      }
    };
  }, [projectRoot, tsLsEnabled, tab?.relativePath, tab?.language, tab?.content, LSP_MONACO_LANG]);

  const hoverTabRef = useRef(tab);
  hoverTabRef.current = tab;
  const hoverTsLsRef = useRef(tsLsEnabled);
  hoverTsLsRef.current = tsLsEnabled;

  useEffect(() => {
    const hoverSel: monaco.languages.LanguageSelector = [
      'typescript',
      'javascript',
      'javascriptreact',
      'typescriptreact',
      'python',
      'rust',
      'go',
      'json',
      'html',
      'css',
      'markdown',
    ];

    const lspTsJsSel: monaco.languages.LanguageSelector = [
      'typescript',
      'javascript',
      'javascriptreact',
      'typescriptreact',
    ];

    const d = monaco.languages.registerHoverProvider(hoverSel, {
      async provideHover(model, pos, token) {
        void token;
        const langId = model.getLanguageId();
        const ht = hoverTabRef.current;
        if (!ht) {
          return { contents: [{ value: '_No editor tab_' }] };
        }
        const lspEligible =
          hoverTsLsRef.current &&
          ht &&
          LSP_MONACO_LANG.has(langId);

        let lspContents = null as ReturnType<typeof lspHoverToMonacoMarkdown>;
        if (lspEligible) {
          try {
            const raw = await window.api.lsp.hover({
              relPath: ht.relativePath,
              line: pos.lineNumber,
              character: pos.column,
            });
            lspContents = lspHoverToMonacoMarkdown(raw);
          } catch {
            lspContents = null;
          }
        }

        if (lspContents && lspContents.length > 0) {
          return { contents: lspContents };
        }

        const w = model.getWordAtPosition(pos);
        if (!w) {
          return { contents: [{ value: `_Line ${pos.lineNumber}_` }] };
        }
        const hint =
          lspEligible && (!lspContents || lspContents.length === 0)
            ? 'LSP did not provide hover here — word under cursor only.'
            : 'Router Studio word hover · enable TS/JS LSP under Settings → Editor.';
        return {
          contents: [
            {
              value: `**${w.word}** · \`${model.getLanguageId()}\`\n\n${hint}`,
            },
          ],
        };
      },
    });

    const dDef = monaco.languages.registerDefinitionProvider(lspTsJsSel, {
      async provideDefinition(model, position, token) {
        void token;
        if (!hoverTsLsRef.current) return null;
        const t = hoverTabRef.current;
        const ed = editorRef.current;
        if (!t || !ed || ed.getModel() !== model || !LSP_MONACO_LANG.has(model.getLanguageId())) return null;
        try {
          const locs = await window.api.lsp.definition({
            relPath: t.relativePath,
            line: position.lineNumber,
            character: position.column,
          });
          if (!locs?.length) return null;
          return locs.map((loc) => ({
            uri: monaco.Uri.parse(loc.uri),
            range: lspRangeWireToMonaco(loc.range),
          }));
        } catch {
          return null;
        }
      },
    });

    const dRef = monaco.languages.registerReferenceProvider(lspTsJsSel, {
      async provideReferences(model, position, context, token) {
        void token;
        if (!hoverTsLsRef.current) return [];
        const t = hoverTabRef.current;
        const ed = editorRef.current;
        if (!t || !ed || ed.getModel() !== model || !LSP_MONACO_LANG.has(model.getLanguageId())) return [];
        try {
          const locs = await window.api.lsp.references({
            relPath: t.relativePath,
            line: position.lineNumber,
            character: position.column,
            includeDeclaration: context.includeDeclaration,
          });
          if (!locs?.length) return [];
          return locs.map((loc) => ({
            uri: monaco.Uri.parse(loc.uri),
            range: lspRangeWireToMonaco(loc.range),
          }));
        } catch {
          return [];
        }
      },
    });

    return () => {
      d.dispose();
      dDef.dispose();
      dRef.dispose();
    };
  }, [LSP_MONACO_LANG]);

  // Inline edit state
  const [inlineEdit, setInlineEdit] = useState<InlineEditState>({
    isOpen: false,
    selection: null,
    selectedText: '',
  });

  // Code actions menu state
  const [codeActionsMenu, setCodeActionsMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    selectedText: string;
    lineContent: string;
    lineNumber: number;
    selection: monaco.Selection | null;
  } | null>(null);

  const [editorContextMenu, setEditorContextMenu] = useState<{
    x: number;
    y: number;
    items: ContextMenuItem[];
  } | null>(null);

  // Open inline edit widget
  const openInlineEdit = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const selection = editor.getSelection();
    const model = editor.getModel();

    if (!selection || !model) return;

    const selectedText = model.getValueInRange(selection);
    if (!selectedText.trim()) {
      pushLog('info', 'Select some code first to use inline edit (Ctrl+K)');
      return;
    }

    setInlineEdit({
      isOpen: true,
      selection,
      selectedText,
    });
  }, [pushLog]);

  // Close inline edit widget
  const closeInlineEdit = useCallback(() => {
    setInlineEdit({
      isOpen: false,
      selection: null,
      selectedText: '',
    });
    editorRef.current?.focus();
  }, []);

  // Apply the generated edit
  const applyInlineEdit = useCallback((newText: string) => {
    const editor = editorRef.current;
    if (!editor || !inlineEdit.selection) return;

    const model = editor.getModel();
    if (!model) return;

    // Apply the edit
    editor.executeEdits('inline-edit', [
      {
        range: inlineEdit.selection,
        text: newText,
        forceMoveMarkers: true,
      },
    ]);

    // Update the tab content
    if (tab) {
      updateTabContent(tab.relativePath, model.getValue());
    }

    pushLog('info', 'Applied inline edit');
    closeInlineEdit();
  }, [inlineEdit.selection, tab, updateTabContent, pushLog, closeInlineEdit]);

  // Open code actions menu (Ctrl+.)
  const openCodeActionsMenu = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const selection = editor.getSelection();
    const position = editor.getPosition();
    const model = editor.getModel();

    if (!position || !model) return;

    const lineContent = model.getLineContent(position.lineNumber);
    const selectedText = selection && !selection.isEmpty()
      ? model.getValueInRange(selection)
      : lineContent;

    // Get cursor position in viewport
    const coords = editor.getScrolledVisiblePosition(position);
    const editorDom = editor.getDomNode();

    if (coords && editorDom) {
      const rect = editorDom.getBoundingClientRect();
      setCodeActionsMenu({
        isOpen: true,
        position: {
          x: Math.min(coords.left + rect.left, window.innerWidth - 340),
          y: coords.top + rect.top + coords.height + 4,
        },
        selectedText,
        lineContent,
        lineNumber: position.lineNumber,
        selection,
      });
    }
  }, []);

  // Close code actions menu
  const closeCodeActionsMenu = useCallback(() => {
    setCodeActionsMenu(null);
    editorRef.current?.focus();
  }, []);

  const openInlineEditRef = useRef(openInlineEdit);
  openInlineEditRef.current = openInlineEdit;
  const openCodeActionsMenuRef = useRef(openCodeActionsMenu);
  openCodeActionsMenuRef.current = openCodeActionsMenu;

  /** Right-click menu: built here so we can fire from DOM capture (Monaco default menu is disabled). */
  const openEditorContextMenu = useCallback(
    (clientX: number, clientY: number) => {
      const editor = editorRef.current;
      if (!editor) return;

      const model = editor.getModel();
      const sel = editor.getSelection();
      const hasSel = !!(model && sel && !sel.isEmpty());
      const pathLabel = useApp.getState().activeTabPath ?? '';

      const runAction = (id: string) => {
        void editor.getAction(id)?.run();
      };

      const items: ContextMenuItem[] = [
        {
          label: 'Undo',
          shortcut: 'Ctrl/Cmd+Z',
          action: () => runAction('editor.action.undo'),
        },
        {
          label: 'Redo',
          shortcut: 'Ctrl/Cmd+Shift+Z',
          action: () => runAction('editor.action.redo'),
        },
        { divider: true, label: '' },
        {
          label: 'Cut',
          shortcut: 'Ctrl/Cmd+X',
          disabled: !hasSel,
          action: () => runAction('editor.action.clipboardCutAction'),
        },
        {
          label: 'Copy',
          shortcut: 'Ctrl/Cmd+C',
          disabled: !hasSel,
          action: () => runAction('editor.action.clipboardCopyAction'),
        },
        {
          label: 'Paste',
          shortcut: 'Ctrl/Cmd+V',
          action: () => runAction('editor.action.clipboardPasteAction'),
        },
        {
          label: 'Select All',
          shortcut: 'Ctrl/Cmd+A',
          action: () => runAction('editor.action.selectAll'),
        },
        { divider: true, label: '' },
        {
          label: 'Format Document',
          shortcut: 'Shift+Alt+F',
          action: () => void runAction('editor.action.formatDocument'),
        },
        {
          label: 'Go to Line…',
          shortcut: 'Ctrl/Cmd+G',
          action: () => void runAction('editor.action.gotoLine'),
        },
        {
          label: 'Command Palette…',
          shortcut: 'Ctrl/Cmd+Shift+P',
          action: () => useApp.getState().setShowCommandPalette(true),
        },
        {
          label: 'Quick Open…',
          shortcut: 'Ctrl/Cmd+P',
          action: () => useApp.getState().setShowQuickOpen(true),
        },
        { divider: true, label: '' },
        {
          label: 'Inline edit with AI (Ctrl+K)',
          icon: '✨',
          disabled: !hasSel,
          action: () => openInlineEdit(),
        },
        {
          label: 'Quick fixes & AI actions (Ctrl+.)',
          icon: '⚡',
          action: () => openCodeActionsMenu(),
        },
        {
          label: 'Ask AI about selection',
          icon: '💬',
          disabled: !hasSel,
          action: () => {
            if (!model || !sel || sel.isEmpty()) return;
            const text = model.getValueInRange(sel).trim();
            if (!text) return;
            const rel = useApp.getState().activeTabPath ?? pathLabel;
            useApp.getState().addChatMessage({
              id: crypto.randomUUID(),
              role: 'user',
              content: `In \`${rel}\` I have this selected:\n\n\`\`\`\n${text.slice(0, 12000)}${text.length > 12000 ? '\n…' : ''}\n\`\`\`\n\n`,
              createdAt: Date.now(),
            });
            useApp.getState().setAiPanelFocused(true);
          },
        },
      ];

      setEditorContextMenu({ x: clientX, y: clientY, items });
    },
    [openInlineEdit, openCodeActionsMenu],
  );

  // Apply code action edit
  const applyCodeActionEdit = useCallback((newText: string) => {
    const editor = editorRef.current;
    if (!editor || !codeActionsMenu) return;

    const model = editor.getModel();
    if (!model) return;

    let range: monaco.IRange;

    if (codeActionsMenu.selection && !codeActionsMenu.selection.isEmpty()) {
      // Apply to selection
      range = codeActionsMenu.selection;
    } else {
      // Apply to entire line
      range = {
        startLineNumber: codeActionsMenu.lineNumber,
        startColumn: 1,
        endLineNumber: codeActionsMenu.lineNumber,
        endColumn: model.getLineMaxColumn(codeActionsMenu.lineNumber),
      };
    }

    editor.executeEdits('code-action', [
      {
        range,
        text: newText,
        forceMoveMarkers: true,
      },
    ]);

    // Update the tab content
    if (tab) {
      updateTabContent(tab.relativePath, model.getValue());
    }

    pushLog('info', 'Applied code action');
    closeCodeActionsMenu();
  }, [codeActionsMenu, tab, updateTabContent, pushLog, closeCodeActionsMenu]);

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (!tab) return;
      updateTabContent(tab.relativePath, value ?? '');
    },
    [tab, updateTabContent],
  );

  const handleMount = useCallback<OnMount>(
    (editor, monacoInstance) => {
      editorRef.current = editor;
      setEditorInstance(editor);

      registerGhostInlineCompletions(monacoInstance);
      registerUserSnippetCompletions(monacoInstance);

      editor.onDidChangeCursorSelection(() => {
        const model = editor.getModel();
        const sel = editor.getSelection();
        if (model && sel) {
          const text = model.getValueInRange(sel);
          setSelectedCode(text);
        }
      });

      editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, async () => {
        const state = useApp.getState();
        const active = state.tabs.find((t) => t.relativePath === state.activeTabPath);
        if (!active) return;
        try {
          if (formatOnSaveRef.current) {
            const action = editor.getAction('editor.action.formatDocument');
            if (action) {
              try {
                await action.run();
              } catch {
                /* no formatter */
              }
            }
          }
          const model = editor.getModel();
          const content = model ? model.getValue() : active.content;
          await window.api.fs.writeFile(active.relativePath, content);
          markTabSavedRef.current(active.relativePath);
          pushLogRef.current('info', `Saved ${active.relativePath}`);
        } catch (e) {
          pushLogRef.current('error', `Save failed: ${(e as Error).message}`);
        }
      });

      editor.addCommand(
        monacoInstance.KeyMod.Shift | monacoInstance.KeyMod.Alt | monacoInstance.KeyCode.KeyF,
        () => {
          const action = editor.getAction('editor.action.formatDocument');
          if (action) void action.run();
        },
      );

      editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyK, () => {
        openInlineEditRef.current();
      });

      editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Period, () => {
        openCodeActionsMenuRef.current();
      });
    },
    [setEditorInstance, setSelectedCode],
  );

  useEffect(() => {
    return () => {
      editorRef.current = null;
      setEditorInstance(null);
    };
  }, [setEditorInstance]);

  const editorOptions = useMemo(
    (): monaco.editor.IStandaloneEditorConstructionOptions => ({
          // Font settings (from user preferences)
          fontSize: editorSettings?.fontSize ?? 13,
          fontFamily:
            editorSettings?.fontFamily ??
            "'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace",
          fontLigatures: editorSettings?.fontLigatures ?? true,
          fontWeight: '400',

          // Layout
          automaticLayout: true,
          tabSize: editorSettings?.tabSize ?? 2,
          insertSpaces: true,
          detectIndentation: true,

          // Scrolling
          smoothScrolling: true,
          scrollBeyondLastLine: false,
          scrollbar: {
            vertical: 'auto',
            horizontal: 'auto',
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
            useShadows: false,
          },

          // Minimap (from user preferences)
          minimap: {
            enabled: editorSettings?.minimap ?? true,
            maxColumn: 80,
            renderCharacters: false,
            showSlider: 'mouseover',
            scale: 1,
          },

          // Line numbers and rendering (from user preferences)
          lineNumbers: editorSettings?.lineNumbers ?? 'on',
          lineNumbersMinChars: 4,
          renderLineHighlight: 'all',
          cursorBlinking: editorSettings?.cursorBlinking ?? 'smooth',
          cursorSmoothCaretAnimation: 'on',
          cursorStyle: editorSettings?.cursorStyle ?? 'line',
          cursorWidth: 2,

          // Bracket pair colorization (from user preferences)
          bracketPairColorization: {
            enabled: editorSettings?.bracketPairColorization ?? true,
            independentColorPoolPerBracketType: true,
          },
          guides: {
            bracketPairs: editorSettings?.bracketPairColorization ?? true,
            bracketPairsHorizontal: true,
            highlightActiveBracketPair: true,
            indentation: true,
            highlightActiveIndentation: true,
          },

          // Sticky scroll (from user preferences)
          stickyScroll: {
            enabled: editorSettings?.stickyScroll ?? true,
            maxLineCount: 5,
          },

          // Word wrap (from user preferences)
          wordWrap: editorSettings?.wordWrap ?? 'off',
          wordWrapColumn: 120,

          // Code folding
          folding: true,
          foldingStrategy: 'indentation',
          foldingHighlight: true,
          showFoldingControls: 'mouseover',

          // Whitespace and special chars (from user preferences)
          renderWhitespace: editorSettings?.renderWhitespace ?? 'selection',
          renderControlCharacters: false,

          // Suggestions and intellisense
          quickSuggestions: true,
          suggestOnTriggerCharacters: true,
          acceptSuggestionOnCommitCharacter: true,
          snippetSuggestions: 'inline',
          tabCompletion: 'on',

          inlineSuggest: {
            enabled: editorSettings?.ghostTextEnabled ?? false,
          },

          // Hover
          hover: {
            enabled: true,
            delay: 300,
            sticky: true,
          },

          // Selection
          selectionHighlight: true,
          occurrencesHighlight: 'singleFile',
          multiCursorModifier: 'ctrlCmd',

          // Links
          links: true,
          colorDecorators: true,

          // TS/JS: distinguish locals, parameters, readonly, etc.
          'semanticHighlighting.enabled': true,

          // Inlay hints (for TypeScript parameter names, etc.)
          inlayHints: {
            enabled: 'on',
            fontSize: 11,
            padding: true,
          },

          // Padding
          padding: {
            top: 8,
            bottom: 8,
          },

          // Fixed widgets
          fixedOverflowWidgets: true,
          contextmenu: false,

          largeFileOptimizations: true,
          maxTokenizationLineLength: 20_000,
    }),
    [editorSettings],
  );

  if (!tab) return null;

  return (
    <div
      className="relative h-full w-full"
      onContextMenuCapture={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openEditorContextMenu(e.clientX, e.clientY);
      }}
    >
      <Editor
        path={tab.relativePath}
        height="100%"
        theme={uiTheme === 'light' ? 'router-studio-light' : 'router-studio-dark'}
        language={tab.language}
        value={tab.content}
        onChange={handleChange}
        onMount={handleMount}
        options={editorOptions}
      />

      {/* Inline Edit Widget (Ctrl+K) */}
      {inlineEdit.isOpen && editorRef.current && inlineEdit.selection && (
        <InlineEditWidget
          editor={editorRef.current}
          selection={inlineEdit.selection}
          selectedText={inlineEdit.selectedText}
          onClose={closeInlineEdit}
          onApply={applyInlineEdit}
        />
      )}

      {/* Code Actions Menu (Ctrl+.) */}
      {codeActionsMenu?.isOpen && editorRef.current && (
        <CodeActionsMenu
          editor={editorRef.current}
          position={codeActionsMenu.position}
          selectedText={codeActionsMenu.selectedText}
          lineContent={codeActionsMenu.lineContent}
          lineNumber={codeActionsMenu.lineNumber}
          onClose={closeCodeActionsMenu}
          onApplyEdit={applyCodeActionEdit}
        />
      )}

      {editorContextMenu && (
        <ContextMenu
          x={editorContextMenu.x}
          y={editorContextMenu.y}
          items={editorContextMenu.items}
          onClose={() => setEditorContextMenu(null)}
        />
      )}
    </div>
  );
}

export default memo(MonacoEditorPane);
