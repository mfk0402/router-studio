import { modelsInCategory } from './modelFilters';
import type {
  AppSettings,
  ModelCategory,
  NormalizedModel,
  ProductMode,
} from '../../shared/types';

/** Infer task + pick cheapest suitable model in that bucket (OpenRouter catalog only). */
export const ROUTER_STUDIO_AUTO = 'router-studio/auto' as const;

const AUTO_PREFIX = 'router-studio/auto:';

export function isRouterStudioAuto(modelId: string): boolean {
  return modelId === ROUTER_STUDIO_AUTO || modelId.startsWith(AUTO_PREFIX);
}

export type ParsedAuto =
  | { kind: 'infer' }
  | { kind: 'category'; category: ModelCategory };

export function parseRouterStudioAuto(modelId: string): ParsedAuto | null {
  if (modelId === ROUTER_STUDIO_AUTO) return { kind: 'infer' };
  if (!modelId.startsWith(AUTO_PREFIX)) return null;
  const rest = modelId.slice(AUTO_PREFIX.length);
  const cat = rest as ModelCategory;
  if (isModelCategory(cat)) return { kind: 'category', category: cat };
  return null;
}

const CATEGORY_SET = new Set<ModelCategory>([
  'coding',
  'chat',
  'reasoning',
  'vision',
  'image-gen',
  'video-gen',
  'audio',
  'fast',
  'large-context',
  'free',
]);

function isModelCategory(s: string): s is ModelCategory {
  return CATEGORY_SET.has(s as ModelCategory);
}

/** Models that can answer `/v1/chat/completions` with text (exclude pure image/video generators). */
export function isChatCompletionSuitable(m: NormalizedModel): boolean {
  const out = m.outputModalities;
  if (out.length === 0) return true;
  if (out.includes('text')) return true;
  return false;
}

export interface AutoRouteInferenceInput {
  hasImageAttachment: boolean;
  productMode: ProductMode;
  toolsEnabled: boolean;
  agentMode: boolean;
  userTextPreview: string;
  estimatedPromptTokens: number;
}

