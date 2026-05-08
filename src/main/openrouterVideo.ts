/**
 * OpenRouter async video generation API (/api/v1/videos).
 * @see https://openrouter.ai/docs/guides/overview/multimodal/video-generation
 * @see https://openrouter.ai/docs/api/api-reference/video-generation/create-videos
 *
 * Video-capable model ids are listed at GET /api/v1/videos/models (not always present in GET /v1/models).
 */

import type { OpenRouterModelRaw, OpenRouterVideoSubmitRequest } from '../shared/types.js';

const API_BASE = 'https://openrouter.ai/api/v1';
const APP_REFERER = 'https://router-studio.local';
const APP_TITLE = 'Router Studio';

/** Row shape from GET /api/v1/videos/models (subset). */
export interface OpenRouterVideoCatalogRow {
  id: string;
  name?: string;
  description?: string | null;
  canonical_slug?: string;
  pricing_skus?: Record<string, string>;
}

function publicHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'HTTP-Referer': APP_REFERER,
    'X-Title': APP_TITLE,
  };
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': APP_REFERER,
    'X-Title': APP_TITLE,
  };
}

export type VideoGenStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'expired';

export interface VideoSubmitResult {
  id: string;
  polling_url: string;
  status: VideoGenStatus;
}

export interface VideoPollResult {
  status: VideoGenStatus;
  unsigned_urls?: string[];
  error?: string;
}

function buildVideosRequestBody(req: OpenRouterVideoSubmitRequest): Record<string, unknown> {
  const model = req.model.trim();
  const payload: Record<string, unknown> = {
    model,
    prompt: req.prompt,
  };
  if (req.aspect_ratio) payload.aspect_ratio = req.aspect_ratio;
  if (req.duration != null) payload.duration = req.duration;
  if (req.resolution) payload.resolution = req.resolution;
  if (req.seed != null) payload.seed = req.seed;

  const frames = req.frame_images ?? [];
  if (frames.length > 0) payload.frame_images = frames;

  const refs = req.input_references ?? [];
  if (refs.length > 0) payload.input_references = refs;

  // Always include literal booleans (`false must not vanish`).
  if (typeof req.generate_audio === 'boolean') {
    payload.generate_audio = req.generate_audio;
  }

  return payload;
}

export async function submitVideoJob(
  apiKey: string,
  req: OpenRouterVideoSubmitRequest,
): Promise<VideoSubmitResult> {
  if (!apiKey.trim()) throw new Error('OpenRouter API key missing.');
  const res = await fetch(`${API_BASE}/videos`, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify(buildVideosRequestBody(req)),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Video submit failed (${res.status}): ${txt.slice(0, 300)}`);
  }
  const data = (await res.json()) as VideoSubmitResult;
  if (!data.id || !data.polling_url) {
    throw new Error('Video submit: unexpected response.');
  }
  return data;
}

export async function pollVideoJob(apiKey: string, pollingUrl: string): Promise<VideoPollResult> {
  const res = await fetch(pollingUrl, {
    method: 'GET',
    headers: authHeaders(apiKey),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Video poll failed (${res.status}): ${txt.slice(0, 200)}`);
  }
  return (await res.json()) as VideoPollResult;
}

function videoCatalogRowToRaw(row: OpenRouterVideoCatalogRow): OpenRouterModelRaw {
  const desc =
    typeof row.description === 'string'
      ? row.description
      : row.description === null
        ? ''
        : '';
  const raw: OpenRouterModelRaw = {
    id: row.id,
    name: row.name,
    description: desc || undefined,
    context_length: 0,
    architecture: {
      tokenizer: 'Other',
      modality: 'text+image->video',
      input_modalities: ['text', 'image'],
      output_modalities: ['video'],
    },
  };
  if (row.pricing_skus && Object.keys(row.pricing_skus).length > 0) {
    raw.video_pricing_skus = { ...row.pricing_skus };
  }
  return raw;
}

/**
 * Async video models are advertised under GET /v1/videos/models; merge them into the chat /v1/models
 * catalog so the Model Picker matches OpenRouter’s site (Video modality / video-gen filter).
 */
export async function mergeVideoGenerationModels(
  chatModels: OpenRouterModelRaw[],
): Promise<OpenRouterModelRaw[]> {
  let rows: OpenRouterVideoCatalogRow[] = [];
  try {
    const res = await fetch(`${API_BASE}/videos/models`, {
      method: 'GET',
      headers: publicHeaders(),
    });
    if (!res.ok) {
      return chatModels;
    }
    const json = (await res.json()) as { data?: OpenRouterVideoCatalogRow[] };
    rows = Array.isArray(json.data) ? json.data : [];
  } catch {
    return chatModels;
  }

  const byId = new Map<string, OpenRouterModelRaw>();
  for (const m of chatModels) {
    byId.set(m.id, m);
  }

  for (const row of rows) {
    if (!row?.id || typeof row.id !== 'string') continue;
    const v = videoCatalogRowToRaw(row);
    const existing = byId.get(v.id);
    if (!existing) {
      byId.set(v.id, v);
      continue;
    }

    const outs = (existing.architecture?.output_modalities ?? []).map((s) => s.toLowerCase());
    if (!outs.includes('video')) {
      const prev = existing.architecture ?? {};
      existing.architecture = {
        ...prev,
        tokenizer: prev.tokenizer ?? 'Other',
        modality: prev.modality && /->\s*video/i.test(prev.modality) ? prev.modality : 'text+image->video',
        input_modalities: Array.from(
          new Set([...(prev.input_modalities ?? []), 'text', 'image']),
        ),
        output_modalities: [...(prev.output_modalities ?? []), 'video'],
      };
    }
    if ((!existing.description || existing.description.length < 40) && v.description) {
      existing.description = v.description;
    }
    if (!existing.name?.trim() && v.name) {
      existing.name = v.name;
    }
    if (v.video_pricing_skus && Object.keys(v.video_pricing_skus).length > 0) {
      existing.video_pricing_skus = { ...v.video_pricing_skus };
    }
  }

  return Array.from(byId.values());
}
