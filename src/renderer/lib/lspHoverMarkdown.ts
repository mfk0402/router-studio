import type { IMarkdownString } from 'monaco-editor';

function fromMarkedParts(contents: unknown): IMarkdownString[] {
  if (typeof contents === 'string') {
    return [{ value: contents }];
  }
  if (Array.isArray(contents)) {
    return contents.flatMap((c) => fromMarkedParts(c));
  }
  if (contents && typeof contents === 'object') {
    const o = contents as Record<string, unknown>;
    if (typeof o.value === 'string' && typeof o.language === 'string') {
      return [{ value: `\`\`\`${o.language}\n${o.value}\n\`\`\`` }];
    }
    if ('kind' in o && typeof o.kind === 'string' && typeof o.value === 'string') {
      return [{ value: o.value }];
    }
  }
  return [];
}

/** Convert Language Server Hover JSON into Monaco markdown blocks (IPC-safe subset). */
export function lspHoverToMonacoMarkdown(hover: unknown | null): IMarkdownString[] | null {
  if (!hover || typeof hover !== 'object') return null;
  const h = hover as { contents?: unknown; range?: unknown };
  const parts = fromMarkedParts(h.contents);
  if (parts.length === 0) return null;
  return parts;
}
