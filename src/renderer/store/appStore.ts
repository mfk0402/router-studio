import { create } from 'zustand';
import type {
  Attachment,
  AutosaveEntry,
  FileEntry,
  NormalizedModel,
  SessionState,
  TabState,
} from '../../shared/types';
import { redactSecrets } from '../../shared/redactSecrets';
import { extToLanguage } from '../lib/fileUtils';
import { useSettings } from './settingsStore';

const MAX_RECENT_PROJECTS = 15;

function touchRecentList(list: string[], absolutePath: string): string[] {
  const next = [absolutePath, ...list.filter((p) => p !== absolutePath)];
  return next.slice(0, MAX_RECENT_PROJECTS);
}

export interface OpenTab {
  relativePath: string;
  name: string;
  language: string;
  content: string;
  original: string;
  dirty: boolean;
}

export interface ToolCallLiveRow {
  id: string;
  name: string;
  argsSnippet: string;
  status: 'running' | 'success' | 'error';
  resultSnippet?: string;
}

export interface ChatMsg {
  id: string;
  role: 'user' | 'assistant' | 'system';
  /** Full text sent to the model (may include tree, files, etc.). */
  content: string;
  /** Short markdown shown in the thread for user messages; omit to show `content`. */
  displayContent?: string;
  modelUsed?: string;
  streaming?: boolean;
  error?: string;
  /** OpenRouter image generation responses (data URLs). */
  generatedImageUrls?: string[];
  /** OpenRouter async video API (`/api/v1/videos`) result URLs. */
  generatedVideoUrls?: string[];
  /** While polling `GET` on the job, drives progress UI in the thread (not persisted). */
  videoRenderProgress?: {
    jobId: string;
    apiStatus: string;
    pollIndex: number;
    startedAt: number;
  };
  /** In-memory blob URL for TTS preview (`blob:…`); revoked when chat clears. */
  generatedAudioObjectUrl?: string;
  /** Suggested filename for TTS download (e.g. router-studio-tts-….mp3). */
  ttsAudioFileName?: string;
  /** Ephemeral rows for in-flight agent tools (never persisted). */
  toolCallLive?: ToolCallLiveRow[];
  createdAt: number;
}

export interface LogEntry {
  id: string;
  level: 'info' | 'warn' | 'error';
  text: string;
  at: number;
}

interface AppState {
  // project
  projectRoot: string | null;
  fileTree: FileEntry | null;
  /** Absolute paths, MRU (persisted in session). */
  recentProjectRoots: string[];
  projectLoading: boolean;
  projectLoadingLabel: string | null;
  setProjectRoot: (root: string | null) => void;
  setFileTree: (tree: FileEntry | null) => void;
  setProjectLoading: (loading: boolean, label?: string | null) => void;
  touchRecentProject: (absolutePath: string) => void;
  removeRecentProject: (absolutePath: string) => void;
  openProjectFromPath: (absolutePath: string) => Promise<boolean>;
  pickAndOpenProjectFolder: () => Promise<boolean>;

  // tabs / editor
  tabs: OpenTab[];
  activeTabPath: string | null;
  openTab: (tab: OpenTab) => void;
  closeTab: (path: string) => void;
  setActiveTab: (path: string | null) => void;
  updateTabContent: (path: string, content: string) => void;
  /** When the agent writes/edits a file on disk, sync any open tab so the editor matches disk (clean state). */
  syncOpenTabFromAgentWrite: (path: string, content: string) => void;
  /** When the agent renamed a file on disk, retarget the open tab from old path to new path. */
  retargetOpenTabAfterRename: (fromPath: string, toPath: string, content: string) => void;
  markTabSaved: (path: string) => void;

  /** Reload sidebar file tree from disk (after agent filesystem tools). */
  refreshFileTreeFromDisk: () => Promise<void>;

  // editor selection
  selectedCode: string;
  setSelectedCode: (code: string) => void;

  // editor instance reference (for outline panel, etc.)
  editorInstance: unknown | null;
  setEditorInstance: (editor: unknown | null) => void;

