/**
 * OpenRouter-compatible embedding API for optional semantic rerank (main process).
 */

const OPENROUTER = 'https://openrouter.ai/api/v1/embeddings';

function parseEmbeddingResponse(raw: string): number[][] {
  interface Wire {
    data?: Array<{ embedding?: number[] }>;
  }
  const json = JSON.parse(raw) as Wire;
  const out: number[][] = [];
  const rows = json.data ?? [];
  for (const row of rows) {
    const v = row.embedding;
    if (!Array.isArray(v)) continue;
    out.push(v.map((x) => Number(x)));
  }
  return out;
}

/** OpenAI-compatible POST /v1/embeddings (Ollama, LM Studio, vLLM, …). */
export async function embedTextsOpenAiCompatible(
  baseUrl: string,
  apiKey: string | undefined,
  model: string,
  texts: string[],
): Promise<number[][]> {
  const root = baseUrl.replace(/\/*$/, '');
  if (!root.trim() || !model.trim() || texts.length === 0) {
    throw new Error('embedding: missing base URL, model, or texts');
  }
  const url = `${root}/embeddings`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const key = (apiKey ?? '').trim();
  if (key) headers.Authorization = `Bearer ${key}`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: model.trim(),
      input: texts,
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`embedding HTTP ${res.status}: ${raw.slice(0, 400)}`);
  }
  const out = parseEmbeddingResponse(raw);
  if (out.length !== texts.length) {
    throw new Error('embedding: unexpected response shape');
  }
  return out;
}

export async function embedTextsOpenRouter(
  apiKey: string,
  model: string,
  texts: string[],
): Promise<number[][]> {
  if (!apiKey.trim() || !model.trim() || texts.length === 0) {
    throw new Error('embedding: missing api key, model, or texts');
  }

  const res = await fetch(OPENROUTER, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://router-studio.local',
      'X-Title': 'Router Studio',
    },
    body: JSON.stringify({
      model: model.trim(),
      input: texts,
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`embedding HTTP ${res.status}: ${raw.slice(0, 400)}`);
  }
  const out = parseEmbeddingResponse(raw);
  if (out.length !== texts.length) {
    throw new Error('embedding: unexpected response shape');
  }
  return out;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d > 0 ? dot / d : 0;
}
