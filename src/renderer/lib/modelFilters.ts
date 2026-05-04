import type {
  ModelCategory,
  NormalizedModel,
  OpenRouterModelRaw,
  PriceTier,
} from '../../shared/types';

const CODING_HINTS = [
  'code',
  'coder',
  'deepseek',
  'qwen',
  'claude',
  'sonnet',
  'gpt',
  'dev',
  'agent',
  'instruct',
  'granite',
];

const REASONING_HINTS = [
  'reason',
  'thinking',
  'o1',
  'o3',
  'o4',
  'r1',
  'qwq',
  'thinking',
  'deepthink',
];

const VISION_HINTS = [
  'vision',
  'multimodal',
  'gpt-4o',
  'gpt-4-turbo',
  'gpt-5',
  'claude-3',
  'claude-sonnet',
  'claude-opus',
  'claude-haiku',
  'gemini-1.5',
  'gemini-2',
  'gemini-pro-vision',
  'llava',
  'pixtral',
  'qwen-vl',
  'qwen2-vl',
  'grok-vision',
  'phi-3-vision',
  'internvl',
];

const IMAGE_GEN_HINTS = [
  'dall-e',
  'dall·e',
  'dalle',
  'flux',
  'stable-diffusion',
  'sdxl',
  'imagen',
  'midjourney',
  'titan-image',
  'firefly',
  'recraft',
  'kolors',
  'playground-v2',
  'ideogram',
  'bagel',
];

const VIDEO_GEN_HINTS = [
  'veo',
  'sora',
  'pika',
  'runway',
  'mochi',
  'ltx-video',
  'cogvideo',
  'hailuo',
  'kling',
  'luma',
  'hunyuan-video',
  'wan-video',
  'seedance',
  'wan-2',
];

const AUDIO_HINTS = [
  'whisper',
  'tts',
  'text-to-speech',
  'speech-to-text',
  'voice',
  'audio',
  'eleven',
  'suno',
  'bark-',
  'parler',
  'seed-tts',
];

const FAST_HINTS = ['flash', 'haiku', 'mini', 'lite', 'nano', 'turbo', 'small'];

/** Lowest positive numeric value in OpenRouter video `pricing_skus` (USD-ish per unit). */
function minPositiveVideoSku(skus: Record<string, string> | undefined): number | null {
  if (!skus) return null;
  let min = Infinity;
  for (const v of Object.values(skus)) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0 && n < min) min = n;
  }
  return Number.isFinite(min) && min < Infinity ? min : null;
}

function maxPositiveVideoSku(skus: Record<string, string> | undefined): number | null {
  if (!skus) return null;
  let max = 0;
  for (const v of Object.values(skus)) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0 && n > max) max = n;
  }
  return max > 0 ? max : null;
}

/** Format a single OpenRouter video SKU dollar amount for display. */
function fmtVideoSkuDollar(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 0.01) return n.toFixed(3);
  if (n >= 0.001) return n.toFixed(4);
  return n.toFixed(6);
}

/**
 * Human-readable OpenRouter video pricing (per-second, resolution tiers, video tokens — not chat tokens).
 * Returns null when SKUs are missing.
 */
export function formatVideoSkuPriceSummary(raw: OpenRouterModelRaw): string | null {
  const skus = raw.video_pricing_skus;
  if (!skus || Object.keys(skus).length === 0) return null;
  const lo = minPositiveVideoSku(skus);
  const hi = maxPositiveVideoSku(skus);
  if (lo == null || lo <= 0) return null;
  if (hi == null || Math.abs(hi - lo) < 1e-9) return `from ~$${fmtVideoSkuDollar(lo)} (video API)`;
  return `~$${fmtVideoSkuDollar(lo)}–${fmtVideoSkuDollar(hi)} (video API)`;
}

