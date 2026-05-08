import type { AppSettings, ModelCategory, ModelRouteExplanation, NormalizedModel } from '../shared/types.js';

function inferTaskType(input: {
  prompt: string;
  estimatedPromptTokens: number;
  hasImageAttachment: boolean;
  productMode: AppSettings['productMode'];
  agentMode: boolean;
}): ModelCategory {
  if (input.hasImageAttachment) return 'vision';
  if (input.estimatedPromptTokens >= 80_000) return 'large-context';
  if (input.productMode === 'architect' || input.productMode === 'review') return 'reasoning';
  if (input.productMode === 'agent' || input.productMode === 'edit' || input.agentMode) return 'coding';
  const t = input.prompt.toLowerCase();
  if (/\b(refactor|debug|implement|fix|typescript|javascript|python|rust|go|tests?|git|pr)\b/.test(t)) {
    return 'coding';
  }
  if (/\b(why|reason|architecture|design|tradeoff|prove|analyze)\b/.test(t)) return 'reasoning';
  return 'chat';
}

function priceForModel(models: NormalizedModel[], id: string): number | null {
  const m = models.find((x) => x.id === id);
  return m ? m.avgPricePerM : null;
}

function cheapestInCategory(models: NormalizedModel[], category: ModelCategory): NormalizedModel | null {
  const pool = models.filter(
    (m) =>
      m.categories.includes(category) &&
      (m.outputModalities.length === 0 || m.outputModalities.includes('text')),
  );
  if (pool.length === 0) return null;
  return pool.reduce((a, b) => (a.avgPricePerM <= b.avgPricePerM ? a : b));
}

export function explainModelRoute(input: {
  settings: AppSettings;
  models: NormalizedModel[];
  prompt: string;
  estimatedPromptTokens: number;
  hasImageAttachment: boolean;
}): ModelRouteExplanation {
  const { settings, models } = input;
  const taskType = inferTaskType({
    prompt: input.prompt,
    estimatedPromptTokens: input.estimatedPromptTokens,
    hasImageAttachment: input.hasImageAttachment,
    productMode: settings.productMode,
    agentMode: settings.agentMode,
  });

  const auto = settings.defaultModel === 'router-studio/auto' || settings.defaultModel.startsWith('router-studio/auto:');
  const picked = auto ? cheapestInCategory(models, taskType) ?? cheapestInCategory(models, 'chat') : null;
  const primaryModel = picked?.id ?? settings.defaultModel;
  const readModel = settings.smartAgentRouting
    ? settings.agentReadModel.trim() || primaryModel
    : primaryModel;
  const reasoningModel = settings.smartAgentRouting
    ? settings.agentReasoningModel.trim() || cheapestInCategory(models, 'reasoning')?.id || primaryModel
    : primaryModel;

  const primaryPrice = priceForModel(models, primaryModel);
  const reasoningPrice = priceForModel(models, reasoningModel) ?? primaryPrice;
  const blendedPricePerM =
    primaryPrice == null && reasoningPrice == null
      ? null
      : ((primaryPrice ?? 0) + (reasoningPrice ?? primaryPrice ?? 0)) / 2;
  const estimatedCostUsd =
    blendedPricePerM == null
      ? null
      : (Math.max(1, input.estimatedPromptTokens) / 1_000_000) * blendedPricePerM;
  const budget = settings.agentCostCeilingUsd ?? 0;

  const reasons = [
    `Task type: ${taskType}`,
    auto ? 'Default model is Router Studio Auto, so the router picked from the catalog.' : 'Using explicit default model.',
    settings.smartAgentRouting
      ? 'Smart routing separates read and reasoning hops.'
      : 'Smart routing is off; one model handles the turn.',
  ];
  if (settings.modelQualityMemoryEnabled) {
    reasons.push('Local model quality memory is enabled for future scoring.');
  }
  if (budget > 0 && estimatedCostUsd != null) {
    reasons.push(`Per-task ceiling: $${budget.toFixed(2)}`);
  }

  return {
    taskType,
    primaryModel,
    readModel,
    reasoningModel,
    estimatedCostUsd,
    budgetOk: !(budget > 0 && estimatedCostUsd != null && estimatedCostUsd > budget),
    reasons,
  };
}
