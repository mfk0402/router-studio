import { useCallback, useMemo, useState, memo } from 'react';
import { useApp } from '../store/appStore';
import { toast } from './ToastContainer';
import logoIcon from '../assets/logo-icon.png';

function basenamePath(p: string): string {
  const s = p.replace(/[/\\]+$/, '');
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  return i >= 0 ? s.slice(i + 1) : s;
}

function WelcomePane() {
  const setShowSettings = useApp((s) => s.setShowSettings);
  const pushLog = useApp((s) => s.pushLog);
  const projectRoot = useApp((s) => s.projectRoot);
  const projectLoading = useApp((s) => s.projectLoading);
  const projectLoadingLabel = useApp((s) => s.projectLoadingLabel);
  const recentProjectRoots = useApp((s) => s.recentProjectRoots);
  const pickAndOpenProjectFolder = useApp((s) => s.pickAndOpenProjectFolder);
  const openProjectFromPath = useApp((s) => s.openProjectFromPath);
  const removeRecentProject = useApp((s) => s.removeRecentProject);
  const requestRunTerminalCommand = useApp((s) => s.requestRunTerminalCommand);
  const setShowModelPicker = useApp((s) => s.setShowModelPicker);

  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneUrl, setCloneUrl] = useState('');
  const [cloneParent, setCloneParent] = useState<string | null>(null);
  const [cloneBusy, setCloneBusy] = useState(false);
  const [recentOpeningPath, setRecentOpeningPath] = useState<string | null>(null);

  const [sshOpen, setSshOpen] = useState(false);
  const [sshSending, setSshSending] = useState(false);
  const [sshHost, setSshHost] = useState('user@host');
  const [sshLocalPort, setSshLocalPort] = useState('8080');
  const [sshRemotePort, setSshRemotePort] = useState('8080');

  const sshCommand = useMemo(() => {
    const h = sshHost.trim();
    if (!h) return 'ssh user@host';
    const lp = sshLocalPort.trim();
    const rp = sshRemotePort.trim();
    if (lp && rp) {
      return `ssh -N -L ${lp}:127.0.0.1:${rp} ${h}`;
    }
    return `ssh ${h}`;
  }, [sshHost, sshLocalPort, sshRemotePort]);

  const openRecent = useCallback(
    async (abs: string) => {
      setRecentOpeningPath(abs);
      try {
        await openProjectFromPath(abs);
      } finally {
        setRecentOpeningPath(null);
      }
    },
    [openProjectFromPath],
  );

  const pickCloneParent = useCallback(async () => {
    const dir = await window.api.workspace.pickParentDir();
    setCloneParent(dir);
    if (dir) toast.info('Clone destination', dir);
  }, []);

  const runClone = useCallback(async () => {
    const url = cloneUrl.trim();
    if (!url) {
      toast.error('Clone', 'Enter a repository URL.');
      return;
    }
    if (!cloneParent) {
      toast.error('Clone', 'Choose a parent folder first.');
      return;
    }
    setCloneBusy(true);
    try {
      const res = await window.api.workspace.gitClone(url, cloneParent);
      if (!res.ok) {
        toast.error('git clone failed', res.error);
        pushLog('error', `git clone: ${res.error}`);
        return;
      }
      toast.success('Repository cloned', res.projectPath);
      await openProjectFromPath(res.projectPath);
      setCloneOpen(false);
      setCloneUrl('');
      setCloneParent(null);
    } catch (e) {
      const msg = (e as Error).message;
      toast.error('Clone failed', msg);
      pushLog('error', `git clone: ${msg}`);
    } finally {
      setCloneBusy(false);
    }
  }, [cloneUrl, cloneParent, openProjectFromPath, pushLog]);

  const copySsh = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(sshCommand);
      toast.success('Copied', 'SSH command on clipboard');
    } catch {
      toast.error('Clipboard', 'Could not copy');
    }
  }, [sshCommand]);

  const runSshInTerminal = useCallback(() => {
    setSshSending(true);
    requestRunTerminalCommand(`${sshCommand}\n`);
    window.setTimeout(() => {
      setSshSending(false);
      setSshOpen(false);
      toast.info('Terminal', 'SSH command forwarded to the integrated terminal');
    }, 250);
  }, [requestRunTerminalCommand, sshCommand]);

  const features = [
    { icon: '💻', title: 'Any AI Model', desc: 'Access Claude, GPT, Gemini, Llama, and 100+ models via OpenRouter' },
    { icon: '🎨', title: 'Multi-Modal', desc: 'Vision, image generation, video, audio — all in one workspace' },
    { icon: '🛠️', title: 'Agent Tools', desc: 'File editing, shell commands, git, search, diagnostics, and more' },
    { icon: '📝', title: 'Monaco Editor', desc: 'VS Code-quality editing with 60+ languages, formatting, IntelliSense' },
    { icon: '🔒', title: 'Local & Private', desc: 'Your code stays on your machine. No telemetry, no cloud storage' },
    { icon: '🆓', title: 'Free Mode', desc: 'Route through free models when you want zero-cost AI assistance' },
  ];

  return (
    <div className="flex h-full w-full min-h-0 flex-1 flex-col items-center overflow-x-hidden overflow-y-auto welcome-hero px-5 pb-24 pt-10 sm:px-10">
      <div className="w-full min-w-0 max-w-4xl">
        <div className="mb-10 flex w-full min-w-0 flex-col items-center text-center">
          <div className="brand-logo-plate mx-auto mb-6 flex w-full min-w-0 max-w-xl flex-col items-center gap-5 px-4 py-7 text-center">
            <span className="brand-mark-icon-wrap shrink-0 p-1">
              <img
                src={logoIcon}
                alt=""
                className="h-24 w-24 select-none"
                draggable={false}
              />
            </span>
            <div className="flex w-full min-w-0 flex-col items-center overflow-hidden">
              <h1 className="brand-wordmark break-words text-3xl font-semibold tracking-tight">
                Router Studio
              </h1>
              <p className="mt-2 max-w-md break-words text-pretty text-sm font-medium leading-snug text-fg-muted">
                One workspace for every AI model
              </p>
            </div>
          </div>
          <p className="mx-auto max-w-lg min-w-0 break-words px-1 text-pretty text-base font-medium leading-relaxed text-fg-muted">
            Edit, ship, and delegate work across models without switching tools.
          </p>
        </div>

        <div className="mb-3 px-0.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">Start</h2>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            className="flex flex-col items-start gap-1 rounded-xl border border-border-soft bg-bg-elevated p-4 text-left shadow-card transition-all duration-layout hover:border-accent/40 hover:shadow-card-hover disabled:cursor-wait disabled:opacity-75"
            onClick={() => void pickAndOpenProjectFolder()}
            disabled={projectLoading}
          >
            {projectLoading ? (
              <span className="loading-spinner" aria-hidden />
            ) : (
              <span className="text-lg" aria-hidden>
                📂
              </span>
            )}
            <span className="text-sm font-semibold text-fg">
              {projectLoading ? projectLoadingLabel ?? 'Opening project...' : 'Open project folder'}
            </span>
            <span className="text-[11px] leading-snug text-fg-muted">
              Browse to an existing project on disk (Ctrl+O)
            </span>
          </button>
          <button
            type="button"
            className="flex flex-col items-start gap-1 rounded-xl border border-border-soft bg-bg-elevated p-4 text-left shadow-card transition-all duration-layout hover:border-accent/40 hover:shadow-card-hover"
            onClick={() => setShowModelPicker(true)}
          >
            <span className="text-lg" aria-hidden>
              ✨
            </span>
            <span className="text-sm font-semibold text-fg">Choose an AI model</span>
            <span className="text-[11px] leading-snug text-fg-muted">
              Marketplace (Ctrl+Shift+M) · add API key in Settings → Models
            </span>
          </button>
          <button
            type="button"
            className="flex flex-col items-start gap-1 rounded-xl border border-border-soft bg-bg-elevated p-4 text-left shadow-card transition-all duration-layout hover:border-accent/40 hover:shadow-card-hover disabled:cursor-wait disabled:opacity-75"
            onClick={() => setCloneOpen(true)}
            disabled={cloneBusy || projectLoading}
          >
            <span className="text-lg" aria-hidden>
              🐙
            </span>
            <span className="text-sm font-semibold text-fg">Clone Git repository</span>
            <span className="text-[11px] leading-snug text-fg-muted">HTTPS or SSH URL; requires Git on PATH</span>
          </button>
          <button
            type="button"
            className="flex flex-col items-start gap-1 rounded-xl border border-border-soft bg-bg-elevated p-4 text-left shadow-card transition-all duration-layout hover:border-accent/40 hover:shadow-card-hover"
            onClick={() => setSshOpen(true)}
          >
            <span className="text-lg" aria-hidden>
              🔐
            </span>
            <span className="text-sm font-semibold text-fg">SSH & port forward</span>
            <span className="text-[11px] leading-snug text-fg-muted">Build an ssh command and run it in the terminal</span>
          </button>
        </div>

        {projectRoot && (
          <div className="mb-6 rounded-lg border border-accent/25 bg-accent/5 px-3 py-2 text-center text-[11px] text-fg-muted">
            <span className="font-medium text-fg">Folder open: </span>
            <span className="font-mono text-fg-subtle" title={projectRoot}>
              {basenamePath(projectRoot)}
            </span>
            <span className="mx-2 text-border-soft">·</span>
            <span>Open a file from the Explorer sidebar, or pick another action above.</span>
          </div>
        )}

        {recentProjectRoots.length > 0 && (
          <>
            <div className="mb-3 px-0.5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">Recent projects</h2>
            </div>
            <ul className="mb-10 space-y-1.5">
              {recentProjectRoots.map((p) => (
                <li
                  key={p}
                  className="flex items-center gap-2 rounded-lg border border-border-soft bg-bg-soft/80 px-2 py-1.5"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left text-xs font-medium text-fg transition-colors hover:text-accent disabled:cursor-wait disabled:opacity-70"
                    title={p}
                    disabled={projectLoading}
                    onClick={() => void openRecent(p)}
                  >
                    <span className="flex items-center gap-1.5 font-mono text-[11px]">
                      {recentOpeningPath === p ? <span className="loading-spinner h-3 w-3" aria-hidden /> : null}
                      <span className="truncate">{basenamePath(p)}</span>
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[10px] text-fg-subtle">{p}</span>
                  </button>
                  <button
                    type="button"
                    className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-fg-subtle hover:bg-danger/15 hover:text-danger"
                    title="Remove from recent"
                    onClick={() => {
                      removeRecentProject(p);
                      void useApp.getState().saveSession();
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="mb-4 flex flex-col gap-1 px-0.5 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <h2 className="section-label">Capabilities</h2>
          <span className="text-[11px] leading-relaxed text-fg-subtle sm:text-right">
            Keyboard-first · see Help → Shortcuts
          </span>
        </div>

        <ul className="mb-10 flex list-none flex-col gap-3 p-0">
          {features.map((f) => (
            <li key={f.title}>
              <div className="glass-panel group flex w-full min-w-0 gap-4 rounded-2xl p-4 transition-all duration-layout hover:ring-2 hover:ring-accent/20 sm:p-5">
                <span
                  className="shrink-0 select-none pt-0.5 text-2xl leading-none text-accent/90 transition-transform duration-layout group-hover:scale-105"
                  aria-hidden
                >
                  {f.icon}
                </span>
                <div className="min-w-0 flex-1 text-left">
                  <h3 className="mb-1.5 text-base font-semibold leading-snug text-fg">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-fg-muted">{f.desc}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="rounded-lg border border-border bg-bg-soft px-6 py-2.5 text-sm font-medium text-fg transition-colors duration-layout hover:border-border hover:bg-bg-hover"
            onClick={() => setShowSettings(true)}
          >
            Add API Key
          </button>
          <span className="text-[11px] text-fg-subtle">
            Tip:{' '}
            <kbd className="rounded border border-border-soft bg-bg-deep px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">
              Ctrl+Shift+P
            </kbd>{' '}
            opens commands anywhere
          </span>
        </div>

        <div className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-2 border-t border-border-soft pt-8 text-xs text-fg-subtle">
          <span>
            <kbd className="rounded border border-border-soft bg-bg-deep px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">Ctrl+P</kbd> Quick open
          </span>
          <span>
            <kbd className="rounded border border-border-soft bg-bg-deep px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">Ctrl+Shift+A</kbd> Focus AI
          </span>
          <span>
            <kbd className="rounded border border-border-soft bg-bg-deep px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">Ctrl+S</kbd> Save
          </span>
          <span>
            <kbd className="rounded border border-border-soft bg-bg-deep px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">Ctrl+B</kbd> Sidebar
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

      {cloneOpen && (
        <div
          className="modal-scrim fixed inset-0 z-[100] flex items-center justify-center p-4 ds-transition"
          onClick={() => !cloneBusy && setCloneOpen(false)}
        >
          <div
            className="glass-panel glass-modal-lg w-full max-w-md p-5 ds-transition"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1 text-sm font-semibold text-fg">Clone repository</h3>
            <p className="mb-4 text-[11px] text-fg-muted">Git must be installed and on your PATH.</p>
            {cloneBusy ? (
              <div className="mb-3 flex items-center gap-2 rounded-md border border-accent/25 bg-accent/10 px-3 py-2 text-[11px] text-fg-muted">
                <span className="loading-spinner" aria-hidden />
                <span>Cloning repository and preparing the workspace...</span>
              </div>
            ) : null}
            <label className="mb-2 block text-[11px] font-medium text-fg-muted">Repository URL</label>
            <input
              type="url"
              value={cloneUrl}
              onChange={(e) => setCloneUrl(e.target.value)}
              disabled={cloneBusy}
              placeholder="https://github.com/org/repo.git"
              className="mb-3 w-full rounded-md border border-border bg-bg px-3 py-2 text-xs text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none disabled:cursor-wait disabled:opacity-70"
            />
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-md border border-border-soft bg-bg-soft px-3 py-1.5 text-xs font-medium text-fg hover:bg-bg-hover"
                onClick={() => void pickCloneParent()}
                disabled={cloneBusy}
              >
                Parent folder…
              </button>
              <span className="truncate font-mono text-[10px] text-fg-subtle" title={cloneParent ?? ''}>
                {cloneParent ?? 'None selected'}
              </span>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md px-3 py-1.5 text-xs font-medium text-fg-muted hover:bg-bg-hover"
                disabled={cloneBusy}
                onClick={() => setCloneOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90 disabled:cursor-wait disabled:opacity-50"
                disabled={cloneBusy}
                onClick={() => void runClone()}
              >
                {cloneBusy ? <span className="loading-spinner h-3 w-3 border-white/35 border-t-white" aria-hidden /> : null}
                <span>{cloneBusy ? 'Cloning...' : 'Clone'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {sshOpen && (
        <div
          className="modal-scrim fixed inset-0 z-[100] flex items-center justify-center p-4 ds-transition"
          onClick={() => setSshOpen(false)}
        >
          <div
            className="glass-panel glass-modal-lg w-full max-w-md p-5 ds-transition"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1 text-sm font-semibold text-fg">SSH & port forwarding</h3>
            <p className="mb-4 text-[11px] leading-snug text-fg-muted">
              Compose a command for your host. Use “Run in terminal” to send it to the integrated shell, or copy it.
            </p>
            <label className="mb-1 block text-[11px] font-medium text-fg-muted">Remote</label>
            <input
              value={sshHost}
              onChange={(e) => setSshHost(e.target.value)}
              className="mb-3 w-full rounded-md border border-border bg-bg px-3 py-2 text-xs text-fg focus:border-accent focus:outline-none"
            />
            <div className="mb-3 grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-fg-muted">Local port</label>
                <input
                  value={sshLocalPort}
                  onChange={(e) => setSshLocalPort(e.target.value)}
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-xs text-fg focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-fg-muted">Remote port</label>
                <input
                  value={sshRemotePort}
                  onChange={(e) => setSshRemotePort(e.target.value)}
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-xs text-fg focus:border-accent focus:outline-none"
                />
              </div>
            </div>
            <pre className="mb-4 max-h-24 overflow-auto rounded-md border border-border-soft bg-bg-deep p-2 font-mono text-[10px] text-fg-muted">
              {sshCommand}
            </pre>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-border-soft bg-bg-soft px-3 py-1.5 text-xs font-medium text-fg hover:bg-bg-hover"
                onClick={() => void copySsh()}
              >
                Copy
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90 disabled:cursor-wait disabled:opacity-70"
                onClick={runSshInTerminal}
                disabled={sshSending}
              >
                {sshSending ? <span className="loading-spinner h-3 w-3 border-white/35 border-t-white" aria-hidden /> : null}
                <span>{sshSending ? 'Sending...' : 'Run in terminal'}</span>
              </button>
            </div>
            <button
              type="button"
              className="mt-3 w-full rounded-md px-3 py-1.5 text-xs text-fg-muted hover:bg-bg-hover"
              onClick={() => setSshOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(WelcomePane);
