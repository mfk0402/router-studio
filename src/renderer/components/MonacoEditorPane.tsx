import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

let editorHoverDisposable: monaco.IDisposable | null = null;
import CodeActionsMenu from './CodeActionsMenu';
import ContextMenu from './ContextMenu';
import type { ContextMenuItem } from './ContextMenu';

// Ensure Monaco uses bundled workers (fully local, no CDN required).
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};

// Use the npm-bundled monaco instance so nothing is fetched from a CDN.
loader.config({ monaco });

/** Router Studio design kit — Monaco chrome aligned to app surfaces (#0B1220 / #111827, cyan cursor). */
monaco.editor.defineTheme('router-studio-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [{ token: 'comment', foreground: '64748b', fontStyle: 'italic' }],
  colors: {
    'editor.background': '#0B1220',
    'editor.foreground': '#E6E8EB',
    'editorLineNumber.foreground': '#64748B',
    'editorLineNumber.activeForeground': '#94A3B8',
    'editorCursor.foreground': '#22D3EE',
    'editor.selectionBackground': '#6366FF40',
    'editor.inactiveSelectionBackground': '#6366FF22',
    'editor.selectionHighlightBackground': '#6366FF28',
    'editor.lineHighlightBackground': '#161C2A',
    'editor.lineHighlightBorder': '#26304122',
    'editorGutter.background': '#111827',
    'editorGutter.modifiedBackground': '#6366FF33',
    'editorGutter.addedBackground': '#22C55E44',
    'editorGutter.deletedBackground': '#EF444444',
    'editorWhitespace.foreground': '#33415566',
    'editorIndentGuide.background': '#26304133',
    'editorIndentGuide.activeBackground': '#26304166',
    'editorBracketMatch.background': '#6366FF22',
    'editorBracketMatch.border': '#22D3EE66',
    'scrollbar.shadow': '#00000000',
    'scrollbarSlider.background': '#26304188',
    'scrollbarSlider.hoverBackground': '#263041BB',
    'scrollbarSlider.activeBackground': '#263041DD',
    'minimap.background': '#111827',
    'minimap.selectionHighlight': '#6366FF66',
    'minimapSlider.background': '#6366FF33',
    'minimapSlider.hoverBackground': '#6366FF55',
    'minimapSlider.activeBackground': '#6366FF77',
  },
});

interface InlineEditState {
  isOpen: boolean;
  selection: monaco.Selection | null;
  selectedText: string;
}

export default function MonacoEditorPane() {
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

      if (!editorHoverDisposable) {
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
        editorHoverDisposable = monacoInstance.languages.registerHoverProvider(hoverSel, {
          provideHover(model, pos) {
            const w = model.getWordAtPosition(pos);
            if (!w) {
              return { contents: [{ value: `_Line ${pos.lineNumber}_` }] };
            }
            return {
              contents: [
                {
                  value:
                    `**${w.word}** · \`${model.getLanguageId()}\`\n\n` +
                    'Router Studio rich hover: word under cursor and language id. ' +
                    'Extend with LSP or project docs in later releases.',
                },
              ],
            };
          },
        });
      }

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
        theme={uiTheme === 'light' ? 'vs-light' : 'router-studio-dark'}
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
