import { useCallback, useEffect, useRef, useState } from 'react';
import type { ITheme } from '@xterm/xterm';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useApp } from '../store/appStore';
import { useSettings } from '../store/settingsStore';
import { useResolvedTheme } from '../hooks/useResolvedTheme';
import ContextMenu from './ContextMenu';
import type { ContextMenuItem } from './ContextMenu';
import { parseFirstFileLocationInText } from '../lib/outputLinkParse';
import { openOrRevealFileAtLocation } from '../lib/editorNavigation';

const XTERM_DARK: ITheme = {
  background: '#0B1220',
  foreground: '#E6E8EB',
  cursor: '#22D3EE',
  black: '#111827',
  red: '#EF4444',
  green: '#22C55E',
  yellow: '#F59E0B',
  blue: '#6366FF',
  magenta: '#A855F7',
  cyan: '#22D3EE',
  white: '#E6E8EB',
  brightBlack: '#64748B',
  brightRed: '#F87171',
  brightGreen: '#4ADE80',
  brightYellow: '#FBBF24',
  brightBlue: '#818CF8',
  brightMagenta: '#C084FC',
  brightCyan: '#67E8F9',
  brightWhite: '#F8FAFC',
};

const XTERM_LIGHT: ITheme = {
  background: '#fcfbfe',
  foreground: '#0f172a',
  cursor: '#4f46e5',
  black: '#e2e8f0',
  red: '#dc2626',
  green: '#16a34a',
  yellow: '#d97706',
  blue: '#4f46e5',
  magenta: '#a855f7',
  cyan: '#0891b2',
  white: '#0f172a',
  brightBlack: '#64748b',
  brightRed: '#ef4444',
  brightGreen: '#22c55e',
  brightYellow: '#ca8a04',
  brightBlue: '#6366FF',
  brightMagenta: '#c026d3',
  brightCyan: '#06b6d4',
  brightWhite: '#020617',
};

/**
 * xterm.js terminal pane.
 *
 * Backed by a plain child_process shell in the main process (no native PTY),
 * so command-and-output workflows + ANSI colors work, but full-screen TUI
 * programs may not render perfectly.
 *
 * The session is owned by this component. A running session id is published
 * to the app store (`terminalSessionId`) so other parts of the UI (e.g., chat
 * "Run" button) can send commands into it.
 */
