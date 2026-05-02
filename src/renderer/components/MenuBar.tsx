import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../store/appStore';
import { useSettings } from '../store/settingsStore';
import { toast } from './ToastContainer';
import logoIcon from '../assets/logo-icon.png';

interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  divider?: boolean;
  disabled?: boolean;
  submenu?: MenuItem[];
}

interface Menu {
  label: string;
  items: MenuItem[];
}

export default function MenuBar() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [showAbout, setShowAbout] = useState(false);
  const [showFeatures, setShowFeatures] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const menuBarRef = useRef<HTMLDivElement>(null);
  const triggerWelcomeTour = useApp((s) => s.triggerWelcomeTour);
  const setShowRoadmap = useApp((s) => s.setShowRoadmap);
  const setShowUsageStats = useApp((s) => s.setShowUsageStats);

  const setShowSettings = useApp((s) => s.setShowSettings);
  const setShowModelPicker = useApp((s) => s.setShowModelPicker);
  const setShowRules = useApp((s) => s.setShowRules);
  const setShowTasks = useApp((s) => s.setShowTasks);
  const setShowCommandPalette = useApp((s) => s.setShowCommandPalette);
  const setShowQuickOpen = useApp((s) => s.setShowQuickOpen);
  const clearChat = useApp((s) => s.clearChat);
  const toggleSidebar = useApp((s) => s.toggleSidebar);
  const sidebarCollapsed = useApp((s) => s.sidebarCollapsed);
  const bottomCollapsed = useApp((s) => s.bottomCollapsed);
  const setBottomCollapsed = useApp((s) => s.setBottomCollapsed);
  const activeTabPath = useApp((s) => s.activeTabPath);
  const closeTab = useApp((s) => s.closeTab);
  const freeModeEnabled = useApp((s) => s.freeModeEnabled);
  const setFreeMode = useApp((s) => s.setFreeMode);

  const settings = useSettings((s) => s.settings);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const menus: Menu[] = [
    {
      label: 'File',
      items: [
        {
          label: 'Open Folder...',
          shortcut: 'Ctrl+O',
          action: () => {
            window.api.fs.openFolder();
            setOpenMenu(null);
          },
        },
        {
          label: 'Quick Open',
          shortcut: 'Ctrl+P',
          action: () => {
            setShowQuickOpen(true);
            setOpenMenu(null);
          },
        },
        { divider: true, label: '' },
        {
          label: 'Save',
          shortcut: 'Ctrl+S',
          action: () => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }));
            setOpenMenu(null);
          },
        },
        {
          label: 'Save All',
          shortcut: 'Ctrl+Shift+S',
          action: () => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, shiftKey: true }));
            setOpenMenu(null);
          },
        },
        { divider: true, label: '' },
        {
          label: 'Close Tab',
          shortcut: 'Ctrl+W',
          disabled: !activeTabPath,
          action: () => {
            if (activeTabPath) closeTab(activeTabPath);
            setOpenMenu(null);
          },
        },
        { divider: true, label: '' },
        {
          label: 'Settings',
          shortcut: 'Ctrl+,',
          action: () => {
            setShowSettings(true);
            setOpenMenu(null);
          },
        },
      ],
    },
    {
      label: 'Edit',
      items: [
        {
          label: 'Undo',
          shortcut: 'Ctrl+Z',
          action: () => {
            document.execCommand('undo');
            setOpenMenu(null);
          },
        },
        {
          label: 'Redo',
          shortcut: 'Ctrl+Y',
          action: () => {
            document.execCommand('redo');
            setOpenMenu(null);
          },
        },
        { divider: true, label: '' },
        {
          label: 'Cut',
          shortcut: 'Ctrl+X',
          action: () => {
            document.execCommand('cut');
            setOpenMenu(null);
          },
        },
        {
          label: 'Copy',
          shortcut: 'Ctrl+C',
          action: () => {
            document.execCommand('copy');
            setOpenMenu(null);
          },
        },
        {
          label: 'Paste',
          shortcut: 'Ctrl+V',
          action: () => {
            document.execCommand('paste');
            setOpenMenu(null);
          },
        },
        { divider: true, label: '' },
        {
          label: 'Find',
          shortcut: 'Ctrl+F',
          action: () => {
            setOpenMenu(null);
          },
        },
        {
          label: 'Find in Files',
          shortcut: 'Ctrl+Shift+F',
          action: () => {
            setOpenMenu(null);
          },
        },
      ],
    },
    {
      label: 'View',
      items: [
        {
          label: 'Command Palette',
          shortcut: 'Ctrl+Shift+P',
          action: () => {
            setShowCommandPalette(true);
            setOpenMenu(null);
          },
        },
        { divider: true, label: '' },
        {
          label: sidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar',
          shortcut: 'Ctrl+B',
          action: () => {
            toggleSidebar();
            setOpenMenu(null);
          },
        },
        {
          label: bottomCollapsed ? 'Show Panel' : 'Hide Panel',
          shortcut: 'Ctrl+J',
          action: () => {
            setBottomCollapsed(!bottomCollapsed);
            setOpenMenu(null);
          },
        },
        { divider: true, label: '' },
        {
          label: 'Toggle Terminal',
          shortcut: 'Ctrl+`',
          action: () => {
            const state = useApp.getState();
            state.setBottomCollapsed(false);
            state.setBottomTab('terminal');
            setOpenMenu(null);
          },
        },
        {
          label: 'Toggle Output',
          action: () => {
            const state = useApp.getState();
            state.setBottomCollapsed(false);
            state.setBottomTab('output');
            setOpenMenu(null);
          },
        },
      ],
    },
    {
      label: 'AI',
      items: [
        {
          label: 'New Chat',
          action: () => {
            clearChat();
            setOpenMenu(null);
          },
        },
        {
          label: 'Select Model',
          shortcut: 'Ctrl+M',
          action: () => {
            setShowModelPicker(true);
            setOpenMenu(null);
          },
        },
        { divider: true, label: '' },
        {
          label: freeModeEnabled ? 'Disable Free Mode' : 'Enable Free Mode',
          action: () => {
            setFreeMode(!freeModeEnabled);
            setOpenMenu(null);
          },
        },
        {
          label: settings.agentMode ? 'Disable Agent Mode' : 'Enable Agent Mode',
          action: async () => {
            await window.api.settings.set({ agentMode: !settings.agentMode });
            useSettings.getState().load();
            setOpenMenu(null);
          },
        },
        { divider: true, label: '' },
        {
          label: 'Manage Rules / Skills',
          shortcut: 'Ctrl+Shift+R',
          action: () => {
            setShowRules(true);
            setOpenMenu(null);
          },
        },
        {
          label: 'View Agent Tasks',
          shortcut: 'Ctrl+Shift+T',
          action: () => {
            setShowTasks(true);
            setOpenMenu(null);
          },
        },
      ],
    },
    {
      label: 'Help',
      items: [
        {
          label: 'Features & Capabilities',
          action: () => {
            setShowFeatures(true);
            setOpenMenu(null);
          },
        },
        {
          label: 'Welcome tour',
          action: () => {
            triggerWelcomeTour();
            setOpenMenu(null);
          },
        },
        {
          label: 'Keyboard Shortcuts',
          shortcut: 'Ctrl+Shift+/',
          action: () => {
            setShowShortcuts(true);
            setOpenMenu(null);
          },
        },
        {
          label: 'Product roadmap',
          action: () => {
            setShowRoadmap(true);
            setOpenMenu(null);
          },
        },
        {
          label: 'Local usage statistics',
          action: () => {
            setShowUsageStats(true);
            setOpenMenu(null);
          },
        },
        {
          label: 'Check for Updates…',
          action: async () => {
            setOpenMenu(null);
            const res = await window.api.updates.check();
            if (res.started) toast.info('Checking for updates…');
            else if (res.message) toast.info(res.message);
          },
        },
        { divider: true, label: '' },
        {
          label: 'Documentation',
          action: () => {
            window.open('https://github.com/router-studio/docs', '_blank');
            setOpenMenu(null);
          },
        },
        {
          label: 'Report Issue',
          action: () => {
            window.open('https://github.com/router-studio/issues', '_blank');
            setOpenMenu(null);
          },
        },
        { divider: true, label: '' },
        {
          label: 'About Router Studio',
          action: () => {
            setShowAbout(true);
            setOpenMenu(null);
          },
        },
      ],
    },
  ];

  return (
    <>
      <div
        ref={menuBarRef}
        className="flex h-8 shrink-0 select-none items-center border-b border-border-soft bg-bg-elevated px-2 shadow-chrome"
      >
        {/* Logo */}
        <div className="mr-4 flex items-center gap-2">
          <span className="brand-mark-icon-wrap">
            <img src={logoIcon} alt="" className="h-5 w-5 select-none" draggable={false} />
          </span>
        </div>

        {/* Menu items */}
        {menus.map((menu) => (
          <div key={menu.label} className="relative">
            <button
              onClick={() => setOpenMenu(openMenu === menu.label ? null : menu.label)}
              onMouseEnter={() => openMenu && setOpenMenu(menu.label)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors duration-layout ${
                openMenu === menu.label
                  ? 'bg-accent/12 text-accent'
                  : 'text-fg-muted hover:bg-bg-hover hover:text-fg'
              }`}
            >
              {menu.label}
            </button>

            {openMenu === menu.label && (
              <div className="absolute left-0 top-full z-50 min-w-52 rounded-lg border border-border-soft bg-bg-elevated py-1 shadow-float ring-1 ring-subtle">
                {menu.items.map((item, i) =>
                  item.divider ? (
                    <div key={i} className="my-1 h-px bg-border-soft" />
                  ) : (
                    <button
                      key={item.label}
                      onClick={item.action}
                      disabled={item.disabled}
                      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors duration-layout ${
                        item.disabled
                          ? 'cursor-not-allowed text-fg-subtle'
                          : 'text-fg-muted hover:bg-accent/10 hover:text-fg'
                      }`}
                    >
                      <span>{item.label}</span>
                      {item.shortcut && (
                        <span className="ml-4 text-[10px] text-fg-subtle">{item.shortcut}</span>
                      )}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Quick status */}
        <div className="flex items-center gap-3 text-[10px] text-fg-subtle">
          {settings.agentMode && (
            <span className="rounded bg-accent/20 px-1.5 py-0.5 text-accent">Agent Mode</span>
          )}
          {freeModeEnabled && (
            <span className="rounded bg-success/20 px-1.5 py-0.5 text-success">Free Mode</span>
          )}
        </div>
      </div>

      {/* About Modal */}
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}

      {/* Features Modal */}
      {showFeatures && <FeaturesModal onClose={() => setShowFeatures(false)} />}

      {/* Shortcuts Modal */}
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
    </>
  );
}