export function normalizeModel(raw: OpenRouterModelRaw): NormalizedModel {
  const id = raw.id;
  const name = raw.name ?? raw.id;
  const description = raw.description ?? '';
  const contextLength = raw.context_length ?? raw.top_provider?.context_length ?? 0;
  let pricingPrompt = parsePrice(raw.pricing?.prompt);
  let pricingCompletion = parsePrice(raw.pricing?.completion);

  const videoSkuMin = minPositiveVideoSku(raw.video_pricing_skus);
  if (videoSkuMin != null && videoSkuMin > 0) {
    // Video catalog bills by the second / output unit, not chat tokens — synthesize fields so
    // the picker is not labeled "free" and sort/tier reflect relative cost.
    pricingPrompt = videoSkuMin / 50_000;
    pricingCompletion = videoSkuMin / 10_000;
  }

  const inPricePerM = pricingPrompt * 1_000_000;
  const outPricePerM = pricingCompletion * 1_000_000;
  const avgPricePerM = (inPricePerM + outPricePerM) / 2;

  const idLower = id.toLowerCase();
  const nameLower = name.toLowerCase();
  const descLower = description.toLowerCase();

  const looksLikeOpenRouterFree =
    (pricingPrompt === 0 && pricingCompletion === 0) ||
    idLower.includes(':free') ||
    nameLower.includes('(free)');

  const hay = `${idLower} ${nameLower} ${descLower}`;
  const isLikelyCodingModel = CODING_HINTS.some((h) => hay.includes(h));

  const categories = detectCategories({
    idLower,
    nameLower,
    descLower,
    contextLength,
    raw,
    looksLikeOpenRouterFree,
  });

  const isSpecialModality =
    categories.includes('video-gen') || categories.includes('image-gen');
  const isFree = !isSpecialModality && looksLikeOpenRouterFree;

  const priceTier = detectPriceTier(avgPricePerM, isFree);

  const outputModalities = (raw.architecture?.output_modalities ?? []).map((m) =>
    String(m).toLowerCase(),
  );

  return {
    id,
    name,
    description,
    outputModalities,
    contextLength,
    pricingPrompt,
    pricingCompletion,
    inPricePerM,
    outPricePerM,
    avgPricePerM,
    isFree,
    isLikelyCodingModel,
    categories,
    priceTier,
    raw,
  };
}

function detectPriceTier(avgPricePerM: number, isFree: boolean): PriceTier {
  if (isFree) return 'free';
  if (!Number.isFinite(avgPricePerM) || avgPricePerM <= 0) return 'mid';
  if (avgPricePerM < 0.5) return 'cheap';
  if (avgPricePerM < 5) return 'mid';
  return 'premium';
}

