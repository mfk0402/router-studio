import { useState, useEffect, useCallback, useRef } from 'react';
import * as monaco from 'monaco-editor';
import { useApp } from '../store/appStore';
import { useSettings } from '../store/settingsStore';
import { sendChatCompletion } from '../lib/openrouterClient';
import type { NormalizedModel } from '../../shared/types';

interface CodeActionsMenuProps {
  editor: monaco.editor.IStandaloneCodeEditor;
  position: { x: number; y: number };
  selectedText: string;
  lineContent: string;
  lineNumber: number;
  onClose: () => void;
  onApplyEdit: (newText: string) => void;
}

interface CodeAction {
  id: string;
  label: string;
  icon: string;
  description: string;
  prompt: string;
}

const CODE_ACTIONS: CodeAction[] = [
  {
    id: 'fix-error',
    label: 'Fix Error',
    icon: '🔧',
    description: 'Attempt to fix any errors in this code',
    prompt: 'Fix any errors in this code. If there are no obvious errors, suggest improvements.',
  },
  {
    id: 'explain',
    label: 'Explain Code',
    icon: '💡',
    description: 'Explain what this code does',
    prompt: 'Explain what this code does in simple terms.',
  },
  {
    id: 'refactor',
    label: 'Refactor',
    icon: '🔄',
    description: 'Refactor for better readability',
    prompt: 'Refactor this code for better readability and maintainability. Keep the same functionality.',
  },
  {
    id: 'optimize',
    label: 'Optimize',
    icon: '⚡',
    description: 'Optimize for performance',
    prompt: 'Optimize this code for better performance. Explain any changes.',
  },
  {
    id: 'add-types',
    label: 'Add Types',
    icon: '📝',
    description: 'Add TypeScript types',
    prompt: 'Add proper TypeScript types to this code. Use explicit types where appropriate.',
  },
  {
    id: 'add-comments',
    label: 'Add Comments',
    icon: '📖',
    description: 'Add documentation comments',
    prompt: 'Add clear, concise documentation comments to this code. Use JSDoc/TSDoc format where appropriate.',
  },
  {
    id: 'add-error-handling',
    label: 'Add Error Handling',
    icon: '🛡️',
    description: 'Add try/catch and error handling',
    prompt: 'Add proper error handling to this code. Include try/catch blocks and appropriate error messages.',
  },
  {
    id: 'convert-async',
    label: 'Convert to Async',
    icon: '🔀',
    description: 'Convert to async/await',
    prompt: 'Convert this code to use async/await pattern instead of callbacks or promises.',
  },
  {
    id: 'extract-function',
    label: 'Extract Function',
    icon: '📦',
    description: 'Extract into a reusable function',
    prompt: 'Extract this code into a well-named, reusable function with proper parameters.',
  },
  {
    id: 'add-tests',
    label: 'Generate Tests',
    icon: '🧪',
    description: 'Generate unit tests',
    prompt: 'Generate comprehensive unit tests for this code. Include edge cases.',
  },
];

