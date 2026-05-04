import type { NormalizedModel } from '../../shared/types';

/**
 * Build OpenRouter `modalities` for /v1/chat/completions when the model can emit images.
 * @see https://openrouter.ai/docs/guides/overview/multimodal/image-generation
 */
export function chatModalitiesForOpenRouter(
  openAiBaseUrl: string | undefined,
  meta: NormalizedModel | null | undefined,
): { modalities?: string[] } {
  if (openAiBaseUrl?.trim()) return {};
  const outs = meta?.outputModalities ?? [];
  if (!outs.includes('image')) return {};
  if (outs.includes('text')) {
    return { modalities: ['image', 'text'] };
  }
  return { modalities: ['image'] };
}