  /**
   * One-shot navigation: Monaco applies revealLineInCenter + cursor when the tab matches.
   */
  editorRevealRequest: { relativePath: string; lineNumber: number; column?: number } | null;
  requestEditorReveal: (req: { relativePath: string; lineNumber: number; column?: number }) => void;
  clearEditorRevealRequest: () => void;

  // AI context attachments (images, urls, files, snippets)
  attachments: Attachment[];
  addAttachment: (a: Attachment) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;

  // chat
  chat: ChatMsg[];
  addChatMessage: (msg: ChatMsg) => void;
  updateChatMessage: (id: string, patch: Partial<ChatMsg>) => void;
  clearChat: () => void;
  editMessageAndBranch: (messageId: string, newContent: string) => void;
  deleteMessagesFrom: (messageId: string) => void;
  replaceChat: (messages: ChatMsg[]) => void;

  // conversation branches (forking)
  conversationBranches: Array<{ id: string; name: string; messages: ChatMsg[]; createdAt: number }>;
  currentBranchId: string | null;
  forkConversation: (fromMessageId: string) => string; // returns new branch id
  switchToBranch: (branchId: string) => void;
  deleteBranch: (branchId: string) => void;
  renameBranch: (branchId: string, name: string) => void;

  // models
  models: NormalizedModel[];
  modelsLoading: boolean;
  setModels: (m: NormalizedModel[]) => void;
  setModelsLoading: (v: boolean) => void;

  // free mode
  freeModeEnabled: boolean;
  toggleFreeMode: () => void;
  setFreeMode: (on: boolean) => void;

  // logs
  logs: LogEntry[];
  pushLog: (level: LogEntry['level'], text: string) => void;
  clearLogs: () => void;

  // ui
  showSettings: boolean;
  setShowSettings: (v: boolean) => void;
  showModelPicker: boolean;
  setShowModelPicker: (v: boolean) => void;
  showQuickOpen: boolean;
  setShowQuickOpen: (v: boolean) => void;
  showRules: boolean;
  setShowRules: (v: boolean) => void;
  showTasks: boolean;
  setShowTasks: (v: boolean) => void;
  showCommandPalette: boolean;
  setShowCommandPalette: (v: boolean) => void;
  showFindReplace: boolean;
  setShowFindReplace: (v: boolean) => void;
  showRoadmap: boolean;
  setShowRoadmap: (v: boolean) => void;
  showUsageStats: boolean;
  setShowUsageStats: (v: boolean) => void;
  showBenchmark: boolean;
  setShowBenchmark: (v: boolean) => void;
  showAccountModal: boolean;
  setShowAccountModal: (v: boolean) => void;

  showComposerPanel: boolean;
  setShowComposerPanel: (v: boolean) => void;
  showBrowserPanel: boolean;
  setShowBrowserPanel: (v: boolean) => void;

  /** Incremented to open the OpenRouter video generation modal from anywhere (e.g. Zen mode bar). */
  videoGenModalKick: number;
  requestVideoGenModal: () => void;

  /** Increment to re-open the welcome tour (Help menu). */
  welcomeTourNonce: number;
  triggerWelcomeTour: () => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  aiPanelFocused: boolean;
  setAiPanelFocused: (v: boolean) => void;
  bottomTab: 'output' | 'terminal' | 'problems' | 'tests';
  setBottomTab: (t: 'output' | 'terminal' | 'problems' | 'tests') => void;
  bottomCollapsed: boolean;
  setBottomCollapsed: (v: boolean) => void;
  terminalSessionId: string | null;
  setTerminalSessionId: (id: string | null) => void;
  pendingTerminalCommand: string | null;
  requestRunTerminalCommand: (cmd: string) => void;
  clearPendingTerminalCommand: () => void;

  // diff
  pendingDiff: {
    relativePath: string;
    original: string;
    modified: string;
    source: 'patch' | 'replace' | 'new';
  } | null;
  setPendingDiff: (d: AppState['pendingDiff']) => void;

  // multi-file diff
  pendingMultiDiff: Array<{
    relativePath: string;
    original: string;
    modified: string;
    source: 'patch' | 'replace' | 'new';
  }> | null;
  setPendingMultiDiff: (d: AppState['pendingMultiDiff']) => void;
  addToPendingMultiDiff: (d: AppState['pendingDiff']) => void;
  remapPendingDiffPathsAfterRename: (fromPath: string, toPath: string) => void;

