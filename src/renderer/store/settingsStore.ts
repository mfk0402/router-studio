import { create } from 'zustand';
import type { AppSettings } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/types';

/**
 * Merge server-side settings back into store, but only overwrite the keys the
 * caller actually tried to update. This prevents a stale response from one
 * rapid update overwriting a newer edit to a different field.
 */
function pickKnownFields(
  next: AppSettings,
  partial: Partial<AppSettings>,
): Partial<AppSettings> {
  const out: Partial<AppSettings> = {};
  for (const k of Object.keys(partial) as (keyof AppSettings)[]) {
    (out as Record<string, unknown>)[k] = next[k];
  }
  return out;
}

interface SettingsState {
  settings: AppSettings;
  loaded: boolean;
  load: () => Promise<void>;
  /** Apply to UI only (no IPC). Use while dragging splitters; call `update` once on release to persist. */
  patchLocal: (partial: Partial<AppSettings>) => void;
  update: (partial: Partial<AppSettings>) => Promise<void>;
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  patchLocal: (partial) => {
    set((state) => ({ settings: { ...state.settings, ...partial } }));
  },
  load: async () => {
    try {
      const s = await window.api.settings.get();
      set({ settings: s, loaded: true });
    } catch {
      set({ settings: DEFAULT_SETTINGS, loaded: true });
    }
  },
  update: async (partial) => {
    const current = get().settings;
    // Optimistic update
    set({ settings: { ...current, ...partial } });
    if (!window.api || !window.api.settings) {
      console.error(
        '[settings] window.api is unavailable. Preload script failed to load.',
      );
      return;
    }
    try {
      const next = await window.api.settings.set(partial);
      // Only overwrite fields we just touched; leave any in-flight edits of
      // other fields alone to avoid clobbering fast successive updates.
      set((state) => ({
        settings: { ...state.settings, ...pickKnownFields(next, partial) },
      }));
    } catch (e) {
      console.error('[settings] update failed:', e);
      set({ settings: current });
    }
  },
}));