export function inferCategoryForRequest(ctx: AutoRouteInferenceInput): ModelCategory {
  if (ctx.hasImageAttachment) return 'vision';
  if (ctx.estimatedPromptTokens >= 80_000) return 'large-context';

  const mode = ctx.productMode;
  if (mode === 'architect' || mode === 'review') return 'reasoning';
  if (mode === 'agent' || mode === 'edit') return 'coding';
  if (ctx.agentMode || ctx.toolsEnabled) return 'coding';

  const t = ctx.userTextPreview.toLowerCase();
  if (
    /\b(refactor|debug|implement|typescript|javascript|python|rust|go|java|function\s*\(|class\s+\w+|pull request|commit|git)\b/.test(
      t,
    )
  ) {
    return 'coding';
  }
  if (/\b(prove|why|step|reason|logic|theorem)\b/.test(t)) {
    return 'reasoning';
  }
  return 'chat';
}

function filterChatPool(models: NormalizedModel[]): NormalizedModel[] {
  return models.filter(isChatCompletionSuitable);
}

function pickCheapestInCategory(
  models: NormalizedModel[],
  category: ModelCategory,
): NormalizedModel | null {
  const pool = filterChatPool(modelsInCategory(models, category));
  if (pool.length === 0) return null;
  return pool.reduce((a, b) => (a.avgPricePerM <= b.avgPricePerM ? a : b));
}

function fallbackChatModelFromPool(pool: NormalizedModel[]): string {
  const chat = pickCheapestInCategory(pool, 'chat');
  if (chat) return chat.id;
  const any = filterChatPool(pool)[0];
  if (any) return any.id;
  return 'openrouter/auto';
}

function fallbackChatModelId(models: NormalizedModel[]): string {
  return fallbackChatModelFromPool(models);
}

/**
 * If `modelId` maps to a model that cannot emit text on `/v1/chat/completions`, substitute a
 * fallback from `chatPool` (e.g. user picked a video-gen default like `alibaba/wan-2.7`).
 */
function ensureChatCompletionModelId(
  allModels: NormalizedModel[],
  chatPool: NormalizedModel[],
  modelId: string,
): { id: string; coercedFrom?: string } {
  const meta = allModels.find((m) => m.id === modelId);
  if (!meta) return { id: modelId };
  if (isChatCompletionSuitable(meta)) return { id: modelId };
  return { id: fallbackChatModelFromPool(chatPool), coercedFrom: modelId };
}

/**
 * Resolve `router-studio/auto` / `router-studio/auto:coding` into a concrete OpenRouter model id.
 * Prefers the cheapest suitable model in the inferred or fixed category.
 */
export function resolveOpenRouterAutoModel(
  models: NormalizedModel[],
  defaultModel: string,
  inference: AutoRouteInferenceInput,
): { modelId: string; category: ModelCategory; wasAuto: boolean } {
  const parsed = parseRouterStudioAuto(defaultModel);
  if (!parsed) {
    return { modelId: defaultModel, category: 'chat', wasAuto: false };
  }

  const category =
    parsed.kind === 'infer' ? inferCategoryForRequest(inference) : parsed.category;

  let picked = pickCheapestInCategory(models, category);
  if (!picked && category !== 'chat') {
    picked = pickCheapestInCategory(models, 'chat');
  }
  if (!picked) {
    return { modelId: fallbackChatModelId(models), category, wasAuto: true };
  }
  return { modelId: picked.id, category, wasAuto: true };
}

export interface ResolveChatModelsArgs {
  settings: AppSettings;
  models: NormalizedModel[];
  /** From `discoverFreeModels(models)` — used when freeMode is on */
  freeModels: NormalizedModel[];
  freeModeEnabled: boolean;
  openAiBaseUrl?: string;
  inference: AutoRouteInferenceInput;
}

export interface ResolvedChatModelSubstitution {
  role: 'primary' | 'read' | 'reasoning';
  requested: string;
  used: string;
}

export interface ResolvedChatModels {
  primary: string;
  read: string;
  reasoning: string;
  wasAuto: boolean;
  inferredCategory?: ModelCategory;
  /** When the user picked image/video-only ids for chat; each entry is one replacement. */
  modelSubstitutions?: ResolvedChatModelSubstitution[];
}

/**
 * Resolve primary + tool-routing models for one chat turn.
 * - Local OpenAI: uses `defaultModel` and read/reasoning overrides; coerces non-text models to a chat fallback.
 * - Explicit non-auto: same coercion for video/image-only choices.
 * - Auto sentinels: cheapest in inferred (or fixed) category; reasoning hop uses cheapest `reasoning` when smart routing is on.
 */
function mergeModelSubs(
  ...items: Array<ResolvedChatModelSubstitution | undefined>
): ResolvedChatModelSubstitution[] | undefined {
  const out = items.filter(Boolean) as ResolvedChatModelSubstitution[];
  return out.length > 0 ? out : undefined;
}

function substitutionFor(
  role: ResolvedChatModelSubstitution['role'],
  result: { id: string; coercedFrom?: string },
): ResolvedChatModelSubstitution | undefined {
  if (!result.coercedFrom) return undefined;
  return { role, requested: result.coercedFrom, used: result.id };
}

export function resolveChatModelsForTurn(args: ResolveChatModelsArgs): ResolvedChatModels {
  const { settings, models, freeModels, freeModeEnabled, openAiBaseUrl, inference } = args;

  const chatPool = freeModeEnabled ? freeModels.filter(isChatCompletionSuitable) : models;

  if (openAiBaseUrl) {
    const id = settings.defaultModel;
    const p = ensureChatCompletionModelId(models, chatPool, id);
    const readR = ensureChatCompletionModelId(
      models,
      chatPool,
      settings.agentReadModel.trim() || p.id,
    );
    let reasoning: string;
    let rSub: ResolvedChatModelSubstitution | undefined;
    if (settings.agentReasoningModel.trim()) {
      const r = ensureChatCompletionModelId(models, chatPool, settings.agentReasoningModel.trim());
      reasoning = r.id;
      rSub = substitutionFor('reasoning', r);
    } else {
      reasoning = p.id;
    }
    return {
      primary: p.id,
      read: readR.id,
      reasoning,
      wasAuto: false,
      modelSubstitutions: mergeModelSubs(
        substitutionFor('primary', p),
        substitutionFor('read', readR),
        rSub,
      ),
    };
  }

  const id = settings.defaultModel;
  if (!isRouterStudioAuto(id)) {
    const p = ensureChatCompletionModelId(models, chatPool, id);
    const readR = ensureChatCompletionModelId(
      models,
      chatPool,
      settings.agentReadModel.trim() || p.id,
    );
    let reasoning: string;
    let rSub: ResolvedChatModelSubstitution | undefined;
    if (settings.agentReasoningModel.trim()) {
      const r = ensureChatCompletionModelId(models, chatPool, settings.agentReasoningModel.trim());
      reasoning = r.id;
      rSub = substitutionFor('reasoning', r);
    } else {
      reasoning = p.id;
    }
    return {
      primary: p.id,
      read: readR.id,
      reasoning,
      wasAuto: false,
      modelSubstitutions: mergeModelSubs(
        substitutionFor('primary', p),
        substitutionFor('read', readR),
        rSub,
      ),
    };
  }

  const catalog = chatPool;
  const { modelId: primary, category, wasAuto } = resolveOpenRouterAutoModel(catalog, id, inference);

  const readR = ensureChatCompletionModelId(
    models,
    chatPool,
    settings.agentReadModel.trim() || primary,
  );
  let reasoning: string;
  let rSub: ResolvedChatModelSubstitution | undefined;
  if (settings.agentReasoningModel.trim()) {
    const r = ensureChatCompletionModelId(models, chatPool, settings.agentReasoningModel.trim());
    reasoning = r.id;
    rSub = substitutionFor('reasoning', r);
  } else if (settings.smartAgentRouting) {
    const rCat: ModelCategory = 'reasoning';
    let rPick = pickCheapestInCategory(catalog, rCat);
    if (!rPick) rPick = pickCheapestInCategory(models, rCat);
    reasoning = rPick?.id ?? primary;
  } else {
    reasoning = primary;
  }

  return {
    primary,
    read: readR.id,
    reasoning,
    wasAuto,
    inferredCategory: category,
    modelSubstitutions: mergeModelSubs(substitutionFor('read', readR), rSub),
  };
}

/** Async `/v1/videos` jobs require a video-gen model id (see OpenRouter video API), not a chat or image model. */
export function resolveVideoModelId(
  models: NormalizedModel[],
  defaultModel: string,
  opts?: { preferFree?: boolean },
): string {
  const preferFree = opts?.preferFree ?? false;
  let pool = modelsInCategory(models, 'video-gen');
  if (pool.length === 0) return defaultModel;

  if (preferFree) {
    const freeOnly = pool.filter((m) => m.isFree);
    if (freeOnly.length > 0) pool = freeOnly;
  }

  const cheapestInPool = () =>
    pool.reduce((a, b) => (a.avgPricePerM <= b.avgPricePerM ? a : b));

  if (isRouterStudioAuto(defaultModel)) {
    return cheapestInPool().id;
  }

  const meta = models.find((m) => m.id === defaultModel);
  if (meta?.categories.includes('video-gen')) {
    return defaultModel;
  }

  return cheapestInPool().id;
}

function isVideoGenerationModel(m: NormalizedModel): boolean {
  return m.categories.includes('video-gen') || m.outputModalities.includes('video');
}

/**
 * Video jobs: use `openRouterVideoModel` when set and catalog-valid; otherwise same as
 * `resolveVideoModelId` from the default chat model.
 */
export function resolveVideoJobModelId(
  settings: AppSettings,
  models: NormalizedModel[],
  freeModeEnabled: boolean,
): string {
  const explicit = settings.openRouterVideoModel?.trim();
  if (explicit) {
    const meta = models.find((m) => m.id === explicit);
    if (meta && isVideoGenerationModel(meta)) {
      return explicit;
    }
  }
  return resolveVideoModelId(models, settings.defaultModel, {
    preferFree: freeModeEnabled,
  });
}
