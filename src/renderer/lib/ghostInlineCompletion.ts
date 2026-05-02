/**
 * Monaco ghost-text (inline completions) via OpenRouter FIM-style prompts.
 * Registered once; reads live settings from settingsStore.
 */

import type * as Monaco from 'monaco-editor';
import { useSettings } from '../store/settingsStore';

const GHOST_LANG_SELECTOR: Monaco.languages.LanguageSelector = [
  'typescript',
  'javascript',
  'javascriptreact',
  'typescriptreact',
  'json',
  'html',
  'css',
  'scss',
  'less',
  'markdown',
  'yaml',
  'sql',
  'shell',
  'python',
  'rust',
  'go',
  'java',
  'cpp',
  'csharp',
  'xml',
  'plaintext',
];

let lastCompleteAt = 0;
let disposable: Monaco.IDisposable | null = null;

function stripGhostOutput(raw: string, maxLen: number): string {
  let s = raw.trim();
  if (s.startsWith('```')) {
    const end = s.indexOf('```', 3);
    if (end !== -1) s = s.slice(s.indexOf('\n') + 1, end).trim();
    else s = s.replace(/^```\w*\n?/, '').trim();
  }
  s = s.replace(/\n{3,}/g, '\n\n');
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

export function registerGhostInlineCompletions(monacoNs: typeof Monaco): Monaco.IDisposable {
  if (disposable) {
    return disposable;
  }

  const provider: Monaco.languages.InlineCompletionsProvider = {
    provideInlineCompletions: async (model, position, context, token) => {
      void context;
      const settings = useSettings.getState().settings;
      const ed = settings.editor;
      if (!ed.ghostTextEnabled || !settings.apiKey?.trim()) {
        return { items: [] };
      }

      const debounceMs = ed.ghostTextDebounceMs ?? 450;
      const cooldownMs = ed.ghostTextCooldownMs ?? 1200;
      const maxOut = ed.ghostTextMaxOutputChars ?? 256;
      const maxPrefix = ed.ghostTextMaxPrefixChars ?? 6000;

      await new Promise((resolve) => setTimeout(resolve, debounceMs));
      if (token.isCancellationRequested) {
        return { items: [] };
      }

      const now = Date.now();
      if (now - lastCompleteAt < cooldownMs) {
        return { items: [] };
      }

      const offset = model.getOffsetAt(position);
      const full = model.getValue();
      if (offset < 0 || offset > full.length) {
        return { items: [] };
      }

      const start = Math.max(0, offset - maxPrefix);
      const prefix = full.slice(start, offset);
      const suffix = full.slice(offset, Math.min(full.length, offset + 400));

      const pathLabel = model.uri.path.replace(/^\//, '') || 'file';

      try {
        const res = await window.api.openrouter.chat({
          apiKey: settings.apiKey,
          model: settings.defaultModel,
          messages: [
            {
              role: 'system',
              content:
                'You are an inline code completion engine. Reply with ONLY the raw text that should be inserted at <CURSOR>. ' +
                'No markdown fences, no commentary, no quotes around the answer. ' +
                'Complete naturally (usually under 2 lines). Stop at a sensible boundary.',
            },
            {
              role: 'user',
              content:
                `File: ${pathLabel}\n\n` +
                'The cursor is exactly at <CURSOR> between prefix and suffix.\n\nPREFIX:\n' +
                prefix +
                '\n<CURSOR>\nSUFFIX:\n' +
                suffix,
            },
          ],
          temperature: 0.05,
          maxTokens: 128,
          stream: false,
        });

        if (token.isCancellationRequested) {
          return { items: [] };
        }

        const insert = stripGhostOutput(res.content ?? '', maxOut);
        if (!insert) {
          return { items: [] };
        }

        lastCompleteAt = Date.now();

        return {
          items: [
            {
              insertText: insert,
              range: new monacoNs.Range(
                position.lineNumber,
                position.column,
                position.lineNumber,
                position.column,
              ),
            },
          ],
        };
      } catch {
        return { items: [] };
      }
    },
    freeInlineCompletions: () => {
      /* no-op */
    },
  };

  disposable = monacoNs.languages.registerInlineCompletionsProvider(GHOST_LANG_SELECTOR, provider);
  return disposable;
}
