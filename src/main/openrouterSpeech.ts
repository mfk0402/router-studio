/**
 * OpenRouter text-to-speech API (POST /api/v1/tts).
 * @see https://openrouter.ai/docs/api/api-reference/tts/create-tts
 */

import type { OpenRouterSpeechRequest } from '../shared/types.js';

const API_BASE = 'https://openrouter.ai/api/v1';
const APP_REFERER = 'https://router-studio.local';
const APP_TITLE = 'Router Studio';

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': APP_REFERER,
    'X-Title': APP_TITLE,
  };
}

const FORMAT_TO_EXT: Record<string, string> = {
  mp3: 'mp3',
  opus: 'opus',
  aac: 'aac',
  flac: 'flac',
  wav: 'wav',
  pcm: 'pcm',
};

function extensionFromMime(mime: string, format?: string): string {
  if (format) {
    const f = format.toLowerCase();
    if (FORMAT_TO_EXT[f]) return FORMAT_TO_EXT[f];
  }
  const m = mime.toLowerCase();
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('opus')) return 'opus';
  if (m.includes('aac') || m.includes('mp4')) return 'aac';
  if (m.includes('flac')) return 'flac';
  if (m.includes('wav')) return 'wav';
  if (m.includes('pcm')) return 'pcm';
  return 'bin';
}

export interface SpeechResult {
  /** Base64-encoded audio bytes */
  base64: string;
  mimeType: string;
  fileExtension: string;
}

export async function createSpeech(apiKey: string, req: OpenRouterSpeechRequest): Promise<SpeechResult> {
  if (!apiKey.trim()) throw new Error('OpenRouter API key missing.');

  const body: Record<string, unknown> = {
    model: req.model,
    input: req.input,
    voice: req.voice,
  };
  if (req.speed != null) body.speed = req.speed;
  if (req.response_format) body.response_format = req.response_format;
  if (req.provider && typeof req.provider === 'object') body.provider = req.provider;

  const res = await fetch(`${API_BASE}/tts`, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`TTS failed (${res.status}): ${txt.slice(0, 500)}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const rawMime = res.headers.get('content-type')?.split(';')[0]?.trim() ?? 'application/octet-stream';
  const mimeType = rawMime === 'application/octet-stream' ? guessMime(req.response_format) : rawMime;
  const fileExtension = extensionFromMime(mimeType, req.response_format);

  return {
    base64: buf.toString('base64'),
    mimeType,
    fileExtension,
  };
}

function guessMime(format?: string): string {
  switch (format?.toLowerCase()) {
    case 'mp3':
      return 'audio/mpeg';
    case 'opus':
      return 'audio/opus';
    case 'aac':
      return 'audio/aac';
    case 'flac':
      return 'audio/flac';
    case 'wav':
      return 'audio/wav';
    case 'pcm':
      return 'audio/pcm';
    default:
      return 'audio/mpeg';
  }
}
