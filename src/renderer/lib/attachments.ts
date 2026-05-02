import type { Attachment, NormalizedModel } from '../../shared/types';

/** Rough heuristics for whether a model accepts images. */
const VISION_HINTS = [
  'vision',
  'multimodal',
  'image',
  'gpt-4o',
  'gpt-4-turbo',
  'gpt-5',
  'claude-3',
  'claude-3-5',
  'claude-3-7',
  'claude-4',
  'claude-sonnet',
  'claude-opus',
  'gemini-1.5',
  'gemini-2',
  'gemini-pro-vision',
  'llava',
  'pixtral',
  'qwen-vl',
  'qwen2-vl',
  'grok-vision',
];

export function isLikelyVisionModel(id: string, meta?: NormalizedModel | null): boolean {
  const hay = `${id} ${meta?.name ?? ''} ${meta?.description ?? ''}`.toLowerCase();
  // Explicit signals from OpenRouter metadata first.
  const modality =
    (meta?.raw?.architecture?.modality ?? '').toLowerCase() +
    ' ' +
    JSON.stringify(meta?.raw?.architecture ?? {}).toLowerCase();
  if (modality.includes('image') || modality.includes('multimodal')) return true;
  return VISION_HINTS.some((h) => hay.includes(h));
}

export function attachmentLabel(a: Attachment): string {
  switch (a.kind) {
    case 'image':
      return a.filename ?? 'image';
    case 'url':
      return a.sourceUrl ?? 'url';
    case 'file':
      return a.filename ?? 'file';
    case 'snippet':
      return a.label || 'snippet';
  }
}

export function attachmentBadge(a: Attachment): string {
  switch (a.kind) {
    case 'image':
      return 'IMG';
    case 'url':
      return 'URL';
    case 'file':
      return 'FILE';
    case 'snippet':
      return 'TXT';
  }
}

/** Format an attachment's text content as a labeled block for the prompt. */
export function formatAttachmentForPrompt(a: Attachment): string | null {
  if (a.kind === 'image') return null; // images travel as multi-part image_url
  const text = (a.text ?? '').trim();
  if (!text) return null;
  if (a.kind === 'url') {
    const header = `--- BEGIN ATTACHED URL: ${a.sourceUrl ?? ''} ---`;
    const footer = `--- END ATTACHED URL ---`;
    return `${header}\n${text}\n${footer}`;
  }
  if (a.kind === 'file') {
    const lang = a.language ?? 'plaintext';
    const header = `--- BEGIN ATTACHED FILE: ${a.filename ?? 'file'} ---`;
    const footer = `--- END ATTACHED FILE ---`;
    return `${header}\n\`\`\`${lang}\n${text}\n\`\`\`\n${footer}`;
  }
  // snippet
  const header = `--- BEGIN ATTACHED SNIPPET: ${a.label} ---`;
  const footer = `--- END ATTACHED SNIPPET ---`;
  const lang = a.language ?? '';
  const fenced = lang ? `\`\`\`${lang}\n${text}\n\`\`\`` : text;
  return `${header}\n${fenced}\n${footer}`;
}

/** Approximate size in a short human-readable form. */
export function humanSize(bytes?: number): string {
  if (!bytes || !Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
