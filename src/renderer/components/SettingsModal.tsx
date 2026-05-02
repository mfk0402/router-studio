import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store/appStore';
import { useSettings } from '../store/settingsStore';
import { useTools } from '../store/toolsStore';
import { fetchModels, offlineQueueLength, clearOfflineQueue, retryOfflineQueue } from '../lib/openrouterClient';
import logoIcon from '../assets/logo-icon.png';

export default function SettingsModal() {
  const open = useApp((s) => s.showSettings);
  const setOpen = useApp((s) => s.setShowSettings);
  const pushLog = useApp((s) => s.pushLog);
  const models = useApp((s) => s.models);
  const setModels = useApp((s) => s.setModels);
  const setModelsLoading = useApp((s) => s.setModelsLoading);

  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const loadToolDefinitions = useTools((s) => s.loadDefinitions);

  const [apiKey, setApiKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Local draft state for numeric inputs. Updates only commit to storage on
  // blur / Enter, which avoids a race: typing "2500" would otherwise fire
  // five IPC writes, and late-arriving responses can overwrite newer values.
  const [maxTokensDraft, setMaxTokensDraft] = useState(String(settings.maxTokens));
  const [temperatureDraft, setTemperatureDraft] = useState(String(settings.temperature));

  const [auditPreview, setAuditPreview] = useState<string[]>([]);
  const [offlineQueued, setOfflineQueued] = useState(0);

  const freeModels = useMemo(() => models.filter((m) => m.isFree), [models]);

  useEffect(() => {
    if (open) {
      setApiKey(settings.apiKey ?? '');
      setTestResult(null);
      setMaxTokensDraft(String(settings.maxTokens));
      setTemperatureDraft(String(settings.temperature));
      setOfflineQueued(offlineQueueLength());
    }
  }, [open, settings.apiKey, settings.maxTokens, settings.temperature]);

  const commitMaxTokens = () => {
    const n = Number(maxTokensDraft);
    if (!Number.isFinite(n) || n < 64) {
      pushLog('warn', `Invalid max tokens (${maxTokensDraft}); reverting.`);
      setMaxTokensDraft(String(settings.maxTokens));
      return;
    }
    const clamped = Math.min(Math.max(64, Math.floor(n)), 32000);
    setMaxTokensDraft(String(clamped));
    if (clamped !== settings.maxTokens) {
      void update({ maxTokens: clamped });
      pushLog('info', `maxTokens = ${clamped}`);
    }
  };

  const commitTemperature = () => {
    const n = Number(temperatureDraft);
    if (!Number.isFinite(n)) {
      pushLog('warn', `Invalid temperature (${temperatureDraft}); reverting.`);
      setTemperatureDraft(String(settings.temperature));
      return;
    }
    const clamped = Math.min(Math.max(0, n), 2);
    setTemperatureDraft(String(clamped));
    if (clamped !== settings.temperature) {
      void update({ temperature: clamped });
      pushLog('info', `temperature = ${clamped}`);
    }
  };

  if (!open) return null;

  const save = async () => {
    await update({ apiKey });
    pushLog('info', 'Settings saved.');
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await window.api.openrouter.testKey(apiKey);
      if (result.ok) {
        setTestResult({ ok: true, msg: 'Connected to OpenRouter.' });
        setModelsLoading(true);
        try {
          const fresh = await fetchModels(apiKey);
          setModels(fresh);
          pushLog('info', `Fetched ${fresh.length} models.`);
        } finally {
          setModelsLoading(false);
        }
      } else {
        setTestResult({ ok: false, msg: result.error ?? 'Unknown error' });
      }
    } catch (e) {
      setTestResult({ ok: false, msg: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="modal-scrim fixed inset-0 z-40 flex items-center justify-center p-10">
      <div className="flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-bg-soft shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="brand-mark-icon-wrap">
              <img
                src={logoIcon}
                alt=""
                className="h-7 w-7 shrink-0 select-none"
                draggable={false}
              />
            </span>
            <div className="truncate text-sm font-semibold text-fg">Settings</div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="rounded-md border border-border px-2 py-1 text-xs text-fg-muted hover:bg-bg-hover hover:text-fg"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-auto p-4 text-sm">
          <section>
            <label className="mb-1 block text-xs font-medium text-fg-muted">
              OpenRouter API Key
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-or-v1-…"
                className="flex-1 rounded-md border border-border bg-bg px-2 py-1 text-sm focus:border-accent focus:outline-none"
              />
              <button
                onClick={save}
                className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent/80"
              >
                Save
              </button>
              <button
                onClick={runTest}
                disabled={testing || !apiKey.trim()}
                className="rounded-md border border-border px-3 py-1 text-xs text-fg-muted hover:bg-bg-hover hover:text-fg disabled:opacity-40"
              >
                {testing ? 'Testing…' : 'Test API Key'}
              </button>
            </div>
            {testResult && (
              <div
                className={`mt-2 text-xs ${testResult.ok ? 'text-success' : 'text-danger'}`}
              >
                {testResult.msg}
              </div>
            )}
            <p className="mt-2 text-[11px] text-fg-subtle">
              Stored locally via Electron safeStorage (OS keychain/DPAPI) when available. The key
              is never transmitted except to OpenRouter on your AI requests.
            </p>
          </section>

          <section>
            <label className="mb-1 block text-xs font-medium text-fg-muted">Default Model</label>
            <select
              value={settings.defaultModel}
              onChange={(e) => void update({ defaultModel: e.target.value })}
              className="w-full rounded-md border border-border bg-bg px-2 py-1 text-sm focus:border-accent focus:outline-none"
            >
              {models.length === 0 && (
                <option value={settings.defaultModel}>{settings.defaultModel}</option>
              )}
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} — {m.id}
                </option>
              ))}
            </select>
          </section>

          <section>
            <label className="mb-1 block text-xs font-medium text-fg-muted">
              Free Mode Strategy
            </label>
            <div className="flex flex-col gap-1 text-xs">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="fms"
                  checked={settings.freeModeStrategy === 'router'}
                  onChange={() => void update({ freeModeStrategy: 'router' })}
                />
                OpenRouter Free Router (openrouter/free)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="fms"
                  checked={settings.freeModeStrategy === 'cycle'}
                  onChange={() => void update({ freeModeStrategy: 'cycle' })}
                />
                Cycle Discovered Free Models ({freeModels.length} detected)
              </label>
            </div>
          </section>

          <section>
            <label className="mb-1 block text-xs font-medium text-fg-muted">
              Fallback Model (on failure)
            </label>
            <select
              value={settings.fallbackModel}
              onChange={(e) => void update({ fallbackModel: e.target.value })}
              className="w-full rounded-md border border-border bg-bg px-2 py-1 text-sm focus:border-accent focus:outline-none"
            >
              <option value="">— none —</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} — {m.id}
                </option>
              ))}
            </select>
          </section>

          <section className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">
                Max Tokens{' '}
                <span className="font-normal text-fg-subtle">
                  (saved: {settings.maxTokens})
                </span>
              </label>
              <input
                type="number"
                min={64}
                max={32000}
                value={maxTokensDraft}
                onChange={(e) => setMaxTokensDraft(e.target.value)}
                onBlur={commitMaxTokens}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                className="w-full rounded-md border border-border bg-bg px-2 py-1 text-sm focus:border-accent focus:outline-none"
              />
              <p className="mt-1 text-[10px] text-fg-subtle">
                Press Enter or click out to save.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">
                Temperature{' '}
                <span className="font-normal text-fg-subtle">
                  (saved: {settings.temperature})
                </span>
              </label>
              <input
                type="number"
                step={0.1}
                min={0}
                max={2}
                value={temperatureDraft}
                onChange={(e) => setTemperatureDraft(e.target.value)}
                onBlur={commitTemperature}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                className="w-full rounded-md border border-border bg-bg px-2 py-1 text-sm focus:border-accent focus:outline-none"
              />
              <p className="mt-1 text-[10px] text-fg-subtle">
                Press Enter or click out to save.
              </p>
            </div>
          </section>

          <section className="flex flex-col gap-1 text-xs">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.streaming}
                onChange={(e) => void update({ streaming: e.target.checked })}
              />
              Enable streaming responses
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.includeFullFile}
                onChange={(e) => void update({ includeFullFile: e.target.checked })}
              />
              Include full file in context by default
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.includeProjectTree}
                onChange={(e) => void update({ includeProjectTree: e.target.checked })}
              />
              Include project tree in context by default
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.formatOnSave}
                onChange={(e) => void update({ formatOnSave: e.target.checked })}
              />
              Format on save (Monaco built-in: JSON, HTML, CSS, TS/JS)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.confirmBeforeRun}
                onChange={(e) => void update({ confirmBeforeRun: e.target.checked })}
              />
              Confirm before running AI-proposed terminal commands
            </label>
          </section>

          <section className="rounded-md border border-border-soft bg-bg-soft p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
              Agent Mode
            </div>
            <label className="mb-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.agentMode}
                onChange={(e) => void update({ agentMode: e.target.checked })}
              />
              Enable Agent Mode by default
            </label>
            <p className="mb-2 text-[11px] text-fg-subtle">
              In Agent Mode the assistant runs as a multi-turn task. It must end every response
              with one of <code>[[TASK_COMPLETE]]</code>, <code>[[CONTINUE]]</code>,{' '}
              <code>[[BLOCKED: reason]]</code>, or <code>[[ERROR: reason]]</code>. The app
              auto-continues on <code>[[CONTINUE]]</code> until the task finishes or hits the
              iteration limit. Task state is saved to disk so you can resume if something breaks.
              Make sure the built-in <strong>"Agent Discipline"</strong> rule stays enabled.
            </p>
            <label className="mb-1 block text-xs font-medium text-fg-muted">
              Max auto-continue iterations
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={settings.maxAgentIterations}
              onChange={(e) => {
                const n = Math.max(1, Math.min(100, Math.floor(Number(e.target.value) || 15)));
                void update({ maxAgentIterations: n });
              }}
              className="w-28 rounded-md border border-border bg-bg px-2 py-1 text-sm focus:border-accent focus:outline-none"
            />
            <p className="mt-1 text-[10px] text-fg-subtle">
              The task pauses at this limit so a runaway model can't burn through your credits.
            </p>
            <div className="mt-3 border-t border-border-soft pt-3">
              <div className="mb-2 text-[11px] font-semibold text-fg-muted">Agent safety</div>
              <label className="mb-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.agentSandboxMode}
                  onChange={(e) => {
                    const v = e.target.checked;
                    void update({ agentSandboxMode: v }).then(() => loadToolDefinitions());
                  }}
                />
                Sandbox (read-only agent tools)
              </label>
              <p className="mb-2 text-[10px] text-fg-subtle">
                Removes file writes, shell, git stage/commit, tests, and memory writes from the tool catalog.
                The <code className="text-[10px]">git_branch</code> tool stays available for{' '}
                <strong>list</strong> only; checkout/create/delete are blocked at runtime.
              </p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.agentDryRunMode}
                  onChange={(e) => void update({ agentDryRunMode: e.target.checked })}
                />
                Dry-run mutating tools (simulate only)
              </label>
              <p className="mt-1 text-[10px] text-fg-subtle">
                Mutating calls return JSON with <code className="text-[10px]">dry_run: true</code> and do not touch disk or run commands. Combine with sandbox for exploration without surprises.
              </p>
            </div>
          </section>

          <section>
            <label className="mb-1 block text-xs font-medium text-fg-muted">
              Default Shell
              <span className="ml-1 font-normal text-fg-subtle">(blank = auto-detect)</span>
            </label>
            <input
              type="text"
              value={settings.defaultShell}
              onChange={(e) => void update({ defaultShell: e.target.value })}
              placeholder="e.g. powershell.exe, /bin/bash, /bin/zsh"
              className="w-full rounded-md border border-border bg-bg px-2 py-1 text-sm focus:border-accent focus:outline-none"
            />
            <p className="mt-1 text-[10px] text-fg-subtle">
              Affects the embedded Terminal. The path must exist on your system.
            </p>
          </section>

          <section className="rounded-md border border-border-soft bg-bg-soft p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
              Privacy & reliability
            </div>
            <p className="mb-2 text-[11px] text-fg-subtle">
              Logs apply best-effort secret redaction. Tool executions are appended to a local JSONL
              file (append-only) under your user data directory — nothing is uploaded.
            </p>
            <div className="mb-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-md border border-border px-2 py-1 text-xs hover:bg-bg-hover"
                onClick={async () => {
                  try {
                    const lines = await window.api.audit.tailLines(40);
                    setAuditPreview(lines);
                  } catch (e) {
                    pushLog('error', `Audit load failed: ${(e as Error).message}`);
                  }
                }}
              >
                Load recent audit entries
              </button>
              <button
                type="button"
                className="rounded-md border border-border px-2 py-1 text-xs hover:bg-bg-hover"
                onClick={async () => {
                  try {
                    const p = await window.api.audit.getFilePath();
                    await navigator.clipboard.writeText(p);
                    pushLog('info', 'Audit log path copied to clipboard.');
                  } catch (e) {
                    pushLog('error', (e as Error).message);
                  }
                }}
              >
                Copy audit log path
              </button>
            </div>
            {auditPreview.length > 0 && (
              <pre className="mb-3 max-h-36 overflow-auto rounded border border-border bg-bg p-2 font-mono text-[10px] text-fg-muted">
                {auditPreview.join('\n')}
              </pre>
            )}
            <div className="border-t border-border-soft pt-3">
              <div className="mb-1 text-[11px] text-fg-muted">
                Offline queue:{' '}
                <span className="font-medium text-fg">{offlineQueued}</span> request(s) saved after
                network failures (API key is not stored in the queue).
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!settings.apiKey || offlineQueued === 0}
                  className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-40"
                  onClick={async () => {
                    try {
                      const r = await retryOfflineQueue(settings.apiKey);
                      pushLog(
                        'info',
                        `Retried offline queue: ${r.succeeded}/${r.attempted} succeeded.`,
                      );
                      setOfflineQueued(offlineQueueLength());
                    } catch (e) {
                      pushLog('error', (e as Error).message);
                    }
                  }}
                >
                  Retry queued completions
                </button>
                <button
                  type="button"
                  disabled={offlineQueued === 0}
                  className="rounded-md border border-border px-2 py-1 text-xs hover:bg-bg-hover disabled:opacity-40"
                  onClick={() => {
                    clearOfflineQueue();
                    setOfflineQueued(0);
                    pushLog('info', 'Cleared offline completion queue.');
                  }}
                >
                  Clear queue
                </button>
              </div>
            </div>
          </section>

          <section>
            <label className="mb-1 block text-xs font-medium text-fg-muted">Theme</label>
            <select
              value={settings.theme}
              onChange={(e) =>
                void update({ theme: e.target.value as 'dark' | 'light' | 'system' })
              }
              className="w-full rounded-md border border-border bg-bg px-2 py-1 text-sm focus:border-accent focus:outline-none"
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="system">System</option>
            </select>
            <p className="mt-1 text-[11px] text-fg-subtle">
              Applies to the whole UI, Monaco (vs-dark / vs-light), and the integrated terminal.
              System follows your OS appearance.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
