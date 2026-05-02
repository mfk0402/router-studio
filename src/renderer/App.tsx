import { useEffect, useCallback, useRef, useState } from 'react';
import Sidebar from './components/Sidebar';
import EditorTabs from './components/EditorTabs';
import MonacoEditorPane from './components/MonacoEditorPane';
import AiPanel from './components/AiPanel';
import BottomPanel from './components/BottomPanel';
import SettingsModal from './components/SettingsModal';
import ModelPicker from './components/ModelPicker';
import DiffPreview from './components/DiffPreview';
import MultiDiffPreview from './components/MultiDiffPreview';
import QuickOpen from './components/QuickOpen';
import RulesModal from './components/RulesModal';
import TasksModal from './components/TasksModal';
import ToolApprovalModal from './components/ToolApprovalModal';
import CommandPalette from './components/CommandPalette';
import MenuBar from './components/MenuBar';
import ToastContainer from './components/ToastContainer';
import { CrashRecoveryModal } from './components/CrashRecoveryModal';
import { FindReplaceDialog } from './components/FindReplaceDialog';
import WelcomeTour from './components/WelcomeTour';
import RoadmapModal from './components/RoadmapModal';
import StatsModal from './components/StatsModal';
import BenchmarkModal from './components/BenchmarkModal';
import WelcomePane from './components/WelcomePane';
import { toast } from './components/ToastContainer';
import { useApp } from './store/appStore';
import { useSettings } from './store/settingsStore';
import { useRules } from './store/rulesStore';
import { useTasks } from './store/tasksStore';
import { useTools, setupToolEventListeners } from './store/toolsStore';
import { loadCachedModels, fetchModels } from './lib/openrouterClient';
import { useResolvedTheme } from './hooks/useResolvedTheme';
import logoIcon from './assets/logo-icon.png';

const SESSION_SAVE_INTERVAL = 30000; // 30 seconds
const AUTOSAVE_DEBOUNCE = 2000; // 2 seconds after last edit

export default function App() {
  // Hard guard: if the preload didn't load, window.api is undefined and every
  // button in the app silently fails. Show a visible banner instead.
  if (typeof window.api === 'undefined') {
    return <PreloadFailure />;
  }
  return <AppInner />;
}

function PreloadFailure() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-bg p-8 text-center">
      <div className="max-w-md space-y-3">
        <div className="text-lg font-semibold text-danger">
          Preload script failed to load
        </div>
        <p className="text-sm text-fg-muted">
          The Electron preload bridge (<code>window.api</code>) is missing, so IPC calls
          to the main process cannot work. This usually means the preload file was not
          built or was placed at a path the main process couldn't resolve.
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-left text-xs text-fg-muted">
          <li>Quit the app.</li>
          <li>
            Run <code>npm run build</code> then <code>npm run dev</code> (or
            re-run <code>npm install</code> and <code>npm run dev</code>).
          </li>
          <li>
            If it still fails, open the DevTools console (View → Toggle Developer
            Tools) to see the exact preload error.
          </li>
        </ol>
      </div>
    </div>
  );
}

