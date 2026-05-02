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
import { toast } from './components/ToastContainer';
import { useApp } from './store/appStore';
import { useSettings } from './store/settingsStore';
import { useRules } from './store/rulesStore';
import { useTasks } from './store/tasksStore';
import { useTools, setupToolEventListeners } from './store/toolsStore';
import { loadCachedModels, fetchModels } from './lib/openrouterClient';
import { useResolvedTheme } from './hooks/useResolvedTheme';
import logoFull from './assets/logo-full.png';
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
    <div className="flex h-full w-full flex-col bg-bg text-fg">
      <MenuBar />
      <TopBar />
      <div className="flex min-h-0 flex-1">
        {!sidebarCollapsed && (
          <div className="w-64 shrink-0 border-r border-border-soft bg-bg-soft">
            <Sidebar />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <EditorTabs />
          <div className="min-h-0 flex-1">
            {tabs.length === 0 ? <WelcomePane /> : <MonacoEditorPane key={activeTabPath ?? '_'} />}
          </div>
          <BottomPanel />
        </div>
        <div className="w-[420px] shrink-0 border-l border-border-soft bg-bg-soft">
          <AiPanel />
        </div>
      </div>

      <RoadmapModal />
      <StatsModal />
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
  const setProjectRoot = useApp((s) => s.setProjectRoot);
  const setFileTree = useApp((s) => s.setFileTree);
  const setShowSettings = useApp((s) => s.setShowSettings);
  const setShowModelPicker = useApp((s) => s.setShowModelPicker);
  const pushLog = useApp((s) => s.pushLog);
  const toggleSidebar = useApp((s) => s.toggleSidebar);

  const openFolder = async () => {
    pushLog('info', 'Open Folder requested…');
    try {
      const root = await window.api.fs.openFolder();
      if (!root) {
        pushLog('info', 'Open Folder canceled.');
        return;
      }
      setProjectRoot(root);
      const tree = await window.api.fs.listFiles();
      setFileTree(tree);
      pushLog('info', `Opened folder: ${root}`);
    } catch (e) {
      console.error('[openFolder]', e);
      pushLog('error', `Open Folder failed: ${(e as Error).message}`);
    }
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

function WelcomePane() {
  const setShowSettings = useApp((s) => s.setShowSettings);
  const setProjectRoot = useApp((s) => s.setProjectRoot);
  const setFileTree = useApp((s) => s.setFileTree);
  const pushLog = useApp((s) => s.pushLog);

  const openFolder = async () => {
    pushLog('info', 'Open Folder requested…');
    try {
      const root = await window.api.fs.openFolder();
      if (!root) {
        pushLog('info', 'Open Folder canceled.');
        return;
      }
      setProjectRoot(root);
      const tree = await window.api.fs.listFiles();
      setFileTree(tree);
      pushLog('info', `Opened folder: ${root}`);
    } catch (e) {
      console.error('[openFolder]', e);
      pushLog('error', `Open Folder failed: ${(e as Error).message}`);
    }
  };

  const features = [
    { icon: '💻', title: 'Any AI Model', desc: 'Access Claude, GPT, Gemini, Llama, and 100+ models via OpenRouter' },
    { icon: '🎨', title: 'Multi-Modal', desc: 'Vision, image generation, video, audio — all in one workspace' },
    { icon: '🛠️', title: 'Agent Tools', desc: 'File editing, shell commands, git, search, diagnostics, and more' },
    { icon: '📝', title: 'Monaco Editor', desc: 'VS Code-quality editing with 60+ languages, formatting, IntelliSense' },
    { icon: '🔒', title: 'Local & Private', desc: 'Your code stays on your machine. No telemetry, no cloud storage' },
    { icon: '🆓', title: 'Free Mode', desc: 'Route through free models when you want zero-cost AI assistance' },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col items-center overflow-y-auto welcome-hero px-6 pb-16 pt-10 sm:px-10">
      <div className="w-full max-w-4xl">
        <div className="mb-10 flex flex-col items-center text-center">
          <h1 className="sr-only">Router Studio</h1>
          <div className="brand-logo-plate mb-5">
            <img
              src={logoFull}
              alt="Router Studio"
              className="h-auto w-[min(100%,20rem)] max-w-full select-none"
              draggable={false}
            />
          </div>
          <p className="max-w-lg text-balance text-base font-medium leading-relaxed text-fg-muted sm:text-lg">
            One workspace for every AI model — edit, ship, and delegate work across models without switching tools.
          </p>
        </div>

        <div className="mb-3 flex items-end justify-between gap-4 px-0.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">Capabilities</h2>
          <span className="hidden text-[11px] text-fg-subtle sm:inline">Keyboard-first · see Help → Shortcuts</span>
        </div>

        <div className="mb-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="group flex gap-3 rounded-xl border border-border-soft bg-bg-elevated p-4 shadow-card transition-all duration-layout hover:border-accent/35 hover:shadow-card-hover"
            >
              <span className="select-none text-xl leading-none text-accent/90 transition-transform duration-layout group-hover:scale-105">
                {f.icon}
              </span>
              <div className="min-w-0 text-left">
                <h3 className="mb-1 text-sm font-semibold text-fg">{f.title}</h3>
                <p className="text-xs leading-snug text-fg-muted">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mb-3 px-0.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">Get started</h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/15 transition-colors duration-layout hover:bg-accent/90"
            onClick={openFolder}
          >
            Open Folder
          </button>
          <button
            type="button"
            className="rounded-lg border border-border bg-bg-soft px-6 py-2.5 text-sm font-medium text-fg transition-colors duration-layout hover:border-border hover:bg-bg-hover"
            onClick={() => setShowSettings(true)}
          >
            Add API Key
          </button>
          <span className="text-[11px] text-fg-subtle">
            Tip: <kbd className="rounded border border-border-soft bg-bg-deep px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">Ctrl+Shift+P</kbd>{' '}
            opens commands anywhere
          </span>
        </div>

        <div className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-2 border-t border-border-soft pt-8 text-xs text-fg-subtle">
          <span>
            <kbd className="rounded border border-border-soft bg-bg-deep px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">Ctrl+P</kbd>{' '}
            Quick open
          </span>
          <span>
            <kbd className="rounded border border-border-soft bg-bg-deep px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">Ctrl+Shift+A</kbd>{' '}
            Focus AI
          </span>
          <span>
            <kbd className="rounded border border-border-soft bg-bg-deep px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">Ctrl+S</kbd> Save
          </span>
          <span>
            <kbd className="rounded border border-border-soft bg-bg-deep px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">Ctrl+B</kbd>{' '}
            Sidebar
          </span>
        </div>

        <div className="mt-8 text-center text-[10px] text-fg-subtle/70">
          <button
            type="button"
            className="text-accent/90 underline decoration-accent/30 underline-offset-2 transition-colors hover:text-accent"
            onClick={() => useApp.getState().setShowRoadmap(true)}
          >
            Product roadmap
          </button>
          <span className="mx-2 text-border-soft">·</span>
          <span>v0.1.0 · Powered by OpenRouter</span>
        </div>
      </div>
    </div>
  );
}