export default function CodeActionsMenu({
  editor,
  position,
  selectedText,
  lineContent,
  lineNumber,
  onClose,
  onApplyEdit,
}: CodeActionsMenuProps) {
  const [filter, setFilter] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<CodeAction | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const settings = useSettings((s) => s.settings);
  const pushLog = useApp((s) => s.pushLog);
  const activeTabPath = useApp((s) => s.activeTabPath);
  const tabs = useApp((s) => s.tabs);

  const activeTab = tabs.find((t) => t.relativePath === activeTabPath);

  // Filter actions based on input
  const filteredActions = filter.trim()
    ? CODE_ACTIONS.filter(
        (a) =>
          a.label.toLowerCase().includes(filter.toLowerCase()) ||
          a.description.toLowerCase().includes(filter.toLowerCase())
      )
    : CODE_ACTIONS;

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (generatedResult) {
          setGeneratedResult(null);
          setActiveAction(null);
        } else {
          onClose();
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(filteredActions.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (generatedResult && activeAction) {
          if (activeAction.id === 'explain' || activeAction.id === 'add-tests') {
            // These don't apply edits - just show the result
          } else {
            onApplyEdit(generatedResult);
          }
        } else if (filteredActions[selectedIndex]) {
          runAction(filteredActions[selectedIndex]);
        }
      }
    },
    [filteredActions, selectedIndex, generatedResult, activeAction, onClose, onApplyEdit]
  );

  // Run a code action
  const runAction = async (action: CodeAction) => {
    if (!settings.apiKey) {
      pushLog('error', 'API key not set. Please configure in Settings.');
      return;
    }

    setActiveAction(action);
    setIsGenerating(true);
    setGeneratedResult(null);

    try {
      const model = settings.defaultModel || 'anthropic/claude-3.5-sonnet';
      const language = activeTab?.language || 'plaintext';
      const codeContext = selectedText || lineContent;

      const systemPrompt = `You are an expert code assistant. When asked to modify code, output ONLY the modified code without explanations or markdown fencing.
When asked to explain code or generate tests, provide a clear, concise response.
Current language: ${language}`;

      const userPrompt = `${action.prompt}

Code:
${codeContext}`;

      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      let result = '';

      await sendChatCompletion({
        apiKey: settings.apiKey,
        model,
        messages,
        temperature: 0.3,
        maxTokens: 2048,
        stream: true,
        freeMode: {
          enabled: false,
          strategy: 'router',
          freeModels: [] as NormalizedModel[],
        },
        onStreamChunk: (chunk) => {
          if (chunk.type === 'delta' && chunk.content) {
            result += chunk.content;
            setGeneratedResult(result);
          }
        },
      });

      // Clean up markdown fencing if present
      let cleaned = result.trim();
      if (cleaned.startsWith('```')) {
        const lines = cleaned.split('\n');
        lines.shift();
        if (lines[lines.length - 1] === '```') {
          lines.pop();
        }
        cleaned = lines.join('\n');
      }

      setGeneratedResult(cleaned);
    } catch (e) {
      pushLog('error', `Code action failed: ${(e as Error).message}`);
      setGeneratedResult(null);
      setActiveAction(null);
    } finally {
      setIsGenerating(false);
    }
  };

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 w-80 rounded-lg border border-border bg-bg-elevated shadow-2xl"
      style={{ left: position.x, top: position.y }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border-soft px-3 py-2">
        <span className="text-xs font-medium text-fg">Code Actions</span>
        <kbd className="ml-auto rounded bg-bg px-1.5 py-0.5 text-[10px] text-fg-muted">Ctrl+.</kbd>
      </div>

      {/* Show result if generated */}
      {activeAction && (generatedResult !== null || isGenerating) ? (
        <div className="max-h-80 overflow-auto">
          <div className="flex items-center gap-2 border-b border-border-soft bg-accent/5 px-3 py-2">
            <span className="text-xs">{activeAction.icon}</span>
            <span className="text-xs font-medium text-fg">{activeAction.label}</span>
            {isGenerating && <span className="ml-auto text-[10px] text-accent">generating...</span>}
          </div>
          <div className="p-3">
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded border border-border-soft bg-bg p-2 font-mono text-xs text-fg">
              {generatedResult || '...'}
            </pre>
          </div>
          <div className="flex items-center justify-between border-t border-border-soft px-3 py-2">
            <button
              onClick={() => {
                setGeneratedResult(null);
                setActiveAction(null);
              }}
              className="rounded px-2 py-1 text-xs text-fg-muted hover:bg-bg-hover hover:text-fg"
            >
              ← Back
            </button>
            <div className="flex gap-2">
              {activeAction.id !== 'explain' && activeAction.id !== 'add-tests' && (
                <button
                  onClick={() => generatedResult && onApplyEdit(generatedResult)}
                  disabled={isGenerating || !generatedResult}
                  className="rounded bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
                >
                  Apply
                </button>
              )}
              <button
                onClick={() => {
                  if (generatedResult) {
                    navigator.clipboard.writeText(generatedResult);
                    pushLog('info', 'Copied to clipboard');
                  }
                }}
                disabled={!generatedResult}
                className="rounded border border-border px-2 py-1 text-xs text-fg-muted hover:bg-bg-hover disabled:opacity-50"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Filter input */}
          <div className="border-b border-border-soft px-2 py-1.5">
            <input
              ref={inputRef}
              type="text"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setSelectedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search actions..."
              className="w-full rounded border border-border bg-bg px-2 py-1 text-xs text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
            />
          </div>

          {/* Actions list */}
          <div className="max-h-64 overflow-auto py-1">
            {filteredActions.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-fg-muted">
                No matching actions
              </div>
            ) : (
              filteredActions.map((action, idx) => (
                <button
                  key={action.id}
                  onClick={() => runAction(action)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${
                    idx === selectedIndex ? 'bg-accent/10' : 'hover:bg-bg-hover'
                  }`}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <span className="text-sm">{action.icon}</span>
                  <div className="flex-1 overflow-hidden">
                    <div className="text-xs font-medium text-fg">{action.label}</div>
                    <div className="truncate text-[10px] text-fg-muted">{action.description}</div>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border-soft px-3 py-1.5 text-[10px] text-fg-subtle">
            <span className="mr-2">↑↓ Navigate</span>
            <span className="mr-2">Enter Select</span>
            <span>Esc Close</span>
          </div>
        </>
      )}
    </div>
  );
}
