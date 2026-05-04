/**
 * Phase 12.1 — Built-in model profiles (apply default + agent routing fields).
 * IDs are stored on AppSettings.activeModelProfile; `custom` means manual picks.
 */
import type { AppSettings } from './types.js';

export type BuiltinModelProfileId =
  | 'custom'
  | 'balanced'
  | 'cheap_smart_split'
  | 'free_only'
  | 'coding_focus'
  | 'reasoning_focus'
  | 'big_context';

export interface ModelProfilePreset {
  id: Exclude<BuiltinModelProfileId, 'custom'>;
  label: string;
  summary: string;
  apply: Pick<AppSettings, 'defaultModel' | 'agentReadModel' | 'agentReasoningModel' | 'smartAgentRouting'>;
}

/** Presets use stable OpenRouter ids; adjust in Settings if a model id changes. */
export const BUILTIN_MODEL_PROFILES: ModelProfilePreset[] = [
  {
    id: 'balanced',
    label: 'Balanced',
    summary: 'OpenRouter auto picks a capable default per request.',
    apply: {
      defaultModel: 'openrouter/auto',
      agentReadModel: '',
      agentReasoningModel: '',
      smartAgentRouting: false,
    },
  },
  {
    id: 'cheap_smart_split',
    label: 'Cheap reads → strong synthesis',
    summary: 'Flash-class read hop, Claude-class reasoning after tools (edit ids to taste).',
    apply: {
      defaultModel: 'openrouter/auto',
      agentReadModel: 'google/gemini-flash-1.5',
      agentReasoningModel: 'anthropic/claude-3.5-sonnet',
      smartAgentRouting: true,
    },
  },
  {
    id: 'free_only',
    label: 'Free only',
    summary: 'Uses OpenRouter free routing; pair with global Free Mode for cycling.',
    apply: {
      defaultModel: 'openrouter/free',
      agentReadModel: '',
      agentReasoningModel: '',
      smartAgentRouting: false,
    },
  },
  {
    id: 'coding_focus',
    label: 'Coding specialist',
    summary: 'Coder-weighted default; single model for tool loops.',
    apply: {
      defaultModel: 'qwen/qwen-2.5-coder-32b-instruct',
      agentReadModel: '',
      agentReasoningModel: '',
      smartAgentRouting: false,
    },
  },
  {
    id: 'reasoning_focus',
    label: 'Reasoning specialist',
    summary: 'Strong reasoning default for debug / design tasks.',
    apply: {
      defaultModel: 'deepseek/deepseek-r1',
      agentReadModel: '',
      agentReasoningModel: '',
      smartAgentRouting: false,
    },
  },
  {
    id: 'big_context',
    label: 'Large context',
    summary: 'Gemini 1.5 Pro scale context when available on your key.',
    apply: {
      defaultModel: 'google/gemini-pro-1.5',
      agentReadModel: '',
      agentReasoningModel: '',
      smartAgentRouting: false,
    },
  },
];

export function getModelProfilePreset(
  id: string,
): ModelProfilePreset | undefined {
  return BUILTIN_MODEL_PROFILES.find((p) => p.id === id);
}