function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-scrim fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-border bg-bg-elevated p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center gap-4">
          <div className="brand-logo-plate !p-3">
            <img src={logoIcon} alt="Router Studio" className="h-14 w-14 select-none" draggable={false} />
          </div>
          <div>
            <h2 className="brand-wordmark text-xl">Router Studio</h2>
            <p className="text-sm text-fg-muted">One workspace for every AI model</p>
          </div>
        </div>

        <div className="mb-6 space-y-2 text-sm text-fg-muted">
          <p>Version 0.1.0</p>
          <p>Built with Electron, React, Monaco Editor, and OpenRouter.</p>
          <p className="pt-2">
            Router Studio is a modern AI-powered workspace that connects to any AI model
            through OpenRouter, giving you access to Claude, GPT, Gemini, and dozens of other
            models for intelligent code assistance.
          </p>
        </div>

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/80"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function FeaturesModal({ onClose }: { onClose: () => void }) {
  const [activeSection, setActiveSection] = useState(0);

  const sections = [
    {
      title: 'AI Chat & Assistance',
      icon: '🤖',
      features: [
        {
          name: 'Multi-Model Support',
          description:
            'Connect to any AI model through OpenRouter — Claude, GPT-4, Gemini, Mistral, LLaMA, and 200+ more. Switch models instantly.',
        },
        {
          name: 'Free Mode',
          description:
            'Enable Free Mode to use only free/low-cost models. Perfect for learning and experimentation without API costs.',
        },
        {
          name: 'Context-Aware Chat',
          description:
            'The AI automatically includes relevant context: current file, selected code, project structure, and enabled rules.',
        },
        {
          name: 'Code Actions',
          description:
            'Quick actions: Explain code, Refactor, Debug, Generate, Add Comments, Generate Unit Tests. Select code and click an action.',
        },
        {
          name: 'Multi-Modal Input',
          description:
            'Attach images, URLs, or files to your prompts. The AI can analyze screenshots, documentation, and more.',
        },
      ],
    },
    {
      title: 'Agent Mode & Tools',
      icon: '⚡',
      features: [
        {
          name: 'Agent Mode',
          description:
            'Enable Agent Mode for long-running tasks. The AI can autonomously read/write files, run commands, search code, and more.',
        },
        {
          name: 'Tool Calling',
          description:
            '20+ built-in tools: read_file, write_file, edit_file, grep, run_shell, git_status, git_commit, fetch_url, run_tests, and more.',
        },
        {
          name: 'Tool Approval',
          description:
            'Control which tools run automatically. Approve once, always allow a tool, or always allow matching patterns.',
        },
        {
          name: 'Task Persistence',
          description:
            'Agent tasks are saved automatically. Resume interrupted tasks, review past work, and track iterations.',
        },
        {
          name: 'Shell Integration',
          description:
            'AI can propose and run terminal commands. Built-in safety filters block dangerous operations.',
        },
      ],
    },
    {
      title: 'Editor Features',
      icon: '📝',
      features: [
        {
          name: 'Monaco Editor',
          description:
            'VS Code\'s editor with full syntax highlighting for 50+ languages, IntelliSense, and code formatting.',
        },
        {
          name: 'Format on Save',
          description:
            'Automatically format code when saving. Supports Prettier formatting for JS/TS, HTML, CSS, JSON, and more.',
        },
        {
          name: 'Diff Preview',
          description:
            'AI-generated changes are shown in a side-by-side diff view. Review and approve changes before applying.',
        },
        {
          name: 'Quick Open',
          description:
            'Press Ctrl+P to quickly search and open any file in your project. Fuzzy matching and recent files.',
        },
        {
          name: 'Command Palette',
          description:
            'Press Ctrl+Shift+P to access all commands. Search for actions, toggle settings, switch tabs.',
        },
      ],
    },
    {
      title: 'Rules & Skills',
      icon: '📋',
      features: [
        {
          name: 'Project Rules',
          description:
            'Add AGENTS.md or .cursor/rules/*.md files to your project. The AI follows these instructions automatically.',
        },
        {
          name: 'User Rules',
          description:
            'Create personal rules that apply across all projects. Define your coding style, preferences, and constraints.',
        },
        {
          name: 'Agent Discipline',
          description:
            'Built-in rule that makes the AI a reliable coding agent: task completion protocol, error recovery, and code quality.',
        },
        {
          name: 'Enable/Disable Rules',
          description:
            'Toggle individual rules on/off. Active rules are shown in the AI panel. Fine-tune AI behavior per project.',
        },
      ],
    },
    {
      title: 'Git Integration',
      icon: '🔀',
      features: [
        {
          name: 'Git Status',
          description:
            'View staged, unstaged, and untracked files. See current branch and ahead/behind status.',
        },
        {
          name: 'Git Diff',
          description:
            'View diffs for uncommitted changes. Compare against any commit or branch.',
        },
        {
          name: 'Git Commit',
          description:
            'Stage files and commit from the AI or command palette. AI can help write commit messages.',
        },
        {
          name: 'Branch Management',
          description:
            'Create, checkout, and delete branches. List all local and remote branches.',
        },
      ],
    },
    {
      title: 'Terminal & Shell',
      icon: '💻',
      features: [
        {
          name: 'Integrated Terminal',
          description:
            'Full terminal emulator with ANSI color support. Run any shell command directly in the app.',
        },
        {
          name: 'AI Command Proposals',
          description:
            'The AI can suggest terminal commands. Review and run them with one click.',
        },
        {
          name: 'Shell Safety',
          description:
            'Dangerous commands are blocked by default. Customize allowlists for trusted commands.',
        },
        {
          name: 'Test Runner',
          description:
            'Auto-detect and run tests with Jest, Vitest, Mocha, pytest, go test, or cargo test.',
        },
      ],
    },
    {
      title: 'Settings & Customization',
      icon: '⚙️',
      features: [
        {
          name: 'API Key Storage',
          description:
            'Your OpenRouter API key is stored securely using the OS keychain. Never saved in plain text.',
        },
        {
          name: 'Model Defaults',
          description:
            'Set your preferred default model. Configure temperature, max tokens, and streaming.',
        },
        {
          name: 'Agent Settings',
          description:
            'Configure max iterations, tool hop limits, and auto-continue behavior for Agent Mode.',
        },
        {
          name: 'Theme',
          description:
            'Dark, light, or match the system. Monaco and the terminal follow the same appearance.',
        },
      ],
    },
  ];

  return (
    <div className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="flex h-[80vh] w-full max-w-4xl overflow-hidden rounded-lg border border-border bg-bg-elevated shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar */}
        <div className="w-64 border-r border-border-soft bg-bg">
          <div className="border-b border-border-soft p-4">
            <div className="mb-1 flex items-center gap-2">
              <span className="brand-mark-icon-wrap">
                <img
                  src={logoIcon}
                  alt=""
                  className="h-8 w-8 shrink-0 select-none"
                  draggable={false}
                />
              </span>
              <h2 className="text-lg font-semibold tracking-tight text-fg">Features &amp; Capabilities</h2>
            </div>
            <p className="text-xs text-fg-muted">Everything Router Studio can do</p>
          </div>
          <div className="p-2">
            {sections.map((section, i) => (
              <button
                key={section.title}
                onClick={() => setActiveSection(i)}
                className={`flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm transition-colors ${
                  i === activeSection
                    ? 'bg-accent/10 text-accent'
                    : 'text-fg-muted hover:bg-bg-hover hover:text-fg'
                }`}
              >
                <span>{section.icon}</span>
                <span>{section.title}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="mb-6 flex items-center gap-3">
            <span className="text-3xl">{sections[activeSection].icon}</span>
            <h3 className="text-xl font-bold text-fg">{sections[activeSection].title}</h3>
          </div>

          <div className="space-y-6">
            {sections[activeSection].features.map((feature) => (
              <div key={feature.name} className="rounded-lg border border-border-soft bg-bg p-4">
                <h4 className="mb-2 font-semibold text-fg">{feature.name}</h4>
                <p className="text-sm leading-relaxed text-fg-muted">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-fg-muted hover:text-fg"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const shortcuts = [
    { category: 'General', items: [
      { keys: 'Ctrl+Shift+P', action: 'Command Palette' },
      { keys: 'Ctrl+,', action: 'Open Settings' },
      { keys: 'Ctrl+P', action: 'Quick Open File' },
      { keys: 'Ctrl+B', action: 'Toggle Sidebar' },
      { keys: 'Ctrl+J', action: 'Toggle Bottom Panel' },
      { keys: 'Ctrl+`', action: 'Toggle Terminal' },
    ]},
    { category: 'Files', items: [
      { keys: 'Ctrl+O', action: 'Open Folder' },
      { keys: 'Ctrl+S', action: 'Save File' },
      { keys: 'Ctrl+Shift+S', action: 'Save All' },
      { keys: 'Ctrl+W', action: 'Close Tab' },
      { keys: 'Ctrl+Tab', action: 'Next Tab' },
      { keys: 'Ctrl+Shift+Tab', action: 'Previous Tab' },
    ]},
    { category: 'AI & Agent', items: [
      { keys: 'Ctrl+M', action: 'Select AI Model' },
      { keys: 'Ctrl+Shift+R', action: 'Manage Rules/Skills' },
      { keys: 'Ctrl+Shift+T', action: 'View Agent Tasks' },
      { keys: 'Ctrl+Enter', action: 'Send Message (in AI panel)' },
      { keys: 'Shift+Enter', action: 'New Line (in AI panel)' },
    ]},
    { category: 'Editor', items: [
      { keys: 'Ctrl+F', action: 'Find' },
      { keys: 'Ctrl+H', action: 'Find and Replace' },
      { keys: 'Ctrl+G', action: 'Go to Line' },
      { keys: 'Ctrl+D', action: 'Select Word' },
      { keys: 'Ctrl+/', action: 'Toggle Comment' },
      { keys: 'Alt+Up/Down', action: 'Move Line Up/Down' },
      { keys: 'Alt+Shift+Up/Down', action: 'Copy Line Up/Down' },
    ]},
  ];

  return (
    <div className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-lg border border-border bg-bg-elevated p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="brand-mark-icon-wrap">
              <img
                src={logoIcon}
                alt=""
                className="h-8 w-8 shrink-0 select-none"
                draggable={false}
              />
            </span>
            <h2 className="truncate text-xl font-bold text-fg">Keyboard Shortcuts</h2>
          </div>
          <button onClick={onClose} className="text-fg-muted hover:text-fg">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {shortcuts.map((group) => (
            <div key={group.category}>
              <h3 className="mb-3 text-sm font-semibold text-accent">{group.category}</h3>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <div key={item.keys} className="flex items-center justify-between">
                    <span className="text-sm text-fg-muted">{item.action}</span>
                    <kbd className="rounded bg-bg px-2 py-0.5 font-mono text-xs text-fg">
                      {item.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
