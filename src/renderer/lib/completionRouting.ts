import type { AppSettings } from '../../shared/types';

/** Derive chat completion routing from persisted settings. */
export function getCompletionRouting(settings: AppSettings): {
  apiKey: string;
  openAiBaseUrl?: string;
} {
  if (settings.aiCompletionProvider === 'local_openai') {
    const base = (settings.localOpenAiBaseUrl || 'http://127.0.0.1:11434/v1').trim().replace(/\/+$/, '');
    return {
      apiKey: settings.apiKey ?? '',
      openAiBaseUrl: base || undefined,
    };
  }
  return { apiKey: settings.apiKey ?? '' };
}

export function isLocalOpenAiProvider(settings: AppSettings): boolean {
  return settings.aiCompletionProvider === 'local_openai';
}

/**
 * Whether we can load the model catalog: OpenRouter exposes GET /v1/models + /v1/videos/models
 * without an API key; local servers require a reachable base URL.
 */
export function canRefreshModelCatalog(settings: AppSettings): boolean {
  if (settings.aiCompletionProvider === 'local_openai') {
    const routing = getCompletionRouting(settings);
    return !!routing.openAiBaseUrl?.trim();
  }
  return true;
}
