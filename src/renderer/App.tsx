import { useEffect, useCallback, useRef, useState } from 'react';
import Sidebar from './components/Sidebar';
import EditorTabs from './components/EditorTabs';
import MonacoEditorPane from './components/MonacoEditorPane';
import AiPanel from './components/AiPanel';
import BottomPanel from './components/BottomPanel';
import { PanelResizeHandle } from './components/PanelResizeHandle';
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
import AccountModal from './components/AccountModal';
import WelcomePane from './components/WelcomePane';
import { ErrorBoundary } from './components/ErrorBoundary';
import { toast } from './components/ToastContainer';
import { useApp } from './store/appStore';
import { useSettings } from './store/settingsStore';
import { useRules } from './store/rulesStore';
import { useTasks } from './store/tasksStore';
import { useAccountSession } from './store/accountSessionStore';
import { useTools, setupToolEventListeners } from './store/toolsStore';
import { loadCachedModels, fetchModels } from './lib/openrouterClient';
import { getCompletionRouting, canRefreshModelCatalog } from './lib/completionRouting';
import { consumeUserInitiatedUpdateCheck } from './lib/updateCheckFlow';
import { PRODUCT_MODE_SEQUENCE } from '../shared/productMode';
import { useResolvedTheme } from './hooks/useResolvedTheme';
import { useSplashDismiss } from './hooks/useSplashDismiss';
import logoIcon from './assets/logo-icon.png';

const SESSION_SAVE_INTERVAL = 30000; // 30 seconds
const AUTOSAVE_DEBOUNCE = 2000; // 2 seconds after last edit

