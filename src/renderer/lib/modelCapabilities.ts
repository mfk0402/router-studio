/**
 * Heuristics for OpenRouter model ids that commonly have no tool-calling endpoint
 * (image/gen/video/embeddings, etc.). The API error text remains the source of truth;
 * this avoids a wasted failing round-trip when possible.
 */
export function likelyNoToolsOpenRouterModel(modelId: string): boolean {
  const id = String(modelId ?? '').toLowerCase();
  if (!id) return false;
  if (id.includes('embedding') || id.includes('rerank') || id.includes('moderation')) return true;
  if (/\b(tts|speech|audio|video|image|flux|dall|midjourney|stable-diffusion)\b/.test(id)) return true;
  if (id.includes('flash-image') || id.includes('/image') || id.includes('image-preview')) return true;
  if (/-image\b/.test(id) || /image-/.test(id)) return true;
  return false;
}

/** OpenRouter returns this when no provider on the model supports `tools`. */
export function isOpenRouterToolUseUnsupportedError(message: string): boolean {
  const m = String(message ?? '').toLowerCase();
  if (!m) return false;
  if (m.includes('no endpoints found that support tool')) return true;
  if (m.includes('support tool use') && (m.includes('404') || m.includes('not found'))) return true;
  if (m.includes('endpoints found') && m.includes('tool')) return true;
  return false;
}
