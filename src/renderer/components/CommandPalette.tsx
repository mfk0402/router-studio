import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store/appStore';
import { useSettings } from '../store/settingsStore';
import { toast } from './ToastContainer';
import { markUserInitiatedUpdateCheck } from '../lib/updateCheckFlow';

interface Command {
  id: string;
  label: string;
  category: 'file' | 'edit' | 'view' | 'tools' | 'git' | 'ai' | 'settings' | 'help';
  shortcut?: string;
  /** Extra tokens for palette search (not shown in the row). */
  keywords?: string[];
  action: () => void;
}

export default function CommandPalette() {
  const showCommandPalette = useApp((s) => s.showCommandPalette);
  const setShowCommandPalette = useApp((s) => s.setShowCommandPalette);
  const setShowSettings = useApp((s) => s.setShowSettings);
  const setShowModelPicker = useApp((s) => s.setShowModelPicker);
  const setShowRules = useApp((s) => s.setShowRules);
  const setShowTasks = useApp((s) => s.setShowTasks);
  const setShowRoadmap = useApp((s) => s.setShowRoadmap);
  const setShowUsageStats = useApp((s) => s.setShowUsageStats);
  const setShowBenchmark = useApp((s) => s.setShowBenchmark);
  const setShowAccountModal = useApp((s) => s.setShowAccountModal);
  const clearChat = useApp((s) => s.clearChat);
  const fileTree = useApp((s) => s.fileTree);
  const tabs = useApp((s) => s.tabs);
  const setActiveTab = useApp((s) => s.setActiveTab);
  const closeTab = useApp((s) => s.closeTab);
  const activeTabPath = useApp((s) => s.activeTabPath);
  const freeModeEnabled = useApp((s) => s.freeModeEnabled);
  const setFreeMode = useApp((s) => s.setFreeMode);

  const settings = useSettings((s) => s.settings);

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Build command list
  const commands: Command[] = useMemo(() => {
    const cmds: Command[] = [
      // File commands
      {
        id: 'file:open',
        label: 'Open Folder',
        category: 'file',
        shortcut: 'Ctrl+O',
        action: () => {
          void useApp.getState().pickAndOpenProjectFolder();
          setShowCommandPalette(false);
        },
      },
      {
        id: 'file:quickOpen',
        label: 'Quick Open File',
        category: 'file',
        shortcut: 'Ctrl+P',
        action: () => {
          setShowCommandPalette(false);
          // Trigger quick open via app store
          useApp.getState().setShowQuickOpen(true);
        },
      },
      {
        id: 'file:save',
        label: 'Save File',
        category: 'file',
        shortcut: 'Ctrl+S',
        action: () => {
          setShowCommandPalette(false);
          // Trigger save via keyboard event
          const evt = new KeyboardEvent('keydown', {
            key: 's',
            ctrlKey: true,
            bubbles: true,
          });
          document.dispatchEvent(evt);
        },
      },
      {
        id: 'file:closeTab',
        label: 'Close Tab',
        category: 'file',
        shortcut: 'Ctrl+W',
        action: () => {
          if (activeTabPath) {
            closeTab(activeTabPath);
          }
          setShowCommandPalette(false);
        },
      },

      // View commands
      {
        id: 'view:settings',
        label: 'Open Settings',
        category: 'view',
        shortcut: 'Ctrl+,',
        action: () => {
          setShowSettings(true);
          setShowCommandPalette(false);
        },
      },
      {
        id: 'view:account',
        label: 'Router Studio account (sign in)',
        category: 'view',
        keywords: ['account', 'login', 'register', 'email', 'password', 'vault', 'sync'],
        action: () => {
          setShowAccountModal(true);
          setShowCommandPalette(false);
        },
      },
      {
        id: 'view:modelPicker',
        label: 'Select AI Model',
        category: 'view',
        shortcut: 'Ctrl+M',
        action: () => {
          setShowModelPicker(true);
          setShowCommandPalette(false);
        },
      },
      {
        id: 'view:zenToggle',
        label: settings.zenMode ? 'Exit fullscreen AI chat' : 'Enter fullscreen AI chat',
        category: 'view',
        keywords: ['zen', 'ai', 'chat', 'assistant', 'fullscreen', 'focus', 'agent'],
        shortcut: settings.zenMode ? 'Esc' : undefined,
        action: async () => {
          await useSettings.getState().update({ zenMode: !settings.zenMode });
          setShowCommandPalette(false);
        },
      },
      {
        id: 'view:rules',
        label: 'Manage Rules / Skills',
        category: 'view',
        shortcut: 'Ctrl+Shift+R',
        action: () => {
          setShowRules(true);
          setShowCommandPalette(false);
        },
      },
      {
        id: 'view:tasks',
        label: 'View Agent Tasks',
        category: 'view',
        shortcut: 'Ctrl+Shift+T',
        action: () => {
          setShowTasks(true);
          setShowCommandPalette(false);
        },
      },
      {
        id: 'help:roadmap',
        label: 'Open Product Roadmap',
        category: 'help',
        keywords: ['roadmap', 'backlog', 'features', 'shipped', 'planned'],
        action: () => {
          setShowRoadmap(true);
          setShowCommandPalette(false);
        },
      },
      {
        id: 'help:stats',
        label: 'Open Local Usage Statistics',
        category: 'help',
        keywords: ['statistics', 'telemetry', 'usage', 'metrics'],
        action: () => {
          setShowUsageStats(true);
          setShowCommandPalette(false);
        },
      },
      {
        id: 'help:benchmark',
        label: 'Open Model Benchmark',
        category: 'help',
        keywords: ['benchmark', 'latency', 'evaluator', 'speed', 'perf'],
        action: () => {
          setShowBenchmark(true);
          setShowCommandPalette(false);
        },
      },
      {
        id: 'help:updates',
        label: 'Check for Updates',
        category: 'help',
        keywords: ['updater', 'update', 'upgrade', 'version'],
        action: async () => {
          setShowCommandPalette(false);
          markUserInitiatedUpdateCheck();
          const res = await window.api.updates.check();
          if (res.started) toast.info('Checking for updates…');
          else if (res.message) toast.info(res.message);
        },
      },

      // AI commands
      {
        id: 'ai:newChat',
        label: 'New AI Chat',
        category: 'ai',
        action: () => {
          clearChat();
          setShowCommandPalette(false);
        },
      },
      {
        id: 'ai:toggleFreeMode',
        label: freeModeEnabled ? 'Disable Free Mode' : 'Enable Free Mode',
        category: 'ai',
        action: () => {
          setFreeMode(!freeModeEnabled);
          setShowCommandPalette(false);
        },
      },
      {
        id: 'ai:composer',
        label: 'Open Multi-file Composer',
        category: 'ai',
        keywords: ['composer', 'multi-file', 'cursor'],
        action: () => {
          useApp.getState().setShowComposerPanel(true);
          setShowCommandPalette(false);
        },
      },
      {
        id: 'ai:browserPanel',
        label: 'Toggle Browser Preview Panel',
        category: 'ai',
        keywords: ['browser', 'playwright', 'visual'],
        action: () => {
          const st = useApp.getState();
          st.setShowBrowserPanel(!st.showBrowserPanel);
          setShowCommandPalette(false);
        },
      },
      {
        id: 'ai:screenshotComposer',
        label: 'Screenshot → Composer workflow',
        category: 'ai',
        keywords: ['screenshot', 'component', 'tailwind', 'attach'],
        action: () => {
          useApp.getState().setShowComposerPanel(true);
          toast.info(
            'Composer',
            'Attach a screenshot via the paperclip, describe the component, then Preview impact.',
          );
          setShowCommandPalette(false);
        },
      },

      // Settings commands
      {
        id: 'settings:toggleFormatOnSave',
        label: settings.formatOnSave ? 'Disable Format on Save' : 'Enable Format on Save',
        category: 'settings',
        action: async () => {
          await window.api.settings.set({ formatOnSave: !settings.formatOnSave });
          useSettings.getState().load();
          setShowCommandPalette(false);
        },
      },
      {
        id: 'settings:toggleAgentMode',
        label: settings.agentMode ? 'Disable Agent Mode' : 'Enable Agent Mode',
        category: 'settings',
        action: async () => {
          await window.api.settings.set({ agentMode: !settings.agentMode });
          useSettings.getState().load();
          setShowCommandPalette(false);
        },
      },
    ];

    // Add open tabs as commands
    for (const tab of tabs) {
      cmds.push({
        id: `tab:${tab.relativePath}`,
        label: `Switch to: ${tab.name}`,
        category: 'file',
        action: () => {
          setActiveTab(tab.relativePath);
          setShowCommandPalette(false);
        },
      });
    }

    return cmds;
  }, [
    tabs,
    settings,
    activeTabPath,
    freeModeEnabled,
    setShowCommandPalette,
    setShowSettings,
    setShowModelPicker,
    setShowRules,
    setShowTasks,
    setShowRoadmap,
    setShowUsageStats,
    setShowBenchmark,
    setShowAccountModal,
    clearChat,
    setFreeMode,
    setActiveTab,
    closeTab,
  ]);

  // Filter commands
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;

    const q = query.toLowerCase();
    return commands
      .filter((cmd) => {
        const label = cmd.label.toLowerCase();
        const category = cmd.category.toLowerCase();
        const keywords = (cmd.keywords ?? []).join(' ').toLowerCase();
        return label.includes(q) || category.includes(q) || keywords.includes(q);
      })
      .sort((a, b) => {
        // Exact match at start ranks higher
        const aStarts = a.label.toLowerCase().startsWith(q);
        const bStarts = b.label.toLowerCase().startsWith(q);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.label.localeCompare(b.label);
      });
  }, [commands, query]);

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input when opened
  useEffect(() => {
    if (showCommandPalette) {
      setQuery('');
      setSelectedIndex(0);
      inputRef.current?.focus();
    }
  }, [showCommandPalette]);

  // Scroll selected into view
  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.querySelector('[data-selected="true"]');
      selected?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowCommandPalette(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && filteredCommands[selectedIndex]) {
        e.preventDefault();
        filteredCommands[selectedIndex].action();
      }
    },
    [filteredCommands, selectedIndex, setShowCommandPalette],
  );

  if (!showCommandPalette) return null;

  return (
    <div
      className="modal-scrim fixed inset-0 z-50 flex items-start justify-center pt-24"
      onClick={() => setShowCommandPalette(false)}
    >
      <div
        className="glass-panel glass-modal-lg w-full max-w-lg ds-transition overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center border-b border-border-soft px-4 py-3">
          <svg className="mr-3 h-5 w-5 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent text-sm text-fg placeholder-fg-subtle focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="ml-2 text-fg-muted hover:text-fg"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div ref={listRef} className="max-h-80 overflow-auto py-2">
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-fg-muted">No commands found</div>
          ) : (
            filteredCommands.map((cmd, i) => (
              <button
                key={cmd.id}
                data-selected={i === selectedIndex}
                onClick={cmd.action}
                className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition-colors ${
                  i === selectedIndex ? 'bg-accent/10 text-fg' : 'text-fg-muted hover:bg-bg-hover hover:text-fg'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                      cmd.category === 'ai'
                        ? 'bg-accent/20 text-accent'
                        : cmd.category === 'git'
                          ? 'bg-success/20 text-success'
                          : cmd.category === 'settings'
                            ? 'bg-warn/20 text-warn'
                            : cmd.category === 'help'
                              ? 'bg-accent/15 text-fg-muted'
                              : 'bg-fg-subtle/20 text-fg-muted'
                    }`}
                  >
                    {cmd.category}
                  </span>
                  <span>{cmd.label}</span>
                </div>
                {cmd.shortcut && (
                  <span className="text-xs text-fg-subtle">{cmd.shortcut}</span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
