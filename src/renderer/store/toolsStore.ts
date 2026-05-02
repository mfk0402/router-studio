import { create } from 'zustand';
import type {
  ToolDefinition,
  ToolApprovalRequest,
  ToolApprovalResponse,
  ToolExecutionEvent,
  ToolPolicy,
} from '../../shared/types';

interface ToolsState {
  /** All available tool definitions */
  toolDefinitions: ToolDefinition[];
  /** Loading state */
  loading: boolean;
  /** Pending tool approval request (only one at a time) */
  pendingApproval: ToolApprovalRequest | null;
  /** Tool execution events for the current chat (keyed by toolCallId) */
  executions: Map<string, ToolExecutionEvent>;

  /** Load tool definitions from main process */
  loadDefinitions: () => Promise<void>;
  /** Set pending approval */
  setPendingApproval: (req: ToolApprovalRequest | null) => void;
  /** Respond to an approval request */
  respondApproval: (response: ToolApprovalResponse) => Promise<void>;
  /** Update execution state */
  updateExecution: (evt: ToolExecutionEvent) => void;
  /** Clear executions (when starting new chat) */
  clearExecutions: () => void;
  /** Get policy for a tool */
  getToolPolicy: (toolName: string) => Promise<ToolPolicy>;
  /** Set policy for a tool */
  setToolPolicy: (toolName: string, policy: ToolPolicy) => Promise<void>;
}

export const useTools = create<ToolsState>((set, get) => ({
  toolDefinitions: [],
  loading: false,
  pendingApproval: null,
  executions: new Map(),

  loadDefinitions: async () => {
    if (!window.api) return;
    set({ loading: true });
    try {
      const defs = await window.api.tools.listDefinitions();
      set({ toolDefinitions: defs });
    } catch (e) {
      console.error('[tools] loadDefinitions failed:', e);
    } finally {
      set({ loading: false });
    }
  },

  setPendingApproval: (req) => {
    set({ pendingApproval: req });
  },

  respondApproval: async (response) => {
    if (!window.api) return;
    try {
      await window.api.respondToolApproval(response);
    } catch (e) {
      console.error('[tools] respondApproval failed:', e);
    } finally {
      set({ pendingApproval: null });
    }
  },

  updateExecution: (evt) => {
    set((state) => {
      const newMap = new Map(state.executions);
      newMap.set(evt.toolCallId, evt);
      return { executions: newMap };
    });
  },

  clearExecutions: () => {
    set({ executions: new Map() });
  },

  getToolPolicy: async (toolName) => {
    if (!window.api) return 'ask';
    try {
      return await window.api.tools.getPolicy(toolName);
    } catch {
      return 'ask';
    }
  },

  setToolPolicy: async (toolName, policy) => {
    if (!window.api) return;
    try {
      await window.api.tools.setPolicy(toolName, policy);
    } catch (e) {
      console.error('[tools] setToolPolicy failed:', e);
    }
  },
}));

/**
 * Setup event listeners for tool approval and execution events.
 * Call this once on app init.
 */
export function setupToolEventListeners(): () => void {
  if (!window.api) return () => {};

  const unsubApproval = window.api.events.onToolApproval((req) => {
    useTools.getState().setPendingApproval(req);
  });

  const unsubExecution = window.api.events.onToolExecution((evt) => {
    useTools.getState().updateExecution(evt);
  });

  return () => {
    unsubApproval();
    unsubExecution();
  };
}