function AppInner() {
  useResolvedTheme();
  const loadSettings = useSettings((s) => s.load);
  const loadedSettings = useSettings((s) => s.loaded);
  const settings = useSettings((s) => s.settings);

  const setModels = useApp((s) => s.setModels);
  const setModelsLoading = useApp((s) => s.setModelsLoading);
  const setShowSettings = useApp((s) => s.setShowSettings);
  const setShowModelPicker = useApp((s) => s.setShowModelPicker);
  const setShowQuickOpen = useApp((s) => s.setShowQuickOpen);
  const toggleSidebar = useApp((s) => s.toggleSidebar);
  const setAiPanelFocused = useApp((s) => s.setAiPanelFocused);
  const pushLog = useApp((s) => s.pushLog);
  const pendingDiff = useApp((s) => s.pendingDiff);
  const pendingMultiDiff = useApp((s) => s.pendingMultiDiff);
  const sidebarCollapsed = useApp((s) => s.sidebarCollapsed);
  const tabs = useApp((s) => s.tabs);
  const activeTabPath = useApp((s) => s.activeTabPath);
  const markTabSaved = useApp((s) => s.markTabSaved);
  const projectRoot = useApp((s) => s.projectRoot);
  const refreshRules = useRules((s) => s.refresh);
  const refreshTasks = useTasks((s) => s.refresh);
  const loadToolDefinitions = useTools((s) => s.loadDefinitions);

  // Session management
  const checkCrash = useApp((s) => s.checkCrash);
  const setCrashFlag = useApp((s) => s.setCrashFlag);
  const clearCrashFlag = useApp((s) => s.clearCrashFlag);
  const loadSession = useApp((s) => s.loadSession);
  const saveSession = useApp((s) => s.saveSession);
  const crashDetected = useApp((s) => s.crashDetected);
  const autosaveFile = useApp((s) => s.autosaveFile);
  const autosaveEnabled = useApp((s) => s.autosaveEnabled);

  const welcomeTourNonce = useApp((s) => s.welcomeTourNonce);
  const [showWelcomeTour, setShowWelcomeTour] = useState(false);
  const zenMode = useSettings((s) => s.settings.zenMode);
  const editorSplit = useSettings((s) => s.settings.editorSplit);

  const autosaveTimerRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const sessionInitializedRef = useRef(false);

  // Initialize session on mount
  useEffect(() => {
    if (sessionInitializedRef.current) return;
    sessionInitializedRef.current = true;

    (async () => {
      // Check for crash
      const crashed = await checkCrash();
      if (!crashed) {
        // No crash, just load session normally
        await loadSession();
      }
      // Set crash flag for next time
      await setCrashFlag();
    })();

    // Clear crash flag on clean exit
    const handleBeforeUnload = () => {
      clearCrashFlag();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [checkCrash, loadSession, setCrashFlag, clearCrashFlag]);

  // Periodic session save
  useEffect(() => {
    const interval = setInterval(() => {
      saveSession();
    }, SESSION_SAVE_INTERVAL);
    return () => clearInterval(interval);
  }, [saveSession]);

  // Autosave dirty tabs
  useEffect(() => {
    if (!autosaveEnabled) return;

    const dirtyTabs = tabs.filter((t) => t.dirty);
    for (const tab of dirtyTabs) {
      // Clear existing timer for this file
      const existing = autosaveTimerRef.current.get(tab.relativePath);
      if (existing) clearTimeout(existing);

      // Set new debounced timer
      const timer = setTimeout(() => {
        autosaveFile(tab.relativePath, tab.content);
        autosaveTimerRef.current.delete(tab.relativePath);
      }, AUTOSAVE_DEBOUNCE);

      autosaveTimerRef.current.set(tab.relativePath, timer);
    }

    return () => {
      // Clear all timers on cleanup
      for (const timer of autosaveTimerRef.current.values()) {
        clearTimeout(timer);
      }
    };
  }, [tabs, autosaveEnabled, autosaveFile]);

  useEffect(() => {
    void loadSettings();
    void refreshRules();
    void refreshTasks();
    void loadToolDefinitions();
    const cleanup = setupToolEventListeners();
    return cleanup;
  }, [loadSettings, refreshRules, refreshTasks, loadToolDefinitions]);

  useEffect(() => {
    const unsub = window.api.events.onUpdates((ev) => {
      switch (ev.kind) {
        case 'available':
          toast.success(`Update v${ev.version} available`, 'Downloading…');
          void window.api.updates.download().then((r) => {
            if (!r.ok && r.message) toast.error(`Update download failed: ${r.message}`);
          });
          break;
        case 'not-available':
          toast.info('You are on the latest version.');
          break;
        case 'error':
          toast.error(ev.message);
          break;
        case 'downloaded':
          if (
            window.confirm(`Update v${ev.version} is ready. Restart now to install?`)
          ) {
            void window.api.updates.quitAndInstall();
          }
          break;
        default:
          break;
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const offWebhook = window.api.events.onWebhook((p) => {
      const preview = p.body.length > 160 ? `${p.body.slice(0, 160)}…` : p.body;
      toast.info('Webhook POST /hook', preview || '(empty body)');
    });
    const offSched = window.api.events.onScheduledDue((p) => {
      const pre = p.prompt.length > 120 ? `${p.prompt.slice(0, 120)}…` : p.prompt;
      toast.info(`Scheduled: ${p.title}`, pre);
    });
    return () => {
      offWebhook();
      offSched();
    };
  }, []);

  // Re-scan rules whenever the project root changes (including on initial load).
  useEffect(() => {
    void refreshRules();
  }, [projectRoot, refreshRules]);

  useEffect(() => {
    if (!loadedSettings) return;
    (async () => {
      const cached = await loadCachedModels();
      if (cached && cached.length > 0) {
        setModels(cached);
        pushLog('info', `Loaded ${cached.length} models from cache.`);
      }
      if (settings.apiKey) {
        setModelsLoading(true);
        try {
          const fresh = await fetchModels(settings.apiKey);
          setModels(fresh);
          pushLog('info', `Fetched ${fresh.length} models from OpenRouter.`);
        } catch (e) {
          pushLog('warn', `Model fetch failed: ${(e as Error).message}`);
        } finally {
          setModelsLoading(false);
        }
      } else if (!cached) {
        pushLog('info', 'Add an OpenRouter API key in Settings to load models.');
      }
    })();
  }, [loadedSettings, settings.apiKey, setModels, setModelsLoading, pushLog]);

  useEffect(() => {
    if (!loadedSettings) return;
    if (!settings.hasCompletedProductTour) {
      setShowWelcomeTour(true);
    }
  }, [loadedSettings, settings.hasCompletedProductTour]);

  useEffect(() => {
    if (welcomeTourNonce === 0) return;
    setShowWelcomeTour(true);
  }, [welcomeTourNonce]);

  useEffect(() => {
    if (!zenMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        void useSettings.getState().update({ zenMode: false });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zenMode]);

  const handleSaveActiveTab = useCallback(async () => {
    const state = useApp.getState();
    const tab = state.tabs.find((t) => t.relativePath === state.activeTabPath);
    if (!tab) return;
    try {
      await window.api.fs.writeFile(tab.relativePath, tab.content);
      markTabSaved(tab.relativePath);
      // Remove autosave since file is now saved
      await window.api.autosave.delete(tab.relativePath);
      pushLog('info', `Saved ${tab.relativePath}`);
    } catch (e) {
      pushLog('error', `Save failed: ${(e as Error).message}`);
    }
  }, [markTabSaved, pushLog]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();

      if (key === 's' && !e.shiftKey) {
        e.preventDefault();
        void handleSaveActiveTab();
      } else if (key === 'p' && !e.shiftKey) {
        e.preventDefault();
        setShowQuickOpen(true);
      } else if (key === 'a' && e.shiftKey) {
        e.preventDefault();
        setAiPanelFocused(true);
      } else if (key === 'm' && e.shiftKey) {
        e.preventDefault();
        setShowModelPicker(true);
      } else if (key === 'b' && !e.shiftKey) {
        e.preventDefault();
        toggleSidebar();
      } else if (key === ',' && !e.shiftKey) {
        e.preventDefault();
        setShowSettings(true);
      } else if (key === 'r' && e.shiftKey) {
        e.preventDefault();
        useApp.getState().setShowRules(true);
      } else if (key === 't' && e.shiftKey) {
        e.preventDefault();
        useApp.getState().setShowTasks(true);
      } else if (key === 'p' && e.shiftKey) {
        e.preventDefault();
        useApp.getState().setShowCommandPalette(true);
      } else if (key === '`' && !e.shiftKey) {
        e.preventDefault();
        const state = useApp.getState();
        state.setBottomCollapsed(false);
        state.setBottomTab('terminal');
      } else if (key === 'h' && e.shiftKey) {
        e.preventDefault();
        useApp.getState().setShowFindReplace(true);
      } else if (key === 'o' && !e.shiftKey) {
        e.preventDefault();
        void useApp.getState().pickAndOpenProjectFolder();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    handleSaveActiveTab,
    setShowQuickOpen,
    setAiPanelFocused,
    setShowModelPicker,
    toggleSidebar,
    setShowSettings,
  ]);

  return (
    <div
      className={
        'flex h-full w-full flex-col bg-bg text-fg' + (zenMode ? ' zen-mode' : '')
      }
    >
      {!zenMode && <MenuBar />}
      {!zenMode && <TopBar />}
      <div className="flex min-h-0 flex-1">
        {!zenMode && !sidebarCollapsed && (
          <div className="w-64 shrink-0 border-r border-border-soft bg-bg-soft">
            <Sidebar />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          {!zenMode && <EditorTabs />}
          <div
            className={
              'min-h-0 flex-1' + (editorSplit && tabs.length > 0 ? ' flex flex-row' : '')
            }
          >
            {tabs.length === 0 ? (
              <WelcomePane />
            ) : editorSplit ? (
              <>
                <div className="min-h-0 min-w-0 flex-1 border-r border-border-soft">
                  <MonacoEditorPane />
                </div>
                <div className="min-h-0 min-w-0 flex-1">
                  <MonacoEditorPane />
                </div>
              </>
            ) : (
              <MonacoEditorPane />
            )}
          </div>
          {!zenMode && <BottomPanel />}
        </div>
        {!zenMode && (
          <div className="w-[420px] shrink-0 border-l border-border-soft bg-bg-soft">
            <AiPanel />
          </div>
        )}
      </div>

      <RoadmapModal />
      <StatsModal />
      <BenchmarkModal />
      <SettingsModal />
      <ModelPicker />
      <QuickOpen />
      <RulesModal />
      <TasksModal />
      <ToolApprovalModal />
      <CommandPalette />
      <FindReplaceDialog />
      <ToastContainer />
      {crashDetected && <CrashRecoveryModal />}
      {pendingDiff && <DiffPreview />}
      {pendingMultiDiff && pendingMultiDiff.length > 0 && <MultiDiffPreview />}
      {showWelcomeTour && <WelcomeTour onDone={() => setShowWelcomeTour(false)} />}
    </div>
  );
}

function TopBar() {
  const projectRoot = useApp((s) => s.projectRoot);
  const pickAndOpenProjectFolder = useApp((s) => s.pickAndOpenProjectFolder);
  const setShowSettings = useApp((s) => s.setShowSettings);
  const setShowModelPicker = useApp((s) => s.setShowModelPicker);
  const toggleSidebar = useApp((s) => s.toggleSidebar);

  const openFolder = () => {
    void pickAndOpenProjectFolder();
  };

  return (
    <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-border-soft bg-bg-elevated px-3 shadow-chrome">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          type="button"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors duration-layout hover:bg-bg-hover hover:text-fg"
          onClick={toggleSidebar}
          title="Toggle sidebar (Ctrl/Cmd+B)"
          aria-label="Toggle sidebar"
        >
          <span className="text-sm leading-none" aria-hidden>
            ☰
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-2 border-r border-border-soft pr-3">
          <span className="brand-mark-icon-wrap">
            <img src={logoIcon} alt="" className="h-6 w-6 select-none" draggable={false} />
          </span>
          <span className="brand-wordmark whitespace-nowrap tracking-tight">Router Studio</span>
        </div>
        <div className="min-w-0 flex-1 pl-1">
          <span
            className="block truncate font-mono text-[11px] leading-snug text-fg-subtle"
            title={projectRoot || undefined}
          >
            {projectRoot ? projectRoot : 'No folder open'}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          className="rounded-md border border-border-soft bg-bg-soft px-2.5 py-1.5 text-xs font-medium text-fg-muted shadow-sm transition-colors duration-layout hover:border-border hover:bg-bg-hover hover:text-fg"
          onClick={openFolder}
          title="Open Folder (Ctrl+O)"
        >
          Open Folder
        </button>
        <button
          type="button"
          className="rounded-md border border-border-soft bg-bg-soft px-2.5 py-1.5 text-xs font-medium text-fg-muted shadow-sm transition-colors duration-layout hover:border-border hover:bg-bg-hover hover:text-fg"
          onClick={() => setShowModelPicker(true)}
          title="Choose model (Ctrl/Cmd+M)"
        >
          Models
        </button>
        <button
          type="button"
          className="rounded-md border border-border-soft bg-bg-soft px-2.5 py-1.5 text-xs font-medium text-fg-muted shadow-sm transition-colors duration-layout hover:border-border hover:bg-bg-hover hover:text-fg"
          onClick={() => setShowSettings(true)}
          title="Settings (Ctrl+,)"
        >
          Settings
        </button>
      </div>
    </div>
  );
}