  // streaming request id (for cancel)
  currentRequestId: string | null;
  setCurrentRequestId: (id: string | null) => void;

  // session management
  sessionLoading: boolean;
  lastSessionSave: number;
  loadSession: () => Promise<void>;
  saveSession: () => Promise<void>;
  clearSession: () => Promise<void>;

  // autosave
  autosaveEnabled: boolean;
  setAutosaveEnabled: (v: boolean) => void;
  autosaveFile: (relativePath: string, content: string) => Promise<void>;
  loadAutosaves: () => Promise<AutosaveEntry[]>;
  clearAutosaves: () => Promise<void>;

  // crash recovery
  crashDetected: boolean;
  setCrashDetected: (v: boolean) => void;
  checkCrash: () => Promise<boolean>;
  setCrashFlag: () => Promise<void>;
  clearCrashFlag: () => Promise<void>;

  // set multiple tabs at once (for session restore)
  setTabs: (tabs: OpenTab[]) => void;
  setSidebarCollapsed: (v: boolean) => void;
  /** Reorder open tabs (e.g. drag-and-drop). */
  reorderTabs: (fromIndex: number, toIndex: number) => void;
}

export const useApp = create<AppState>((set, get) => ({
  projectRoot: null,
  fileTree: null,
  recentProjectRoots: [],
  projectLoading: false,
  projectLoadingLabel: null,
  setProjectRoot: (root) => set({ projectRoot: root }),
  setFileTree: (tree) => set({ fileTree: tree }),
  setProjectLoading: (projectLoading, projectLoadingLabel = null) =>
    set({ projectLoading, projectLoadingLabel: projectLoading ? projectLoadingLabel : null }),
  refreshFileTreeFromDisk: async () => {
    const root = get().projectRoot;
    if (!root) return;
    try {
      set({ projectLoading: true, projectLoadingLabel: 'Refreshing files...' });
      const tree = await window.api.fs.listFiles();
      set({ fileTree: tree });
    } catch (e) {
      get().pushLog('warn', `File tree refresh failed: ${(e as Error).message}`);
    } finally {
      set({ projectLoading: false, projectLoadingLabel: null });
    }
  },

  touchRecentProject: (absolutePath) =>
    set((s) => ({ recentProjectRoots: touchRecentList(s.recentProjectRoots, absolutePath) })),
  removeRecentProject: (absolutePath) =>
    set((s) => ({
      recentProjectRoots: s.recentProjectRoots.filter((p) => p !== absolutePath),
    })),
  pickAndOpenProjectFolder: async () => {
    const pushLog = get().pushLog;
    try {
      set({ projectLoading: true, projectLoadingLabel: 'Choosing folder...' });
      const root = await window.api.fs.openFolder();
      if (!root) {
        pushLog('info', 'Open Folder canceled.');
        return false;
      }
      return await get().openProjectFromPath(root);
    } catch (e) {
      pushLog('error', `Open Folder failed: ${(e as Error).message}`);
      return false;
    } finally {
      set({ projectLoading: false, projectLoadingLabel: null });
    }
  },
  openProjectFromPath: async (absolutePath: string) => {
    const pushLog = get().pushLog;
    try {
      set({ projectLoading: true, projectLoadingLabel: 'Opening folder...' });
      const ok = await window.api.fs.setRoot(absolutePath);
      if (!ok) {
        pushLog('error', `Could not open project folder:\n${absolutePath}`);
        get().removeRecentProject(absolutePath);
        void get().saveSession();
        return false;
      }
      set({ projectLoadingLabel: 'Loading files...' });
      const tree = await window.api.fs.listFiles();
      set((s) => ({
        projectRoot: absolutePath,
        fileTree: tree,
        recentProjectRoots: touchRecentList(s.recentProjectRoots, absolutePath),
      }));
      void get().saveSession();
      pushLog('info', `Opened folder: ${absolutePath}`);
      return true;
    } catch (e) {
      pushLog('error', `Open failed: ${(e as Error).message}`);
      return false;
    } finally {
      set({ projectLoading: false, projectLoadingLabel: null });
    }
  },

  tabs: [],
  activeTabPath: null,
  openTab: (tab) =>
    set((s) => {
      const existing = s.tabs.find((t) => t.relativePath === tab.relativePath);
      if (existing) return { activeTabPath: existing.relativePath };
      return { tabs: [...s.tabs, tab], activeTabPath: tab.relativePath };
    }),
  closeTab: (path) =>
    set((s) => {
      const tabs = s.tabs.filter((t) => t.relativePath !== path);
      let active = s.activeTabPath;
      if (active === path) {
        active = tabs.length > 0 ? tabs[tabs.length - 1].relativePath : null;
      }
      return { tabs, activeTabPath: active };
    }),
  setActiveTab: (path) => set({ activeTabPath: path }),
  updateTabContent: (path, content) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.relativePath === path ? { ...t, content, dirty: content !== t.original } : t,
      ),
    })),
  syncOpenTabFromAgentWrite: (path, content) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.relativePath === path ? { ...t, content, original: content, dirty: false } : t,
      ),
    })),
  retargetOpenTabAfterRename: (fromPath, toPath, content) =>
    set((s) => {
      const name = toPath.split(/[/\\]/).pop() ?? toPath;
      const language = extToLanguage(toPath);
      const tabs = s.tabs.map((t) =>
        t.relativePath === fromPath
          ? { ...t, relativePath: toPath, name, language, content, original: content, dirty: false }
          : t,
      );
      let active = s.activeTabPath;
      if (active === fromPath) active = toPath;
      return { tabs, activeTabPath: active };
    }),
  markTabSaved: (path) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.relativePath === path ? { ...t, original: t.content, dirty: false } : t,
      ),
    })),

  selectedCode: '',
  setSelectedCode: (code) => set({ selectedCode: code }),

  editorInstance: null,
  setEditorInstance: (editor) => set({ editorInstance: editor }),

  editorRevealRequest: null,
  requestEditorReveal: (req) => set({ editorRevealRequest: req }),
  clearEditorRevealRequest: () => set({ editorRevealRequest: null }),

  attachments: [],
  addAttachment: (a) => set((s) => ({ attachments: [...s.attachments, a] })),
  removeAttachment: (id) =>
    set((s) => ({ attachments: s.attachments.filter((a) => a.id !== id) })),
  clearAttachments: () => set({ attachments: [] }),

  chat: [],
  addChatMessage: (msg) => set((s) => ({ chat: [...s.chat, msg] })),
  updateChatMessage: (id, patch) =>
    set((s) => ({ chat: s.chat.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
  clearChat: () =>
    set((s) => {
      for (const m of s.chat) {
        const u = m.generatedAudioObjectUrl;
        if (u?.startsWith('blob:')) URL.revokeObjectURL(u);
      }
      return { chat: [] };
    }),
  editMessageAndBranch: (messageId, newContent) =>
    set((s) => {
      const idx = s.chat.findIndex((m) => m.id === messageId);
      if (idx === -1) return s;
      // Keep messages up to and including the edited one, update content
      const newChat = s.chat.slice(0, idx + 1).map((m, i) =>
        i === idx
          ? {
              ...m,
              content: newContent,
              displayContent: newContent,
              createdAt: Date.now(),
            }
          : m,
      );
      return { chat: newChat };
    }),
  deleteMessagesFrom: (messageId) =>
    set((s) => {
      const idx = s.chat.findIndex((m) => m.id === messageId);
      if (idx === -1) return s;
      return { chat: s.chat.slice(0, idx) };
    }),
  replaceChat: (messages) => set({ chat: messages }),

  // Conversation branches
  conversationBranches: [],
  currentBranchId: null,
  forkConversation: (fromMessageId) => {
    const state = useApp.getState();
    const idx = state.chat.findIndex((m: ChatMsg) => m.id === fromMessageId);
    if (idx === -1) return '';

    // Create new branch with messages up to and including the fork point
    const branchMessages = state.chat.slice(0, idx + 1);
    const branchId = `branch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const branchNum = state.conversationBranches.length + 1;

    // Save current chat as a branch if not already saved
    let branches = [...state.conversationBranches];
    if (state.currentBranchId === null && state.chat.length > 0) {
      // Save the main conversation as the first branch
      branches.unshift({
        id: 'main',
        name: 'Main',
        messages: [...state.chat],
        createdAt: Date.now(),
      });
    }

    // Add the new forked branch
    branches.push({
      id: branchId,
      name: `Branch ${branchNum}`,
      messages: branchMessages,
      createdAt: Date.now(),
    });

    set({
      conversationBranches: branches,
      currentBranchId: branchId,
      chat: branchMessages,
    });

    return branchId;
  },
  switchToBranch: (branchId) => {
    const state = useApp.getState();
    type BranchType = { id: string; name: string; messages: ChatMsg[]; createdAt: number };
    const branch = state.conversationBranches.find((b: BranchType) => b.id === branchId);
    if (!branch) return;

    // Save current chat to current branch before switching
    if (state.currentBranchId) {
      const updatedBranches = state.conversationBranches.map((b: BranchType) =>
        b.id === state.currentBranchId ? { ...b, messages: [...state.chat] } : b
      );
      set({
        conversationBranches: updatedBranches,
        currentBranchId: branchId,
        chat: [...branch.messages],
      });
    } else {
      set({
        currentBranchId: branchId,
        chat: [...branch.messages],
      });
    }
  },
  deleteBranch: (branchId) => {
    const state = useApp.getState();
    if (branchId === 'main') return; // Don't delete main branch

    type BranchType = { id: string; name: string; messages: ChatMsg[]; createdAt: number };
    const newBranches = state.conversationBranches.filter((b: BranchType) => b.id !== branchId);
    
    // If we deleted the current branch, switch to main or first available
    if (state.currentBranchId === branchId) {
      const nextBranch = newBranches.find((b: BranchType) => b.id === 'main') || newBranches[0];
      set({
        conversationBranches: newBranches,
        currentBranchId: nextBranch?.id || null,
        chat: nextBranch?.messages || [],
      });
    } else {
      set({ conversationBranches: newBranches });
    }
  },
  renameBranch: (branchId, name) =>
    set((s) => ({
      conversationBranches: s.conversationBranches.map((b: { id: string; name: string; messages: ChatMsg[]; createdAt: number }) =>
        b.id === branchId ? { ...b, name } : b
      ),
    })),

  models: [],
  modelsLoading: false,
  setModels: (m) => set({ models: m }),
  setModelsLoading: (v) => set({ modelsLoading: v }),

  freeModeEnabled: false,
  toggleFreeMode: () => set((s) => ({ freeModeEnabled: !s.freeModeEnabled })),
  setFreeMode: (on) => set({ freeModeEnabled: on }),

  logs: [],
  pushLog: (level, text) =>
    set((s) => ({
      logs: [
        ...s.logs.slice(-499),
        {
          id: Math.random().toString(36).slice(2),
          level,
          text: redactSecrets(text),
          at: Date.now(),
        },
      ],
    })),
  clearLogs: () => set({ logs: [] }),

  showSettings: false,
  setShowSettings: (v) => set({ showSettings: v }),
  showModelPicker: false,
  setShowModelPicker: (v) => set({ showModelPicker: v }),
  showQuickOpen: false,
  setShowQuickOpen: (v) => set({ showQuickOpen: v }),
  showRules: false,
  setShowRules: (v) => set({ showRules: v }),
  showTasks: false,
  setShowTasks: (v) => set({ showTasks: v }),
  showCommandPalette: false,
  setShowCommandPalette: (v) => set({ showCommandPalette: v }),
  showFindReplace: false,
  setShowFindReplace: (v) => set({ showFindReplace: v }),
  showRoadmap: false,
  setShowRoadmap: (v) => set({ showRoadmap: v }),
  showUsageStats: false,
  setShowUsageStats: (v) => set({ showUsageStats: v }),
  showBenchmark: false,
  setShowBenchmark: (v) => set({ showBenchmark: v }),
  showAccountModal: false,
  setShowAccountModal: (v) => set({ showAccountModal: v }),

  showComposerPanel: false,
  setShowComposerPanel: (v) => set({ showComposerPanel: v }),
  showBrowserPanel: false,
  setShowBrowserPanel: (v) => set({ showBrowserPanel: v }),

  videoGenModalKick: 0,
  requestVideoGenModal: () => set((s) => ({ videoGenModalKick: s.videoGenModalKick + 1 })),

  welcomeTourNonce: 0,
  triggerWelcomeTour: () => {
    void useSettings.getState().update({ hasCompletedProductTour: false });
    set((s) => ({ welcomeTourNonce: s.welcomeTourNonce + 1 }));
  },
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  aiPanelFocused: false,
  setAiPanelFocused: (v) => set({ aiPanelFocused: v }),
  bottomTab: 'output',
  setBottomTab: (t) => set({ bottomTab: t }),
  bottomCollapsed: false,
  setBottomCollapsed: (v) => set({ bottomCollapsed: v }),
  terminalSessionId: null,
  setTerminalSessionId: (id) => set({ terminalSessionId: id }),
  pendingTerminalCommand: null,
  requestRunTerminalCommand: (cmd) =>
    set({ pendingTerminalCommand: cmd, bottomTab: 'terminal', bottomCollapsed: false }),
  clearPendingTerminalCommand: () => set({ pendingTerminalCommand: null }),

  pendingDiff: null,
  setPendingDiff: (d) => set({ pendingDiff: d }),

  pendingMultiDiff: null,
  setPendingMultiDiff: (d) => set({ pendingMultiDiff: d }),
  addToPendingMultiDiff: (d) =>
    set((s) => {
      if (!d) return s;
      const existing = s.pendingMultiDiff || [];
      // Update if same file already exists, otherwise add
      const idx = existing.findIndex((x) => x.relativePath === d.relativePath);
      if (idx >= 0) {
        const updated = [...existing];
        updated[idx] = d;
        return { pendingMultiDiff: updated };
      }
      return { pendingMultiDiff: [...existing, d] };
    }),

  remapPendingDiffPathsAfterRename: (fromPath, toPath) =>
    set((s) => {
      const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\/+/, '');
      const nf = norm(fromPath);
      let pendingDiff = s.pendingDiff;
      if (pendingDiff && norm(pendingDiff.relativePath) === nf) {
        pendingDiff = { ...pendingDiff, relativePath: toPath };
      }
      let pendingMultiDiff = s.pendingMultiDiff;
      if (pendingMultiDiff?.length) {
        pendingMultiDiff = pendingMultiDiff.map((d) =>
          norm(d.relativePath) === nf ? { ...d, relativePath: toPath } : d,
        );
      }
      return { pendingDiff, pendingMultiDiff };
    }),

  currentRequestId: null,
  setCurrentRequestId: (id) => set({ currentRequestId: id }),

  // session management
  sessionLoading: false,
  lastSessionSave: 0,

  loadSession: async () => {
    try {
      set({ sessionLoading: true });
      const session = await window.api.session.load();
      const initialRecents = session.recentProjectRoots ?? [];

      if (session.projectRoot) {
        const ok = await window.api.fs.setRoot(session.projectRoot);
        if (ok) {
          const tree = await window.api.fs.listFiles();
          set((s) => ({
            recentProjectRoots: touchRecentList(initialRecents, session.projectRoot!),
            projectRoot: session.projectRoot,
            fileTree: tree,
          }));
        } else {
          get().pushLog(
            'warn',
            `Previous project folder is unavailable (moved or deleted):\n${session.projectRoot}`,
          );
          set({
            recentProjectRoots: initialRecents.filter((p) => p !== session.projectRoot),
            projectRoot: null,
            fileTree: null,
          });
        }
      } else {
        set({ recentProjectRoots: initialRecents });
      }

      // Restore tabs
      if (session.tabs.length > 0) {
        const restoredTabs: OpenTab[] = session.tabs.map((t: TabState) => ({
          relativePath: t.relativePath,
          name: t.name,
          language: t.language,
          content: t.content,
          original: t.original,
          dirty: t.dirty,
        }));
        set({
          tabs: restoredTabs,
          activeTabPath: session.activeTabPath,
        });
      }

      // Restore UI state
      set({
        sidebarCollapsed: session.sidebarCollapsed,
        bottomCollapsed: session.bottomCollapsed,
        bottomTab: session.bottomTab,
      });

      // Restore chat (only keep last 50 from saved)
      if (session.chat && session.chat.length > 0) {
        const restoredChat: ChatMsg[] = session.chat.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          displayContent: 'displayContent' in m ? (m as ChatMsg).displayContent : undefined,
          modelUsed: 'modelUsed' in m ? (m as ChatMsg).modelUsed : undefined,
          generatedImageUrls: 'generatedImageUrls' in m ? (m as ChatMsg).generatedImageUrls : undefined,
          generatedVideoUrls: 'generatedVideoUrls' in m ? (m as ChatMsg).generatedVideoUrls : undefined,
          error: 'error' in m ? (m as ChatMsg).error : undefined,
          createdAt: Date.now(),
        }));
        set({ chat: restoredChat });
      }
    } catch (e) {
      console.error('[session] Failed to load session:', e);
    } finally {
      set({ sessionLoading: false });
    }
  },

  saveSession: async () => {
    const state = useApp.getState();
    try {
      const tabStates: TabState[] = state.tabs.map((t) => ({
        relativePath: t.relativePath,
        name: t.name,
        language: t.language,
        content: t.content,
        original: t.original,
        dirty: t.dirty,
      }));

      const chatToSave = state.chat.slice(-50).map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        ...(m.displayContent !== undefined ? { displayContent: m.displayContent } : {}),
        ...(m.modelUsed !== undefined ? { modelUsed: m.modelUsed } : {}),
        ...(m.generatedImageUrls?.length ? { generatedImageUrls: m.generatedImageUrls } : {}),
        ...(m.generatedVideoUrls?.length ? { generatedVideoUrls: m.generatedVideoUrls } : {}),
        ...(m.error !== undefined ? { error: m.error } : {}),
      }));

      await window.api.session.save({
        projectRoot: state.projectRoot,
        recentProjectRoots: state.recentProjectRoots,
        tabs: tabStates,
        activeTabPath: state.activeTabPath,
        sidebarCollapsed: state.sidebarCollapsed,
        bottomCollapsed: state.bottomCollapsed,
        bottomTab: state.bottomTab,
        chat: chatToSave,
      });

      set({ lastSessionSave: Date.now() });
    } catch (e) {
      console.error('[session] Failed to save session:', e);
    }
  },

  clearSession: async () => {
    try {
      await window.api.session.clear();
    } catch (e) {
      console.error('[session] Failed to clear session:', e);
    }
  },

  // autosave
  autosaveEnabled: true,
  setAutosaveEnabled: (v) => set({ autosaveEnabled: v }),

  autosaveFile: async (relativePath: string, content: string) => {
    try {
      await window.api.autosave.save(relativePath, content);
    } catch (e) {
      console.error('[autosave] Failed to save:', relativePath, e);
    }
  },

  loadAutosaves: async (): Promise<AutosaveEntry[]> => {
    try {
      return await window.api.autosave.list();
    } catch (e) {
      console.error('[autosave] Failed to list:', e);
      return [];
    }
  },

  clearAutosaves: async () => {
    try {
      await window.api.autosave.clear();
    } catch (e) {
      console.error('[autosave] Failed to clear:', e);
    }
  },

  // crash recovery
  crashDetected: false,
  setCrashDetected: (v) => set({ crashDetected: v }),

  checkCrash: async (): Promise<boolean> => {
    try {
      const crashed = await window.api.crash.check();
      set({ crashDetected: crashed });
      return crashed;
    } catch (e) {
      console.error('[crash] Failed to check:', e);
      return false;
    }
  },

  setCrashFlag: async () => {
    try {
      await window.api.crash.setCrashFlag();
    } catch (e) {
      console.error('[crash] Failed to set flag:', e);
    }
  },

  clearCrashFlag: async () => {
    try {
      await window.api.crash.clearCrashFlag();
    } catch (e) {
      console.error('[crash] Failed to clear flag:', e);
    }
  },

  // helpers for session restore
  setTabs: (tabs) => set({ tabs }),
  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
  reorderTabs: (fromIndex, toIndex) =>
    set((s) => {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return s;
      if (fromIndex >= s.tabs.length || toIndex >= s.tabs.length) return s;
      const next = [...s.tabs];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved!);
      return { tabs: next };
    }),
}));