export default function App() {
  useSplashDismiss();
  // Hard guard: if the preload didn't load, window.api is undefined and every
  // button in the app silently fails. Show a visible banner instead.
  if (typeof window.api === 'undefined') {
    return <PreloadFailure />;
  }
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
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
  const sidebarWidthPx = useSettings((s) => s.settings.sidebarWidthPx);
  const aiPanelWidthPx = useSettings((s) => s.settings.aiPanelWidthPx);

  const autosaveTimerRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const sessionInitializedRef = useRef(false);
  const autoUpdateCheckStartedRef = useRef(false);
  const treeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleFileTreeRefresh = useCallback(() => {
    if (treeRefreshTimerRef.current) clearTimeout(treeRefreshTimerRef.current);
    treeRefreshTimerRef.current = setTimeout(() => {
      treeRefreshTimerRef.current = null;
      void useApp.getState().refreshFileTreeFromDisk();
    }, 320);
  }, []);

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

  useEffect(() => {
    return () => {
      if (treeRefreshTimerRef.current) clearTimeout(treeRefreshTimerRef.current);
    };
  }, []);

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

    const dirtyPaths = new Set(tabs.filter((t) => t.dirty).map((t) => t.relativePath));
    for (const [pathKey, timer] of [...autosaveTimerRef.current.entries()]) {
      if (!dirtyPaths.has(pathKey)) {
        clearTimeout(timer);
        autosaveTimerRef.current.delete(pathKey);
      }
    }

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

  const refreshAccountSession = useAccountSession((s) => s.refresh);

  useEffect(() => {
    void loadSettings();
    void refreshRules();
    void refreshTasks();
    void loadToolDefinitions();
    void refreshAccountSession();
    const cleanup = setupToolEventListeners();
    return cleanup;
  }, [loadSettings, refreshRules, refreshTasks, loadToolDefinitions, refreshAccountSession]);

  useEffect(() => {
    const off = window.api.events.onToolInjectionWarning((evt) => {
      toast.warning(
        'Untrusted tool output',
        `${evt.toolName}: ${evt.patterns.join(', ')} — treat as data only.`,
        { duration: 8000 },
      );
    });
    return () => off();
  }, []);

  useEffect(() => {
    const unsub = window.api.events.onAgentFileSynced((payload) => {
      const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\/+/, '');
      const state = useApp.getState();

      if (payload.renamedFrom) {
        const fromNorm = norm(payload.renamedFrom);
        const tabFrom = state.tabs.find((t) => norm(t.relativePath) === fromNorm);
        if (tabFrom !== undefined && payload.content !== undefined) {
          state.retargetOpenTabAfterRename(
            tabFrom.relativePath,
            payload.relativePath,
            payload.content,
          );
        }
        state.remapPendingDiffPathsAfterRename(payload.renamedFrom, payload.relativePath);
        scheduleFileTreeRefresh();
        return;
      }

      const target = norm(payload.relativePath);
      const tab = state.tabs.find((t) => norm(t.relativePath) === target);
      if (tab !== undefined && payload.removed) {
        state.closeTab(tab.relativePath);
      } else if (tab !== undefined && payload.content !== undefined && !payload.removed) {
        state.syncOpenTabFromAgentWrite(tab.relativePath, payload.content);
      }

      scheduleFileTreeRefresh();
    });
    return unsub;
  }, [scheduleFileTreeRefresh]);

  useEffect(() => {
    const unsub = window.api.events.onProjectFsChanged(() => {
      scheduleFileTreeRefresh();
    });
    return unsub;
  }, [scheduleFileTreeRefresh]);

  useEffect(() => {
    const unsub = window.api.events.onUpdates((ev) => {
      switch (ev.kind) {
        case 'checking':
          break;
        case 'available': {
          consumeUserInitiatedUpdateCheck();
          const raw = ev.releaseNotes?.trim();
          const message =
            raw && raw.length > 0
              ? raw.length > 200
                ? `${raw.slice(0, 200)}…`
                : raw
              : 'A newer build is available from your update feed.';
          toast.success(`Update v${ev.version} available`, message, {
            duration: 0,
            action: {
              label: 'Update now',
              onClick: () => {
                void window.api.updates.download().then((r) => {
                  if (!r.ok && r.message) {
                    toast.error('Download failed', r.message);
                    return;
                  }
                  toast.info(
                    'Downloading update…',
                    'You can keep working. We will notify you when it is ready to install.',
                  );
                });
              },
            },
          });
          break;
        }
        case 'not-available':
          if (consumeUserInitiatedUpdateCheck()) {
            toast.info('You are on the latest version.');
          }
          break;
        case 'error': {
          const userAsked = consumeUserInitiatedUpdateCheck();
          if (userAsked) {
            toast.error('Update check failed', ev.message);
          } else {
            toast.warning('Could not check for updates', ev.message, { duration: 8000 });
          }
          break;
        }
        case 'download-progress':
          break;
        case 'downloaded':
          toast.success(
            `Update v${ev.version} ready to install`,
            'Restart Router Studio to finish updating.',
            {
              duration: 0,
              action: {
                label: 'Restart now',
                onClick: () => void window.api.updates.quitAndInstall(),
              },
            },
          );
          break;
        default:
          break;
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!loadedSettings || !settings.autoUpdateEnabled) return;
    if (autoUpdateCheckStartedRef.current) return;
    autoUpdateCheckStartedRef.current = true;
    void window.api.updates.check();
  }, [loadedSettings, settings.autoUpdateEnabled]);

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
      const routing = getCompletionRouting(settings);
      const catalogSource = routing.openAiBaseUrl ? 'local' : 'openrouter';
      const cached = await loadCachedModels(catalogSource, routing.openAiBaseUrl);
      if (cached && cached.length > 0) {
        setModels(cached);
        pushLog('info', `Loaded ${cached.length} models from cache.`);
      }
      const shouldFetchCatalog = canRefreshModelCatalog(settings);
      if (shouldFetchCatalog) {
        setModelsLoading(true);
        try {
          const fresh = await fetchModels(settings.apiKey ?? '', routing.openAiBaseUrl);
          setModels(fresh);
          pushLog(
            'info',
            catalogSource === 'local'
              ? `Fetched ${fresh.length} models from local server.`
              : `Fetched ${fresh.length} models from OpenRouter.`,
          );
        } catch (e) {
          pushLog('warn', `Model fetch failed: ${(e as Error).message}`);
        } finally {
          setModelsLoading(false);
        }
      } else if (!cached) {
        pushLog(
          'info',
          catalogSource === 'local'
            ? 'Set a local completion base URL in Settings → Models to load models.'
            : 'Unable to load model catalog.',
        );
      }
    })();
  }, [
    loadedSettings,
    settings.apiKey,
    settings.aiCompletionProvider,
    settings.localOpenAiBaseUrl,
    setModels,
    setModelsLoading,
    pushLog,
  ]);

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
        return;
      }
      // Avoid Ctrl+Shift+Z (editor redo). Alt+Shift+Z exits zen only.
      if (
        e.altKey &&
        e.shiftKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        e.key.toLowerCase() === 'z'
      ) {
        e.preventDefault();
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
      } else if (e.shiftKey && e.code.startsWith('Digit')) {
        const n = Number(e.code.replace('Digit', ''));
        if (n >= 1 && n <= 6) {
          e.preventDefault();
          const mode = PRODUCT_MODE_SEQUENCE[n - 1];
          void useSettings
            .getState()
            .update({ productMode: mode })
            .then(() => loadToolDefinitions(mode));
          toast.info('Product mode', mode);
        }
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
    loadToolDefinitions,
  ]);

  return (
    <div
      className={
        'flex h-full w-full flex-col bg-bg text-fg' + (zenMode ? ' zen-mode' : '')
      }
    >
      {zenMode ? (
        <>
          <ZenModeExitBar />
          <div className="flex min-h-0 flex-1 flex-col bg-bg-soft">
            <AiPanel />
          </div>
        </>
      ) : (
        <>
          {/* Keep chrome above fixed AiPanel overlays (Composer, Browser). Modals use z-[110]+ */}
          <div className="relative z-[100] flex shrink-0 flex-col">
            <MenuBar />
            <TopBar />
          </div>
          <div className="flex min-h-0 flex-1">
            {!sidebarCollapsed && (
              <>
                <div
                  className="workspace-panel shrink-0 overflow-hidden border-r border-border-soft"
                  style={{ width: sidebarWidthPx }}
                >
                  <Sidebar />
                </div>
                <PanelResizeHandle
                  orientation="col"
                  onDrag={(dx) => {
                    const cur = useSettings.getState().settings.sidebarWidthPx;
                    void useSettings.getState().update({
                      sidebarWidthPx: Math.min(520, Math.max(180, cur + dx)),
                    });
                  }}
                />
              </>
            )}
            <div className="flex min-w-0 flex-1 flex-col">
              <EditorTabs />
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
              <BottomPanel />
            </div>
            <PanelResizeHandle
              orientation="col"
              onDrag={(dx) => {
                const cur = useSettings.getState().settings.aiPanelWidthPx;
                void useSettings.getState().update({
                  aiPanelWidthPx: Math.min(900, Math.max(280, cur - dx)),
                });
              }}
            />
            <div
              className="workspace-panel min-h-0 min-w-0 shrink-0 overflow-x-auto overflow-y-hidden border-l border-border-soft"
              style={{ width: aiPanelWidthPx }}
            >
              <AiPanel />
            </div>
          </div>
        </>
      )}

      <RoadmapModal />
      <StatsModal />
      <BenchmarkModal />
      <AccountModal />
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

function ZenModeExitBar() {
  const exitZen = useCallback(() => {
    void useSettings.getState().update({ zenMode: false });
  }, []);
  const setShowSettings = useApp((s) => s.setShowSettings);
  const setShowModelPicker = useApp((s) => s.setShowModelPicker);
  const requestVideoGenModal = useApp((s) => s.requestVideoGenModal);

  return (
    <div
      className="chrome-menubar relative z-[100] flex min-h-9 shrink-0 flex-wrap items-center justify-center gap-2 border-b border-border-soft px-2 py-1.5 ds-transition"
      role="region"
      aria-label="Fullscreen AI chat controls"
    >
      <button
        type="button"
        className="rounded-md px-3 py-1.5 text-sm font-medium text-fg ring-1 ring-border-soft transition-colors hover:bg-bg-hover"
        onClick={exitZen}
      >
        Exit fullscreen AI chat
      </button>
      <button
        type="button"
        className="rounded-md border border-accent/50 bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent hover:bg-accent/25"
        onClick={() => requestVideoGenModal()}
        title="Generate video (OpenRouter)"
      >
        Video
      </button>
      <button
        type="button"
        className="rounded-md border border-border-soft bg-bg-soft px-2.5 py-1 text-xs font-medium text-fg-muted shadow-sm hover:bg-bg-hover hover:text-fg"
        onClick={() => setShowModelPicker(true)}
        title="Choose model (Ctrl/Cmd+Shift+M)"
      >
        Models
      </button>
      <button
        type="button"
        className="rounded-md border border-border-soft bg-bg-soft px-2.5 py-1 text-xs font-medium text-fg-muted shadow-sm hover:bg-bg-hover hover:text-fg"
        onClick={() => setShowSettings(true)}
        title="Settings (Ctrl+,)"
      >
        Settings
      </button>
      <span className="hidden text-xs text-fg-muted sm:inline">
        <kbd className="rounded border border-border-soft bg-bg-soft px-1 font-sans">Esc</kbd>
        <span className="mx-1 opacity-70">·</span>
        <kbd className="rounded border border-border-soft bg-bg-soft px-1 font-sans">
          Alt+Shift+Z
        </kbd>
      </span>
    </div>
  );
}

function TopBar() {
  const projectRoot = useApp((s) => s.projectRoot);
  const pickAndOpenProjectFolder = useApp((s) => s.pickAndOpenProjectFolder);
  const setShowSettings = useApp((s) => s.setShowSettings);
  const setShowModelPicker = useApp((s) => s.setShowModelPicker);
  const setShowAccountModal = useApp((s) => s.setShowAccountModal);
  const toggleSidebar = useApp((s) => s.toggleSidebar);
  const accountEmail = useAccountSession((s) => s.email);
  const resolvedTheme = useResolvedTheme();
  const updateSettings = useSettings((s) => s.update);

  const toggleAppearance = () => {
    void updateSettings({ theme: resolvedTheme === 'light' ? 'dark' : 'light' });
  };

  const openFolder = () => {
    void pickAndOpenProjectFolder();
  };

  return (
    <div className="chrome-menubar relative flex h-10 shrink-0 items-center justify-between gap-3 px-3 ds-transition">
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
          onClick={() => setShowAccountModal(true)}
          title="Router Studio account — sign in to sync encrypted settings"
        >
          {accountEmail ? (
            <span className="max-w-[9rem] truncate font-mono text-[10px]" title={accountEmail}>
              {accountEmail}
            </span>
          ) : (
            'Account'
          )}
        </button>
        <button
          type="button"
          className="rounded-md border border-border-soft bg-bg-soft px-2 py-1.5 text-sm leading-none text-fg-muted shadow-sm transition-colors duration-layout hover:border-border hover:bg-bg-hover hover:text-fg"
          onClick={toggleAppearance}
          title={
            resolvedTheme === 'light'
              ? 'Switch to dark theme (also in Settings → Appearance)'
              : 'Switch to light theme (also in Settings → Appearance)'
          }
          aria-label={resolvedTheme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
        >
          {resolvedTheme === 'light' ? '🌙' : '☀️'}
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