export default function TerminalPane({ active }: { active: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const startingRef = useRef(false);

  const uiTheme = useResolvedTheme();

  const projectRoot = useApp((s) => s.projectRoot);
  const pushLog = useApp((s) => s.pushLog);
  const settings = useSettings((s) => s.settings);
  const setTerminalSessionId = useApp((s) => s.setTerminalSessionId);
  const terminalSessionId = useApp((s) => s.terminalSessionId);
  const pendingCmd = useApp((s) => s.pendingTerminalCommand);
  const clearPending = useApp((s) => s.clearPendingTerminalCommand);

  const [terminalMenu, setTerminalMenu] = useState<{
    x: number;
    y: number;
    items: ContextMenuItem[];
  } | null>(null);

  // Init xterm once the container is mounted.
  useEffect(() => {
    if (!containerRef.current || termRef.current) return;

    const term = new Terminal({
      fontFamily: "'JetBrains Mono', Menlo, Consolas, monospace",
      fontSize: 12,
      cursorBlink: true,
      convertEol: true,
      scrollback: 5000,
      theme: XTERM_DARK,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    term.onData((data) => {
      const id = sessionIdRef.current;
      if (id) void window.api.terminal.write(id, data);
    });

    termRef.current = term;
    fitRef.current = fit;

    const unsub = window.api.events.onTerminal((evt) => {
      if (!sessionIdRef.current || evt.sessionId !== sessionIdRef.current) return;
      if (evt.type === 'started') {
        term.writeln(
          `\x1b[90m[Router Studio] session started (${evt.shell}) in ${evt.cwd}\x1b[0m`,
        );
      } else if (evt.type === 'data' && evt.data) {
        term.write(evt.data);
      } else if (evt.type === 'error') {
        term.writeln(`\x1b[31m[error] ${evt.error}\x1b[0m`);
      } else if (evt.type === 'exit') {
        term.writeln(`\x1b[90m[exit ${evt.exitCode ?? '?'}]\x1b[0m`);
        if (sessionIdRef.current) {
          sessionIdRef.current = null;
          setTerminalSessionId(null);
        }
      }
    });

    return () => {
      unsub();
      try {
        term.dispose();
      } catch {
        /* ignore */
      }
      termRef.current = null;
      fitRef.current = null;
    };
  }, [setTerminalSessionId]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.theme = uiTheme === 'light' ? XTERM_LIGHT : XTERM_DARK;
    term.refresh(0, term.rows - 1);
  }, [uiTheme]);

  // Auto-start a shell session when the pane first becomes active.
  useEffect(() => {
    if (!active || sessionIdRef.current || startingRef.current) return;
    startingRef.current = true;
    (async () => {
      try {
        const { sessionId, shell, cwd } = await window.api.terminal.start({
          shell: settings.defaultShell || undefined,
          cwd: projectRoot ?? undefined,
        });
        sessionIdRef.current = sessionId;
        setTerminalSessionId(sessionId);
        pushLog('info', `Terminal ready: ${shell} @ ${cwd}`);
      } catch (e) {
        pushLog('error', `Terminal failed to start: ${(e as Error).message}`);
        termRef.current?.writeln(
          `\x1b[31mFailed to start shell: ${(e as Error).message}\x1b[0m`,
        );
      } finally {
        startingRef.current = false;
      }
    })();
  }, [active, projectRoot, settings.defaultShell, pushLog, setTerminalSessionId]);

  // Keep terminal fitted to its container.
  useEffect(() => {
    if (!active) return;
    const fit = fitRef.current;
    if (!fit) return;
    const tryFit = () => {
      try {
        fit.fit();
        const t = termRef.current;
        const id = sessionIdRef.current;
        if (t && id) void window.api.terminal.resize(id, t.cols, t.rows);
      } catch {
        /* ignore */
      }
    };
    tryFit();
    const ro = new ResizeObserver(tryFit);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize', tryFit);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', tryFit);
    };
  }, [active]);

  // Execute a pending AI-proposed command when requested + session is ready.
  // Depending on `terminalSessionId` (store) ensures this re-fires once the
  // session publishes itself — commands queued before boot still get run.
  useEffect(() => {
    if (!pendingCmd || !terminalSessionId) return;
    const t = termRef.current;
    if (!t) return;
    t.focus();
    void window.api.terminal.run(terminalSessionId, pendingCmd);
    pushLog('info', `$ ${pendingCmd}`);
    clearPending();
  }, [pendingCmd, terminalSessionId, clearPending, pushLog]);

  const onWrapperContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const term = termRef.current;
    const selection = term?.getSelection() ?? '';
    const hasSel = selection.length > 0;
    const fileLink = hasSel ? parseFirstFileLocationInText(selection) : null;

    const items: ContextMenuItem[] = [
      ...(fileLink
        ? [
            {
              label: `Open ${fileLink.relativePath}:${fileLink.line}`,
              action: () => void openOrRevealFileAtLocation(fileLink, projectRoot),
            } satisfies ContextMenuItem,
            { divider: true, label: '' } satisfies ContextMenuItem,
          ]
        : []),
      {
        label: 'Copy',
        shortcut: 'Ctrl/Cmd+Shift+C',
        disabled: !hasSel,
        action: async () => {
          if (!selection) return;
          try {
            await navigator.clipboard.writeText(selection);
          } catch {
            pushLog('error', 'Copy failed (clipboard permission).');
          }
        },
      },
      {
        label: 'Paste',
        shortcut: 'Ctrl/Cmd+Shift+V',
        action: async () => {
          try {
            const text = await navigator.clipboard.readText();
            if (text && termRef.current) termRef.current.paste(text);
          } catch {
            pushLog('error', 'Paste failed (clipboard permission).');
          }
        },
      },
      { divider: true, label: '' },
      {
        label: 'Select all',
        action: () => {
          try {
            term?.selectAll();
          } catch {
            /* xterm version without selectAll */
          }
        },
      },
      {
        label: 'Clear',
        danger: true,
        action: () => term?.clear(),
      },
      { divider: true, label: '' },
      {
        label: 'Focus terminal',
        action: () => term?.focus(),
      },
    ];

    setTerminalMenu({ x: e.clientX, y: e.clientY, items });
  }, [pushLog, projectRoot]);

  return (
    <div
      className="relative h-full w-full bg-bg"
      style={{ minHeight: 0 }}
      onContextMenuCapture={onWrapperContextMenu}
    >
      <div ref={containerRef} className="h-full w-full" style={{ minHeight: 0 }} />
      {terminalMenu && (
        <ContextMenu
          x={terminalMenu.x}
          y={terminalMenu.y}
          items={terminalMenu.items}
          onClose={() => setTerminalMenu(null)}
        />
      )}
    </div>
  );
}
