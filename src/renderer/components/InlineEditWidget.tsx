import { useState, useRef, useEffect, useCallback } from 'react';
import * as monaco from 'monaco-editor';
import { useSettings } from '../store/settingsStore';
import { useApp } from '../store/appStore';
import { sendChatCompletion } from '../lib/openrouterClient';
import { getCompletionRouting } from '../lib/completionRouting';
import type { NormalizedModel } from '../../shared/types';

interface InlineEditWidgetProps {
  editor: monaco.editor.IStandaloneCodeEditor;
  selection: monaco.Selection;
  selectedText: string;
  onClose: () => void;
  onApply: (newText: string) => void;
}

export default function InlineEditWidget({
  editor,
  selection,
  selectedText,
  onClose,
  onApply,
}: InlineEditWidgetProps) {
  const [instruction, setInstruction] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedText, setGeneratedText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const settings = useSettings((s) => s.settings);
  const activeTabPath = useApp((s) => s.activeTabPath);
  const tabs = useApp((s) => s.tabs);

  const activeTab = tabs.find((t) => t.relativePath === activeTabPath);

  // Position the widget near the selection
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!editor) return;

    const updatePosition = () => {
      const startPos = selection.getStartPosition();
      const coords = editor.getScrolledVisiblePosition(startPos);
      if (coords) {
        const editorDom = editor.getDomNode();
        if (editorDom) {
          const rect = editorDom.getBoundingClientRect();
          setPosition({
            top: coords.top + rect.top + coords.height + 4,
            left: Math.max(rect.left + 16, Math.min(coords.left + rect.left, rect.right - 420)),
          });
        }
      }
    };

    updatePosition();

    const disposable = editor.onDidScrollChange(updatePosition);
    return () => disposable.dispose();
  }, [editor, selection]);

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  // Handle escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const generateEdit = useCallback(async () => {
    if (!instruction.trim() || !settings.apiKey) {
      setError('Please enter an instruction and ensure API key is set');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGeneratedText(null);

    try {
      const model = settings.defaultModel || 'anthropic/claude-3.5-sonnet';

      const language = activeTab?.language || 'plaintext';
      const fileName = activeTab?.relativePath || 'unknown';

      const systemPrompt = `You are an expert code editor. You will be given a code selection and an instruction to modify it.
Output ONLY the modified code without any explanation, markdown fencing, or comments.
Do NOT include \`\`\` or any other markdown.
Just output the raw code that should replace the selection.`;

      const userPrompt = `File: ${fileName} (${language})

Selected code to modify:
${selectedText}

Instruction: ${instruction}

Output the modified code only:`;

      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      let result = '';

      // Use the sendChatCompletion helper which handles streaming
      const routing = getCompletionRouting(settings);
      const response = await sendChatCompletion({
        apiKey: routing.apiKey,
        openAiBaseUrl: routing.openAiBaseUrl,
        model,
        messages,
        temperature: 0.2,
        maxTokens: 4096,
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
            result += chunk.content;
            setGeneratedText(result);
          }
        },
      });

      // Clean up any accidental markdown fencing
      let cleaned = response.content.trim();
      if (cleaned.startsWith('```')) {
        const lines = cleaned.split('\n');
        lines.shift(); // remove opening fence
        if (lines[lines.length - 1] === '```') {
          lines.pop();
        }
        cleaned = lines.join('\n');
      }

      setGeneratedText(cleaned);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsGenerating(false);
    }
  }, [instruction, settings, selectedText, activeTab]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (generatedText !== null) {
      onApply(generatedText);
    } else {
      generateEdit();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div
      ref={containerRef}
      className="fixed z-50 w-[400px] rounded-lg border border-border bg-bg-elevated shadow-2xl"
      style={{ top: position.top, left: position.left }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-soft px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-fg">Inline Edit</span>
          <kbd className="rounded bg-bg px-1.5 py-0.5 text-[10px] text-fg-muted">Ctrl+K</kbd>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-fg-muted hover:bg-bg-hover hover:text-fg"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Selection preview */}
      <div className="max-h-24 overflow-auto border-b border-border-soft bg-bg/50 px-3 py-2">
        <div className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">Selected Code</div>
        <pre className="mt-1 overflow-x-auto text-xs text-fg-muted">
          {selectedText.length > 200 ? selectedText.slice(0, 200) + '...' : selectedText}
        </pre>
      </div>

      {/* Input area */}
      <form onSubmit={handleSubmit} className="p-3">
        <textarea
          ref={inputRef}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe the edit... (e.g., 'add error handling', 'convert to async/await')"
          className="w-full resize-none rounded border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
          rows={2}
          disabled={isGenerating}
        />

        {/* Generated preview */}
        {generatedText !== null && (
          <div className="mt-3 max-h-40 overflow-auto rounded border border-accent/30 bg-accent/5 p-2">
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-accent">
              Generated Edit {isGenerating && '(streaming...)'}
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-fg">
              {generatedText}
            </pre>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-2 rounded bg-red-500/10 px-2 py-1 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="mt-3 flex items-center justify-between">
          <div className="text-[10px] text-fg-subtle">
            {generatedText === null ? (
              <><kbd className="rounded bg-bg-hover px-1">Ctrl+Enter</kbd> to generate</>
            ) : (
              <><kbd className="rounded bg-bg-hover px-1">Ctrl+Enter</kbd> to apply</>
            )}
          </div>
          <div className="flex gap-2">
            {generatedText !== null && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setGeneratedText(null);
                    setInstruction('');
                  }}
                  className="rounded px-3 py-1.5 text-xs text-fg-muted hover:bg-bg-hover"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={generateEdit}
                  disabled={isGenerating}
                  className="rounded px-3 py-1.5 text-xs text-fg-muted hover:bg-bg-hover disabled:opacity-50"
                >
                  Regenerate
                </button>
              </>
            )}
            <button
              type="submit"
              disabled={isGenerating || !instruction.trim()}
              className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {isGenerating ? 'Generating...' : generatedText !== null ? 'Apply' : 'Generate'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
