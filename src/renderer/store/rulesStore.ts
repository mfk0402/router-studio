import { create } from 'zustand';
import type { Rule } from '../../shared/types';

interface RulesState {
  rules: Rule[];
  loading: boolean;
  refresh: () => Promise<void>;
  setEnabled: (id: string, enabled: boolean) => Promise<void>;
  saveUserRule: (rule: Omit<Rule, 'source'>) => Promise<void>;
  deleteUserRule: (id: string) => Promise<void>;
}

export const useRules = create<RulesState>((set) => ({
  rules: [],
  loading: false,
  refresh: async () => {
    set({ loading: true });
    try {
      const rules = await window.api.rules.scan();
      set({ rules });
    } catch (e) {
      console.error('[rules.refresh]', e);
    } finally {
      set({ loading: false });
    }
  },
  setEnabled: async (id, enabled) => {
    set((s) => ({
      rules: s.rules.map((r) => (r.id === id ? { ...r, enabled } : r)),
    }));
    try {
      await window.api.rules.setEnabledState(id, enabled);
    } catch (e) {
      console.error('[rules.setEnabled]', e);
    }
  },
  saveUserRule: async (rule) => {
    try {
      const saved = await window.api.rules.saveUserRule(rule);
      set((s) => {
        const idx = s.rules.findIndex((r) => r.id === saved.id);
        if (idx >= 0) {
          const copy = s.rules.slice();
          copy[idx] = saved;
          return { rules: copy };
        }
        return { rules: [...s.rules, saved] };
      });
    } catch (e) {
      console.error('[rules.saveUserRule]', e);
    }
  },
  deleteUserRule: async (id) => {
    try {
      await window.api.rules.deleteUserRule(id);
      set((s) => ({ rules: s.rules.filter((r) => r.id !== id) }));
    } catch (e) {
      console.error('[rules.deleteUserRule]', e);
    }
  },
}));

/** Concatenate enabled rules into a system-prompt-ready block. */
export function buildRulesPrompt(rules: Rule[]): string {
  const enabled = rules.filter((r) => r.enabled && r.content.trim().length > 0);
  if (enabled.length === 0) return '';
  const blocks = enabled.map((r) => {
    const tag = r.source === 'project' ? 'project rule' : 'user rule';
    return `--- BEGIN ${tag}: ${r.name} ---\n${r.content.trim()}\n--- END ${tag} ---`;
  });
  return [
    'The following rules apply to this project and/or user. Follow them strictly.',
    ...blocks,
  ].join('\n\n');
}
