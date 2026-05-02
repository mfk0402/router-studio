import { create } from 'zustand';
import type { AgentTask } from '../../shared/types';

interface TasksState {
  tasks: AgentTask[];
  /** Task that is currently being run/authored in the AI panel (not persisted here). */
  activeTaskId: string | null;
  loading: boolean;

  refresh: () => Promise<void>;
  save: (task: AgentTask) => Promise<AgentTask | null>;
  remove: (id: string) => Promise<void>;
  load: (id: string) => Promise<AgentTask | null>;
  setActive: (id: string | null) => void;
}

export const useTasks = create<TasksState>((set, get) => ({
  tasks: [],
  activeTaskId: null,
  loading: false,

  refresh: async () => {
    if (!window.api) return;
    set({ loading: true });
    try {
      const list = await window.api.tasks.list();
      set({ tasks: list });
    } catch (e) {
      console.error('[tasks] refresh failed', e);
    } finally {
      set({ loading: false });
    }
  },

  save: async (task) => {
    if (!window.api) return null;
    try {
      const saved = await window.api.tasks.save(task);
      // Update cache in-place so the Tasks modal reflects changes instantly.
      const tasks = get().tasks.slice();
      const idx = tasks.findIndex((t) => t.id === saved.id);
      if (idx >= 0) tasks[idx] = saved;
      else tasks.unshift(saved);
      set({ tasks });
      return saved;
    } catch (e) {
      console.error('[tasks] save failed', e);
      return null;
    }
  },

  remove: async (id) => {
    if (!window.api) return;
    try {
      await window.api.tasks.delete(id);
      set({
        tasks: get().tasks.filter((t) => t.id !== id),
        activeTaskId: get().activeTaskId === id ? null : get().activeTaskId,
      });
    } catch (e) {
      console.error('[tasks] delete failed', e);
    }
  },

  load: async (id) => {
    if (!window.api) return null;
    try {
      return await window.api.tasks.get(id);
    } catch (e) {
      console.error('[tasks] get failed', e);
      return null;
    }
  },

  setActive: (id) => set({ activeTaskId: id }),
}));