/** OpenRouter sometimes sends negative sentinel values (e.g. -1 per token) for variable / router pricing. */
function parsePrice(v: string | undefined): number {
  if (v === undefined || v === null) return 0;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function detectCategories(args: {
  idLower: string;
  nameLower: string;
  descLower: string;
  contextLength: number;
  looksLikeOpenRouterFree: boolean;
  raw: OpenRouterModelRaw;
}): ModelCategory[] {
  const { idLower, nameLower, descLower, contextLength, looksLikeOpenRouterFree, raw } = args;
  const hay = `${idLower} ${nameLower} ${descLower}`;
  const cats = new Set<ModelCategory>();

  const arch = raw.architecture ?? {};
  const inputMods = (arch.input_modalities ?? []).map((s) => s.toLowerCase());
  const outputMods = (arch.output_modalities ?? []).map((s) => s.toLowerCase());
  const modality = (arch.modality ?? '').toLowerCase();

  // --- Output-modality-based categories ---
  if (outputMods.includes('image') || /->\s*image/.test(modality)) {
    cats.add('image-gen');
  } else if (IMAGE_GEN_HINTS.some((h) => hay.includes(h))) {
    cats.add('image-gen');
  }

  if (outputMods.includes('video') || /->\s*video/.test(modality)) {
    cats.add('video-gen');
  } else if (VIDEO_GEN_HINTS.some((h) => hay.includes(h))) {
    cats.add('video-gen');
  }

  if (
    outputMods.includes('audio') ||
    inputMods.includes('audio') ||
    /audio/.test(modality)
  ) {
    cats.add('audio');
  } else if (AUDIO_HINTS.some((h) => hay.includes(h))) {
    cats.add('audio');
  }

  // --- Input-modality-based (vision = accepts images) ---
  if (inputMods.includes('image') || modality.includes('image')) {
    cats.add('vision');
  } else if (VISION_HINTS.some((h) => hay.includes(h))) {
    cats.add('vision');
  }

  // --- Name / description heuristics ---
  if (REASONING_HINTS.some((h) => hay.includes(h))) cats.add('reasoning');
  if (CODING_HINTS.some((h) => hay.includes(h))) cats.add('coding');
  if (FAST_HINTS.some((h) => hay.includes(h))) cats.add('fast');

  if (contextLength >= 128_000) cats.add('large-context');
  const excludeFreeCategory = cats.has('video-gen') || cats.has('image-gen');
  if (!excludeFreeCategory && looksLikeOpenRouterFree) cats.add('free');

  // Only assign 'chat' when it's a plain text→text model that isn't already
  // obviously specialized. This keeps the Chat bucket meaningful.
  const isSpecialized =
    cats.has('image-gen') || cats.has('video-gen') || cats.has('audio');
  if (!isSpecialized) {
    const isTextOut =
      outputMods.length === 0 ||
      outputMods.includes('text') ||
      /->\s*text/.test(modality) ||
      modality === '';
    if (isTextOut) cats.add('chat');
  }

  return Array.from(cats);
}

export interface FilterOptions {
  query: string;
  category: 'all' | ModelCategory;
  priceTiers: PriceTier[];
}

export function filterModels(models: NormalizedModel[], opt: FilterOptions): NormalizedModel[] {
  const q = opt.query.trim().toLowerCase();
  return models.filter((m) => {
    if (q) {
      const hay = `${m.id} ${m.name} ${m.description}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (opt.category !== 'all' && !m.categories.includes(opt.category)) return false;
    if (opt.priceTiers.length > 0 && !opt.priceTiers.includes(m.priceTier)) return false;
    return true;
  });
}

export type SortKey = 'price-asc' | 'price-desc' | 'context-desc' | 'name-asc';

export function sortModels(models: NormalizedModel[], sort: SortKey): NormalizedModel[] {
  const arr = models.slice();
  switch (sort) {
    case 'price-asc':
      arr.sort((a, b) => a.avgPricePerM - b.avgPricePerM || a.name.localeCompare(b.name));
      break;
    case 'price-desc':
      arr.sort((a, b) => b.avgPricePerM - a.avgPricePerM || a.name.localeCompare(b.name));
      break;
    case 'context-desc':
      arr.sort((a, b) => b.contextLength - a.contextLength || a.name.localeCompare(b.name));
      break;
    case 'name-asc':
      arr.sort((a, b) => a.name.localeCompare(b.name));
      break;
  }
  return arr;
}

export function discoverFreeModels(models: NormalizedModel[]): NormalizedModel[] {
  return models.filter((m) => m.isFree);
}

export function modelsInCategory(
  models: NormalizedModel[],
  category: 'all' | ModelCategory,
): NormalizedModel[] {
  if (category === 'all') return models;
  return models.filter((m) => m.categories.includes(category));
}

/** Cheapest non-free paid model in a category (falls back to a free one). */
export function cheapestIn(
  models: NormalizedModel[],
  category: 'all' | ModelCategory,
): NormalizedModel | null {
  const pool = modelsInCategory(models, category);
  if (pool.length === 0) return null;
  const paid = pool.filter((m) => !m.isFree);
  if (paid.length > 0) {
    return paid.reduce((a, b) => (a.avgPricePerM <= b.avgPricePerM ? a : b));
  }
  return pool[0];
}

/** Highest-priced model in a category (proxy for "best"). */
export function premiumIn(
  models: NormalizedModel[],
  category: 'all' | ModelCategory,
): NormalizedModel | null {
  const pool = modelsInCategory(models, category);
  if (pool.length === 0) return null;
  return pool.reduce((a, b) => (a.avgPricePerM >= b.avgPricePerM ? a : b));
}

/** Model with the median price in a category (proxy for "balanced"). */
export function balancedIn(
  models: NormalizedModel[],
  category: 'all' | ModelCategory,
): NormalizedModel | null {
  const pool = modelsInCategory(models, category)
    .filter((m) => !m.isFree && m.avgPricePerM > 0)
    .slice()
    .sort((a, b) => a.avgPricePerM - b.avgPricePerM);
  if (pool.length === 0) return null;
  return pool[Math.floor(pool.length / 2)];
}

/** Price range summary for a category, for the sidebar. */
export function priceRange(
  models: NormalizedModel[],
  category: 'all' | ModelCategory,
): { min: number; max: number; anyFree: boolean; count: number } {
  const pool = modelsInCategory(models, category);
  if (pool.length === 0) return { min: 0, max: 0, anyFree: false, count: 0 };
  let min = Infinity;
  let max = 0;
  let anyFree = false;
  for (const m of pool) {
    if (m.isFree) anyFree = true;
    if (!Number.isFinite(m.avgPricePerM) || m.avgPricePerM <= 0) continue;
    if (m.avgPricePerM < min) min = m.avgPricePerM;
    if (m.avgPricePerM > max) max = m.avgPricePerM;
  }
  if (min === Infinity) min = 0;
  return { min, max, anyFree, count: pool.length };
}

export function formatPrice(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return 'free';
  if (v < 0.0000001) return v.toExponential(1);
  const perMil = v * 1_000_000;
  if (perMil >= 1) return `$${perMil.toFixed(2)}/M`;
  return `$${perMil.toFixed(3)}/M`;
}

export function formatPricePerM(perM: number): string {
  if (!Number.isFinite(perM) || perM <= 0) return 'free';
  if (perM >= 100) return `$${perM.toFixed(0)}/M`;
  if (perM >= 1) return `$${perM.toFixed(2)}/M`;
  return `$${perM.toFixed(3)}/M`;
}

export function formatContext(ctx: number): string {
  if (!ctx) return '—';
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(1)}M`;
  if (ctx >= 1000) return `${Math.round(ctx / 1000)}K`;
  return String(ctx);
}

export function priceTierLabel(tier: PriceTier): string {
  switch (tier) {
    case 'free':
      return 'FREE';
    case 'cheap':
      return '$';
    case 'mid':
      return '$$';
    case 'premium':
      return '$$$';
  }
}

export const CATEGORY_META: Record<
  'all' | ModelCategory,
  { label: string; description: string; icon: string }
> = {
  all: { label: 'All models', description: 'Every model from OpenRouter', icon: '*' },
  coding: {
    label: 'Coding',
    description: 'Models tuned for programming, diffs, refactors',
    icon: '</>',
  },
  chat: {
    label: 'Chat / General',
    description: 'General-purpose text models',
    icon: '💬',
  },
  reasoning: {
    label: 'Reasoning',
    description: 'Chain-of-thought / thinking / o-series / R1-style',
    icon: '🧠',
  },
  vision: {
    label: 'Vision',
    description: 'Accepts images as input (multimodal)',
    icon: '👁',
  },
  'image-gen': {
    label: 'Image generation',
    description: 'Text → image (DALL·E, Flux, SD, Imagen, …)',
    icon: '🖼',
  },
  'video-gen': {
    label: 'Video generation',
    description: 'Text → video (Veo, Sora, Pika, Runway, …)',
    icon: '🎬',
  },
  audio: {
    label: 'Audio / voice',
    description: 'TTS / STT / voice cloning',
    icon: '🔊',
  },
  fast: {
    label: 'Fast / cheap tier',
    description: 'Flash / Haiku / Mini / Nano / Turbo variants',
    icon: '⚡',
  },
  'large-context': {
    label: 'Large context',
    description: '128K tokens or more',
    icon: '📚',
  },
  free: {
    label: 'Free',
    description: 'Zero-cost models (rate-limited)',
    icon: '✦',
  },
};

export const PRICE_TIER_META: Record<PriceTier, { label: string; helper: string }> = {
  free: { label: 'Free', helper: 'no cost' },
  cheap: { label: '$', helper: '< $0.50 /M tokens' },
  mid: { label: '$$', helper: '$0.50 – $5 /M tokens' },
  premium: { label: '$$$', helper: '> $5 /M tokens' },
};
