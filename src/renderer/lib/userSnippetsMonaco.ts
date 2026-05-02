import type * as Monaco from 'monaco-editor';
import { useSettings } from '../store/settingsStore';

const LANGS: Monaco.languages.LanguageSelector = [
  'typescript',
  'javascript',
  'javascriptreact',
  'typescriptreact',
  'json',
  'html',
  'css',
  'markdown',
  'yaml',
  'python',
  'rust',
  'go',
  'shell',
  'sql',
  'plaintext',
];

let disposable: Monaco.IDisposable | null = null;

export function registerUserSnippetCompletions(monacoNs: typeof Monaco): Monaco.IDisposable {
  if (disposable) {
    return disposable;
  }

  disposable = monacoNs.languages.registerCompletionItemProvider(LANGS, {
    triggerCharacters: [],
    provideCompletionItems(model, position) {
      const settings = useSettings.getState().settings;
      const snippets = settings.userSnippets ?? [];
      if (snippets.length === 0) {
        return { suggestions: [] };
      }
      const lang = model.getLanguageId();
      const line = model.getLineContent(position.lineNumber);
      const before = line.slice(0, position.column - 1);
      const word = before.match(/[\w$-]+$/)?.[0] ?? '';

      const suggestions: Monaco.languages.CompletionItem[] = [];
      for (const s of snippets) {
        if (s.languages && s.languages.length > 0 && !s.languages.includes(lang)) {
          continue;
        }
        const wordLower = word.toLowerCase();
        const prefixLower = s.prefix.toLowerCase();
        const nameLower = (s.name || '').toLowerCase();
        if (
          word &&
          !prefixLower.startsWith(wordLower) &&
          !prefixLower.includes(wordLower) &&
          !nameLower.includes(wordLower)
        ) {
          continue;
        }
        suggestions.push({
          label: s.name || s.prefix,
          kind: monacoNs.languages.CompletionItemKind.Snippet,
          insertText: s.body,
          insertTextRules: monacoNs.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: s.prefix,
          range: new monacoNs.Range(
            position.lineNumber,
            position.column - word.length,
            position.lineNumber,
            position.column,
          ),
          sortText: '0' + s.prefix,
        });
      }
      return { suggestions };
    },
  });
  return disposable;
}
