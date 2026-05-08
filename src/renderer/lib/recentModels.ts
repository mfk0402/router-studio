/** Recent model ids for Model Marketplace (OpenAI-style ids only; not auto-router tokens). */

export const MAX_RECENT_MODEL_IDS = 12;

export function touchRecentModelIds(prev: string[] | undefined, modelId: string): string[] {
  const id = String(modelId ?? '').trim();
  if (!id) return prev ?? [];
  if (
    id.startsWith('router-studio/') ||
    id === 'openrouter/auto' ||
    id.startsWith('openrouter/auto:')
  ) {
    return prev ?? [];
  }
  const list = prev ?? [];
  const next = [id, ...list.filter((x) => x !== id)];
  return next.slice(0, MAX_RECENT_MODEL_IDS);
}

export function providerLabelFromModelId(modelId: string): string {
  const i = modelId.indexOf('/');
  if (i <= 0) return modelId || '—';
  return modelId.slice(0, i);
}
