import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store/appStore';
import { useSettings } from '../store/settingsStore';
import { useTools } from '../store/toolsStore';
import { fetchModels, offlineQueueLength, clearOfflineQueue, retryOfflineQueue, clearCachedModels } from '../lib/openrouterClient';
import { getCompletionRouting, canRefreshModelCatalog } from '../lib/completionRouting';
import { markUserInitiatedUpdateCheck } from '../lib/updateCheckFlow';
import { toast } from './ToastContainer';
import logoIcon from '../assets/logo-icon.png';
import { BUILTIN_MODEL_PROFILES, getModelProfilePreset } from '@shared/modelProfiles';
import type { AppSettings } from '../../shared/types';

type SettingsTabId = 'general' | 'api' | 'models' | 'agent' | 'editor' | 'advanced';

const SETTINGS_TABS: { id: SettingsTabId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'api', label: 'API & integrations' },
  { id: 'models', label: 'Models' },
  { id: 'agent', label: 'Agent' },
  { id: 'editor', label: 'Editor & terminal' },
  { id: 'advanced', label: 'Advanced' },
];

export default function SettingsModal() {
  const open = useApp((s) => s.showSettings);
  const setOpen = useApp((s) => s.setShowSettings);
  const pushLog = useApp((s) => s.pushLog);
  const models = useApp((s) => s.models);
  const setModels = useApp((s) => s.setModels);
  const setModelsLoading = useApp((s) => s.setModelsLoading);
  const modelsLoading = useApp((s) => s.modelsLoading);

  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const loadToolDefinitions = useTools((s) => s.loadDefinitions);

  const [activeTab, setActiveTab] = useState<SettingsTabId>('general');
  const [apiKey, setApiKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [maxTokensDraft, setMaxTokensDraft] = useState(String(settings.maxTokens));
  const [temperatureDraft, setTemperatureDraft] = useState(String(settings.temperature));

  const [auditPreview, setAuditPreview] = useState<string[]>([]);
  const [offlineQueued, setOfflineQueued] = useState(0);
  const [githubDraft, setGithubDraft] = useState('');
  const [linearDraft, setLinearDraft] = useState('');
  const [snippetsJsonDraft, setSnippetsJsonDraft] = useState('[]');
  const [mcpJsonDraft, setMcpJsonDraft] = useState('[]');
  const [templatesJsonDraft, setTemplatesJsonDraft] = useState('[]');
  const [scheduledJsonDraft, setScheduledJsonDraft] = useState('[]');
  const [localOpenAiUrlDraft, setLocalOpenAiUrlDraft] = useState('');
  const [dailyBudgetDraft, setDailyBudgetDraft] = useState('0');
  const [sessionBudgetDraft, setSessionBudgetDraft] = useState('0');

  const freeModels = useMemo(() => models.filter((m) => m.isFree), [models]);

  useEffect(() => {
    if (open) {
      setApiKey(settings.apiKey ?? '');
      setTestResult(null);
      setMaxTokensDraft(String(settings.maxTokens));
      setTemperatureDraft(String(settings.temperature));
      setOfflineQueued(offlineQueueLength());
      setGithubDraft(settings.githubToken ?? '');
      setLinearDraft(settings.linearApiKey ?? '');
      setSnippetsJsonDraft(JSON.stringify(settings.userSnippets ?? [], null, 2));
      setMcpJsonDraft(JSON.stringify(settings.mcpServers ?? [], null, 2));
      setTemplatesJsonDraft(JSON.stringify(settings.taskTemplates ?? [], null, 2));
      setScheduledJsonDraft(JSON.stringify(settings.scheduledTasks ?? [], null, 2));
      setLocalOpenAiUrlDraft(settings.localOpenAiBaseUrl ?? '');
      setDailyBudgetDraft(String(settings.dailyCompletionTokenBudget ?? 0));
      setSessionBudgetDraft(String(settings.sessionCompletionTokenBudget ?? 0));
    }
  }, [
    open,
    settings.apiKey,
    settings.maxTokens,
    settings.temperature,
    settings.githubToken,
    settings.linearApiKey,
    settings.userSnippets,
    settings.mcpServers,
    settings.taskTemplates,
    settings.scheduledTasks,
    settings.localOpenAiBaseUrl,
    settings.dailyCompletionTokenBudget,
    settings.sessionCompletionTokenBudget,
  ]);

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

  const commitLocalOpenAiUrl = () => {
    const trimmed = localOpenAiUrlDraft.trim().replace(/\/+$/, '');
    const next = trimmed || 'http://127.0.0.1:11434/v1';
    setLocalOpenAiUrlDraft(next);
    if (next !== settings.localOpenAiBaseUrl) {
      void update({ localOpenAiBaseUrl: next });
      pushLog('info', 'Local completion base URL saved.');
    }
  };

  const commitDailyBudget = () => {
    const n = Number(dailyBudgetDraft);
    if (!Number.isFinite(n) || n < 0) {
      pushLog('warn', `Invalid daily token budget (${dailyBudgetDraft}); reverting.`);
      setDailyBudgetDraft(String(settings.dailyCompletionTokenBudget));
      return;
    }
    const clamped = Math.min(Math.floor(n), 2_000_000_000);
    setDailyBudgetDraft(String(clamped));
    if (clamped !== settings.dailyCompletionTokenBudget) {
      void update({ dailyCompletionTokenBudget: clamped });
      pushLog('info', `Daily completion token budget = ${clamped || 'off'}`);
    }
  };

  const commitSessionBudget = () => {
    const n = Number(sessionBudgetDraft);
    if (!Number.isFinite(n) || n < 0) {
      pushLog('warn', `Invalid session token budget (${sessionBudgetDraft}); reverting.`);
      setSessionBudgetDraft(String(settings.sessionCompletionTokenBudget));
      return;
    }
    const clamped = Math.min(Math.floor(n), 2_000_000_000);
    setSessionBudgetDraft(String(clamped));
    if (clamped !== settings.sessionCompletionTokenBudget) {
      void update({ sessionCompletionTokenBudget: clamped });
      pushLog('info', `Session completion token budget = ${clamped || 'off'}`);
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
      const routing = getCompletionRouting({ ...settings, apiKey });
      if (routing.openAiBaseUrl) {
        setModelsLoading(true);
        try {
          const fresh = await fetchModels(apiKey.trim(), routing.openAiBaseUrl);
          setTestResult({
            ok: true,
            msg: `Local server reachable — loaded ${fresh.length} model(s).`,
          });
          setModels(fresh);
          pushLog('info', `Fetched ${fresh.length} models from local server.`);
        } catch (e) {
          setTestResult({ ok: false, msg: (e as Error).message });
        } finally {
          setModelsLoading(false);
        }
        return;
      }

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
    <div className="modal-scrim fixed inset-0 z-[201000] flex items-center justify-center p-6 sm:p-10">
      <div className="glass-panel glass-modal-lg flex max-h-[min(92vh,880px)] w-full max-w-3xl flex-col overflow-hidden ds-transition">
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

        <div
          role="tablist"
          aria-label="Settings categories"
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-border-soft bg-bg-soft/35 px-3 py-2"
        >
          {SETTINGS_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              id={`settings-tab-${t.id}`}
              aria-controls={`settings-panel-${t.id}`}
              onClick={() => setActiveTab(t.id)}
              className={
                'whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-layout ' +
                (activeTab === t.id
                  ? 'bg-accent/15 text-accent ring-1 ring-accent/35'
                  : 'text-fg-muted hover:bg-bg-hover hover:text-fg')
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id={`settings-panel-${activeTab}`}
          aria-labelledby={`settings-tab-${activeTab}`}
          className="min-h-0 flex-1 space-y-5 overflow-auto p-4 text-sm"
        >
          {activeTab === 'general' && (
            <>
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

              <section className="rounded-md border border-border-soft bg-bg-soft p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  Updates
                </div>
                <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={settings.autoUpdateEnabled}
                    onChange={(e) => void update({ autoUpdateEnabled: e.target.checked })}
                    className="rounded border-border"
                  />
                  Check for updates when the app starts
                </label>
                <p className="mb-3 text-[10px] text-fg-subtle">
                  Packaged installs only. When your release feed has a newer build, a toast appears with
                  an <span className="font-medium text-fg-muted">Update now</span> button (configure{' '}
                  <code className="text-[10px]">ROUTER_STUDIO_UPDATES_URL</code> for a generic feed, or
                  use your GitHub Releases / electron-builder publish output).
                </p>
                <button
                  type="button"
                  className="rounded-md border border-border bg-bg px-3 py-1.5 text-sm hover:bg-bg-hover"
                  onClick={() => {
                    markUserInitiatedUpdateCheck();
                    void window.api.updates.check().then((res) => {
                      if (res.started) toast.info('Checking for updates…');
                      else if (res.message) toast.info(res.message);
                    });
                  }}
                >
                  Check for updates now
                </button>
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
            </>
          )}

          {activeTab === 'api' && (
            <>
              <section>
                <label className="mb-1 block text-xs font-medium text-fg-muted">
                  OpenRouter API Key
                </label>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-or-v1-…"
                    className="min-w-[12rem] flex-1 rounded-md border border-border bg-bg px-2 py-1 text-sm focus:border-accent focus:outline-none"
                  />
                  <button
                    onClick={save}
                    className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent/80"
                  >
                    Save
                  </button>
                  <button
                    onClick={runTest}
                    disabled={
                      testing ||
                      (settings.aiCompletionProvider === 'local_openai'
                        ? !(settings.localOpenAiBaseUrl ?? '').trim()
                        : !apiKey.trim())
                    }
                    className="rounded-md border border-border px-3 py-1 text-xs text-fg-muted hover:bg-bg-hover hover:text-fg disabled:opacity-40"
                  >
                    {testing
                      ? 'Testing…'
                      : settings.aiCompletionProvider === 'local_openai'
                        ? 'Test local server'
                        : 'Test API Key'}
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

              <section className="rounded-md border border-border-soft bg-bg-soft p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  Integrations (tokens)
                </div>
                <label className="mb-1 block text-[10px] text-fg-muted">GitHub PAT (repo scope for issues)</label>
                <input
                  type="password"
                  value={githubDraft}
                  onChange={(e) => setGithubDraft(e.target.value)}
                  onBlur={() => {
                    if (githubDraft !== (settings.githubToken ?? '')) {
                      void update({ githubToken: githubDraft });
                    }
                  }}
                  className="mb-2 w-full rounded border border-border bg-bg px-2 py-1 font-mono text-xs"
                  placeholder="ghp_…"
                />
                <label className="mb-1 block text-[10px] text-fg-muted">Linear API key</label>
                <input
                  type="password"
                  value={linearDraft}
                  onChange={(e) => setLinearDraft(e.target.value)}
                  onBlur={() => {
                    if (linearDraft !== (settings.linearApiKey ?? '')) {
                      void update({ linearApiKey: linearDraft });
                    }
                  }}
                  className="w-full rounded border border-border bg-bg px-2 py-1 font-mono text-xs"
                  placeholder="lin_api_…"
                />
                <p className="mt-2 text-[10px] text-fg-subtle">
                  Stored in plain settings.json — use a machine profile or keep workspaces private.
                </p>
              </section>

              <section className="rounded-md border border-border-soft bg-bg-soft p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  Webhook (local)
                </div>
                <label className="mb-2 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={settings.webhookListenerEnabled}
                    onChange={(e) =>
                      void update({ webhookListenerEnabled: e.target.checked })
                    }
                  />
                  Listen on localhost for POST /hook
                </label>
                <label className="mb-1 block text-[10px] text-fg-muted">Port</label>
                <input
                  type="number"
                  min={1024}
                  max={65535}
                  value={settings.webhookPort}
                  onChange={(e) => {
                    const n = Math.min(65535, Math.max(1024, Math.floor(Number(e.target.value) || 17373)));
                    void update({ webhookPort: n });
                  }}
                  className="mb-2 w-28 rounded border border-border bg-bg px-2 py-1 text-xs"
                />
                <p className="text-[10px] text-fg-subtle">
                  When enabled: <code className="text-[10px]">curl -X POST http://127.0.0.1:{settings.webhookPort}/hook -d &apos;hi&apos;</code> — body shows as a toast (max 50k).
                </p>
              </section>
            </>
          )}

          {activeTab === 'models' && (
            <>
              <section className="rounded-md border border-border-soft bg-bg-soft p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  Completion API
                </div>
                <p className="mb-2 text-[11px] text-fg-subtle">
                  Chooses where chat, agent loops, and inline AI send{' '}
                  <code className="text-[10px]">/v1/chat/completions</code> requests. With{' '}
                  <strong className="font-medium text-fg-muted">Local OpenAI-compatible</strong>, the app also refreshes the Default Model picker via{' '}
                  <code className="text-[10px]">GET {'{base}'}/models</code>. OpenRouter catalog still loads when an API key is present and this provider is not selected.
                </p>
                <div className="mb-3 flex flex-col gap-1 text-xs">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="completion-provider"
                      checked={settings.aiCompletionProvider === 'openrouter'}
                      onChange={() => void update({ aiCompletionProvider: 'openrouter' })}
                    />
                    OpenRouter
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="completion-provider"
                      checked={settings.aiCompletionProvider === 'local_openai'}
                      onChange={() => void update({ aiCompletionProvider: 'local_openai' })}
                    />
                    Local OpenAI-compatible (Ollama, LM Studio, vLLM, …)
                  </label>
                </div>

                {settings.aiCompletionProvider === 'local_openai' && (
                  <div className="mb-3">
                    <label className="mb-1 block text-xs font-medium text-fg-muted">
                      Base URL{' '}
                      <span className="font-normal text-fg-subtle">(saved: {settings.localOpenAiBaseUrl})</span>
                    </label>
                    <input
                      type="text"
                      spellCheck={false}
                      autoCapitalize="off"
                      autoCorrect="off"
                      value={localOpenAiUrlDraft}
                      onChange={(e) => setLocalOpenAiUrlDraft(e.target.value)}
                      onBlur={commitLocalOpenAiUrl}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      }}
                      placeholder="http://127.0.0.1:11434/v1"
                      className="w-full rounded-md border border-border bg-bg px-2 py-1 font-mono text-sm focus:border-accent focus:outline-none"
                    />
                    <p className="mt-1 text-[10px] text-fg-subtle">
                      Trailing slashes are trimmed; requests go to{' '}
                      <code className="text-[10px]">{'{base}'}/chat/completions</code>. Optional Bearer token uses the same API key field as OpenRouter (leave empty if your server does not require auth).
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-fg-muted">
                      Daily completion token budget{' '}
                      <span className="font-normal text-fg-subtle">(0 = off)</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={dailyBudgetDraft}
                      onChange={(e) => setDailyBudgetDraft(e.target.value)}
                      onBlur={commitDailyBudget}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      }}
                      className="w-full rounded-md border border-border bg-bg px-2 py-1 text-sm focus:border-accent focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-fg-muted">
                      Session token budget{' '}
                      <span className="font-normal text-fg-subtle">(0 = off)</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={sessionBudgetDraft}
                      onChange={(e) => setSessionBudgetDraft(e.target.value)}
                      onBlur={commitSessionBudget}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      }}
                      className="w-full rounded-md border border-border bg-bg px-2 py-1 text-sm focus:border-accent focus:outline-none"
                    />
                  </div>
                </div>
                <p className="mt-2 text-[10px] text-fg-subtle">
                  Budgets use reported completion-token usage when the API returns it; estimates shown in the AI panel are approximate. Daily totals reset at local midnight and persist on this device only.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={
                      modelsLoading || !canRefreshModelCatalog(settings)
                    }
                    onClick={() => {
                      void (async () => {
                        if (!canRefreshModelCatalog(settings)) {
                          pushLog('warn', 'Set a local completion base URL in Settings → Models first.');
                          return;
                        }
                        setModelsLoading(true);
                        try {
                          clearCachedModels();
                          const routing = getCompletionRouting(settings);
                          const fresh = await fetchModels(settings.apiKey ?? '', routing.openAiBaseUrl);
                          setModels(fresh);
                          pushLog(
                            'info',
                            routing.openAiBaseUrl
                              ? `Loaded ${fresh.length} models from local server.`
                              : `Loaded ${fresh.length} models from OpenRouter.`,
                          );
                        } catch (e) {
                          pushLog('error', `Model catalog refresh failed: ${(e as Error).message}`);
                        } finally {
                          setModelsLoading(false);
                        }
                      })();
                    }}
                    className="rounded-md border border-border px-2 py-1 text-xs text-fg-muted hover:bg-bg-hover hover:text-fg disabled:opacity-40"
                  >
                    {modelsLoading ? 'Refreshing…' : 'Refresh model catalog'}
                  </button>
                </div>
              </section>

              <section>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Model profile</label>
                <select
                  value={settings.activeModelProfile ?? 'custom'}
                  onChange={(e) => {
                    const id = e.target.value;
                    if (id === 'custom') {
                      void update({ activeModelProfile: 'custom' });
                      return;
                    }
                    const preset = getModelProfilePreset(id);
                    if (preset) void update({ ...preset.apply, activeModelProfile: id });
                  }}
                  className="w-full rounded-md border border-border bg-bg px-2 py-1 text-sm focus:border-accent focus:outline-none"
                >
                  <option value="custom">Custom (manual)</option>
                  {BUILTIN_MODEL_PROFILES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[10px] text-fg-subtle">
                  {getModelProfilePreset(settings.activeModelProfile)?.summary ??
                    'Presets set Default model and Smart routing fields; switch to Custom after manual edits.'}
                </p>
              </section>

              <section>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Default Model</label>
                <select
                  value={settings.defaultModel}
                  onChange={(e) =>
                    void update({ defaultModel: e.target.value, activeModelProfile: 'custom' })
                  }
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

              <section className="rounded-md border border-border-soft bg-bg-soft p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  Text-to-speech
                </div>
                <p className="mb-2 text-[11px] text-fg-subtle">
                  Powers the <code className="text-[10px]">/tts</code> slash command (OpenRouter{' '}
                  <code className="text-[10px]">POST /api/v1/tts</code>). Saves a downloadable file and shows an
                  inline player. Pick a{' '}
                  <a
                    className="text-accent underline-offset-2 hover:underline"
                    href="https://openrouter.ai/docs/guides/overview/multimodal/tts"
                    target="_blank"
                    rel="noreferrer"
                  >
                    TTS model
                  </a>{' '}
                  and a voice id your provider accepts (for example{' '}
                  <code className="text-[10px]">alloy</code> on OpenAI-style endpoints).
                </p>
                <label className="mb-1 block text-xs font-medium text-fg-muted">
                  TTS model <span className="font-normal text-fg-subtle">(OpenRouter model id)</span>
                </label>
                <input
                  type="text"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  value={settings.openRouterTtsModel}
                  onChange={(e) =>
                    void update({ openRouterTtsModel: e.target.value, activeModelProfile: 'custom' })
                  }
                  placeholder="e.g. openai/tts-1"
                  className="mb-3 w-full rounded-md border border-border bg-bg px-2 py-1 font-mono text-xs focus:border-accent focus:outline-none"
                />
                <label className="mb-1 block text-xs font-medium text-fg-muted">Voice</label>
                <input
                  type="text"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  value={settings.openRouterTtsVoice}
                  onChange={(e) =>
                    void update({ openRouterTtsVoice: e.target.value, activeModelProfile: 'custom' })
                  }
                  placeholder="alloy"
                  className="mb-3 w-full rounded-md border border-border bg-bg px-2 py-1 font-mono text-xs focus:border-accent focus:outline-none"
                />
                <label className="mb-1 block text-xs font-medium text-fg-muted">Download format</label>
                <select
                  value={settings.openRouterTtsFormat}
                  onChange={(e) =>
                    void update({
                      openRouterTtsFormat: e.target.value as AppSettings['openRouterTtsFormat'],
                      activeModelProfile: 'custom',
                    })
                  }
                  className="w-full rounded-md border border-border bg-bg px-2 py-1 text-sm focus:border-accent focus:outline-none"
                >
                  {(['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'] as const).map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </section>

              <section className="rounded-md border border-border-soft bg-bg-soft p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  Video generation
                </div>
                <p className="mb-2 text-[11px] text-fg-subtle">
                  Async jobs via OpenRouter{' '}
                  <code className="text-[10px]">POST /api/v1/videos</code> (submit, poll, then download). Also
                  available from the AI panel <strong>Generate video</strong> bar or{' '}
                  <code className="text-[10px]">/video</code> in chat. See{' '}
                  <a
                    className="text-accent underline-offset-2 hover:underline"
                    href="https://openrouter.ai/docs/guides/overview/multimodal/video-generation"
                    target="_blank"
                    rel="noreferrer"
                  >
                    video generation docs
                  </a>
                  .
                </p>
                <label className="mb-1 block text-xs font-medium text-fg-muted">
                  Video model <span className="font-normal text-fg-subtle">(empty = infer from Default)</span>
                </label>
                <select
                  value={settings.openRouterVideoModel}
                  onChange={(e) =>
                    void update({
                      openRouterVideoModel: e.target.value,
                      activeModelProfile: 'custom',
                    })
                  }
                  className="mb-2 w-full rounded-md border border-border bg-bg px-2 py-1 text-sm focus:border-accent focus:outline-none"
                >
                  <option value="">Auto (from default / free rules)</option>
                  {models
                    .filter(
                      (m) =>
                        m.categories.includes('video-gen') || m.outputModalities.includes('video'),
                    )
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} — {m.id}
                      </option>
                    ))}
                </select>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Aspect ratio</label>
                <select
                  value={settings.openRouterVideoAspectRatio}
                  onChange={(e) =>
                    void update({
                      openRouterVideoAspectRatio: e.target.value,
                      activeModelProfile: 'custom',
                    })
                  }
                  className="mb-2 w-full rounded-md border border-border bg-bg px-2 py-1 text-sm focus:border-accent focus:outline-none"
                >
                  {(['', '16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21'] as const).map((o) => (
                    <option key={o || 'def'} value={o}>
                      {o ? o : 'Default (API)'}
                    </option>
                  ))}
                </select>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Resolution</label>
                <select
                  value={settings.openRouterVideoResolution}
                  onChange={(e) =>
                    void update({
                      openRouterVideoResolution: e.target.value,
                      activeModelProfile: 'custom',
                    })
                  }
                  className="mb-2 w-full rounded-md border border-border bg-bg px-2 py-1 text-sm focus:border-accent focus:outline-none"
                >
                  {(['', '480p', '720p', '1080p', '1K', '2K', '4K'] as const).map((o) => (
                    <option key={o || 'def'} value={o}>
                      {o ? o : 'Default (API)'}
                    </option>
                  ))}
                </select>
                <label className="mb-1 block text-xs font-medium text-fg-muted">
                  Generated audio (<code className="text-[10px]">generate_audio</code>)
                </label>
                <select
                  value={settings.openRouterVideoAudio}
                  onChange={(e) =>
                    void update({
                      openRouterVideoAudio: e.target.value as AppSettings['openRouterVideoAudio'],
                      activeModelProfile: 'custom',
                    })
                  }
                  className="w-full rounded-md border border-border bg-bg px-2 py-1 text-sm focus:border-accent focus:outline-none"
                >
                  <option value="auto">Auto — omit field (many Veo models default to synced audio)</option>
                  <option value="on">Always on — sends true</option>
                  <option value="off">Silent — sends false (/video & modal default picker)</option>
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

              <section>
                <label className="mb-1 block text-xs font-medium text-fg-muted">
                  Fallback chain (extra models)
                </label>
                <textarea
                  rows={4}
                  value={settings.completionFallbackModels.join('\n')}
                  onChange={(e) =>
                    void update({
                      completionFallbackModels: e.target.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean),
                      activeModelProfile: 'custom',
                    })
                  }
                  spellCheck={false}
                  placeholder={'One OpenRouter/model id per line, tried after failures from the dropdown fallback above.'}
                  className="w-full resize-y rounded-md border border-border bg-bg px-2 py-1 font-mono text-[11px] text-fg focus:border-accent focus:outline-none"
                />
                <p className="mt-1 text-[10px] text-fg-subtle">
                  Used after the primary model fails (same order alongside Free Router / cycling). Agent tool hops use
                  this list per round.
                </p>
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
                  Include compact project tree in context (optional — tools can read files directly)
                </label>
              </section>
            </>
          )}

          {activeTab === 'agent' && (
            <>
              <section className="flex flex-col gap-1 text-xs">
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
                  Codebase search (agent tools)
                </div>
                <label className="mb-2 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={settings.semanticSearchEmbedRerank}
                    onChange={(e) =>
                      void update({
                        semanticSearchEmbedRerank: e.target.checked,
                      })
                    }
                  />
                  {settings.aiCompletionProvider === 'local_openai'
                    ? 'Use local embeddings to rerank BM25 hits (semantic_search)'
                    : 'Use OpenRouter embeddings to rerank BM25 hits (semantic_search)'}
                </label>
                <label className="mb-1 block text-xs font-medium text-fg-muted">
                  Embedding model id
                  <span className="ml-1 font-normal text-fg-subtle">
                    {settings.aiCompletionProvider === 'local_openai'
                      ? '(local `POST /v1/embeddings` — e.g. nomic-embed-text on Ollama)'
                      : '(OpenRouter `/v1/embeddings`)'}
                  </span>
                </label>
                <input
                  type="text"
                  spellCheck={false}
                  value={settings.embeddingOpenRouterModel}
                  onChange={(e) => void update({ embeddingOpenRouterModel: e.target.value })}
                  placeholder="openai/text-embedding-3-small"
                  className="w-full rounded-md border border-border bg-bg px-2 py-1 font-mono text-xs focus:border-accent focus:outline-none"
                />
              </section>

              <section className="rounded-md border border-border-soft bg-bg-soft p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">Agent Mode</div>
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
                  <div className="mb-2 text-[11px] font-semibold text-fg-muted">Smart tool routing</div>
                  <label className="mb-2 flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={settings.smartAgentRouting}
                      onChange={(e) =>
                        void update({
                          smartAgentRouting: e.target.checked,
                          activeModelProfile: 'custom',
                        })
                      }
                    />
                    Use a cheaper model for the first tool-planning hop, then a stronger model after tools
                  </label>
                  <p className="mb-2 text-[10px] text-fg-subtle">
                    Applies only when tool calling runs in chat. First hop uses the read model; later hops
                    (after tool results) use the reasoning model. Leave fields blank to use your default model.
                  </p>
                  <label className="mb-1 block text-xs font-medium text-fg-muted">
                    Read / planning model (first hop)
                  </label>
                  <input
                    type="text"
                    value={settings.agentReadModel}
                    placeholder={settings.defaultModel || 'e.g. openrouter/auto'}
                    onChange={(e) =>
                      void update({ agentReadModel: e.target.value, activeModelProfile: 'custom' })
                    }
                    className="mb-2 w-full rounded-md border border-border bg-bg px-2 py-1 font-mono text-xs focus:border-accent focus:outline-none"
                  />
                  <label className="mb-1 block text-xs font-medium text-fg-muted">
                    Reasoning model (after tools)
                  </label>
                  <input
                    type="text"
                    value={settings.agentReasoningModel}
                    placeholder={settings.defaultModel || 'e.g. anthropic/claude-3.5-sonnet'}
                    onChange={(e) =>
                      void update({
                        agentReasoningModel: e.target.value,
                        activeModelProfile: 'custom',
                      })
                    }
                    className="w-full rounded-md border border-border bg-bg px-2 py-1 font-mono text-xs focus:border-accent focus:outline-none"
                  />
                  <label className="mt-3 flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={settings.agentReflectionPass}
                      onChange={(e) => void update({ agentReflectionPass: e.target.checked })}
                    />
                    Reflection pass after tool-using replies (extra API call)
                  </label>
                  <p className="mt-1 text-[10px] text-fg-subtle">
                    Runs a short self-critique on the final assistant text when tools were used this turn.
                  </p>
                </div>
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
                  <div className="mt-3 space-y-2 border-t border-border-soft pt-3">
                    <div className="text-[11px] font-semibold text-fg-muted">Shell deny list (regex)</div>
                    <p className="text-[10px] text-fg-subtle">
                      One JavaScript regexp per line. If any pattern matches the full command string,{' '}
                      <code className="text-[10px]">run_shell</code> is blocked.
                    </p>
                    <textarea
                      value={(settings.shellDenylist ?? []).join('\n')}
                      onChange={(e) =>
                        void update({
                          shellDenylist: e.target.value
                            .split('\n')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      rows={4}
                      className="w-full rounded-md border border-border bg-bg px-2 py-1 font-mono text-[11px] focus:border-accent focus:outline-none"
                      placeholder="curl\\s.*\\|\\s*bash"
                    />
                  </div>
                  <div className="mt-3 space-y-2 border-t border-border-soft pt-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={settings.agentWriteDenyDefault}
                        onChange={(e) => void update({ agentWriteDenyDefault: e.target.checked })}
                      />
                      Deny-by-default for agent writes (only allow paths below)
                    </label>
                    <p className="text-[10px] text-fg-subtle">
                      When enabled, <code className="text-[10px]">write_file</code>,{' '}
                      <code className="text-[10px]">edit_file</code>, <code className="text-[10px]">create_file</code>,{' '}
                      <code className="text-[10px]">rename_file</code>, and{' '}
                      <code className="text-[10px]">delete_file</code> must match at least one entry in the{' '}
                      <strong>write allow paths</strong> list configured for tools. Leave deny-by-default off until you configure allow globs.
                    </p>
                    <div className="text-[11px] font-semibold text-fg-muted">Write deny globs</div>
                    <p className="text-[10px] text-fg-subtle">
                      One path glob per line (e.g. <code className="text-[10px]">.env*</code>, <code className="text-[10px]">**/secrets/**</code>). Always blocked before allow rules.
                    </p>
                    <textarea
                      value={(settings.writeDenyPaths ?? []).join('\n')}
                      onChange={(e) =>
                        void update({
                          writeDenyPaths: e.target.value
                            .split('\n')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      rows={3}
                      className="w-full rounded-md border border-border bg-bg px-2 py-1 font-mono text-[11px] focus:border-accent focus:outline-none"
                    />
                  </div>
                </div>
              </section>
            </>
          )}

          {activeTab === 'editor' && (
            <>
              <section className="flex flex-col gap-1 text-xs">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.formatOnSave}
                    onChange={(e) => void update({ formatOnSave: e.target.checked })}
                  />
                  Format on save (Monaco built-in: JSON, HTML, CSS, TS/JS)
                </label>
              </section>

              <section className="flex flex-col gap-2 text-xs">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.editor.typescriptLanguageServer}
                    onChange={(e) =>
                      void update({
                        editor: { ...settings.editor, typescriptLanguageServer: e.target.checked },
                      })
                    }
                  />
                  TypeScript / JavaScript language server · hover + Problems merge
                  <span className="font-normal text-fg-subtle">(npx typescript-language-server)</span>
                </label>
              </section>

              <section className="rounded-md border border-border-soft bg-bg-soft p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  Editor — AI ghost text
                </div>
                <label className="mb-2 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={settings.editor.ghostTextEnabled}
                    onChange={(e) =>
                      void update({
                        editor: { ...settings.editor, ghostTextEnabled: e.target.checked },
                      })
                    }
                  />
                  Inline ghost completions (OpenRouter · optional cheap model below)
                </label>
                <p className="mb-2 text-[10px] text-fg-subtle">
                  Debounced, rate-limited FIM-style suggestions at the cursor. Expect small API usage while typing.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-0.5 block text-[10px] text-fg-muted">Debounce (ms)</label>
                    <input
                      type="number"
                      min={100}
                      max={5000}
                      value={settings.editor.ghostTextDebounceMs}
                      onChange={(e) =>
                        void update({
                          editor: {
                            ...settings.editor,
                            ghostTextDebounceMs: Math.max(100, Number(e.target.value) || 450),
                          },
                        })
                      }
                      className="w-full rounded border border-border bg-bg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] text-fg-muted">Cooldown (ms)</label>
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      value={settings.editor.ghostTextCooldownMs}
                      onChange={(e) =>
                        void update({
                          editor: {
                            ...settings.editor,
                            ghostTextCooldownMs: Math.max(0, Number(e.target.value) || 1200),
                          },
                        })
                      }
                      className="w-full rounded border border-border bg-bg px-2 py-1 text-xs"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="mb-0.5 block text-[10px] text-fg-muted">
                    Ghost completion model{' '}
                    <span className="font-normal text-fg-subtle">(blank = default chat model)</span>
                  </label>
                  <input
                    type="text"
                    spellCheck={false}
                    placeholder="e.g. openai/gpt-4o-mini"
                    value={settings.editor.ghostTextCompletionModel}
                    onChange={(e) =>
                      void update({
                        editor: {
                          ...settings.editor,
                          ghostTextCompletionModel: e.target.value,
                        },
                      })
                    }
                    className="w-full rounded border border-border bg-bg px-2 py-1 font-mono text-[11px]"
                  />
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
                  Editor — user snippets (JSON)
                </div>
                <textarea
                  value={snippetsJsonDraft}
                  onChange={(e) => setSnippetsJsonDraft(e.target.value)}
                  onBlur={() => {
                    try {
                      const v = JSON.parse(snippetsJsonDraft) as unknown;
                      if (!Array.isArray(v)) throw new Error('Expected array');
                      void update({ userSnippets: v as typeof settings.userSnippets });
                    } catch (e) {
                      pushLog('warn', `Snippets JSON invalid: ${(e as Error).message}`);
                    }
                  }}
                  rows={6}
                  className="w-full rounded border border-border bg-bg px-2 py-1 font-mono text-[11px]"
                />
              </section>
            </>
          )}

          {activeTab === 'advanced' && (
            <>
              <section className="rounded-md border border-border-soft bg-bg-soft p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  AI panel — voice input
                </div>
                <label className="mb-2 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={settings.voiceInputEnabled}
                    onChange={(e) => void update({ voiceInputEnabled: e.target.checked })}
                  />
                  Show microphone (Web Speech API) next to the chat input
                </label>
                <p className="text-[10px] text-fg-subtle">
                  Browser speech recognition sends audio to the vendor (e.g. Google) unless disabled at OS level.
                </p>
              </section>

              <section className="rounded-md border border-border-soft bg-bg-soft p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  MCP registry (JSON)
                </div>
                <textarea
                  value={mcpJsonDraft}
                  onChange={(e) => setMcpJsonDraft(e.target.value)}
                  onBlur={() => {
                    try {
                      const v = JSON.parse(mcpJsonDraft) as unknown;
                      if (!Array.isArray(v)) throw new Error('Expected array');
                      void update({ mcpServers: v as typeof settings.mcpServers });
                    } catch (e) {
                      pushLog('warn', `MCP JSON invalid: ${(e as Error).message}`);
                    }
                  }}
                  rows={5}
                  className="w-full rounded border border-border bg-bg px-2 py-1 font-mono text-[11px]"
                  placeholder='[{"id":"1","name":"…","command":"npx","args":["-y","mcp-server"]}]'
                />
              </section>

              <section className="rounded-md border border-border-soft bg-bg-soft p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  Task templates (JSON)
                </div>
                <textarea
                  value={templatesJsonDraft}
                  onChange={(e) => setTemplatesJsonDraft(e.target.value)}
                  onBlur={() => {
                    try {
                      const v = JSON.parse(templatesJsonDraft) as unknown;
                      if (!Array.isArray(v)) throw new Error('Expected array');
                      void update({ taskTemplates: v as typeof settings.taskTemplates });
                    } catch (e) {
                      pushLog('warn', `Templates JSON invalid: ${(e as Error).message}`);
                    }
                  }}
                  rows={4}
                  className="w-full rounded border border-border bg-bg px-2 py-1 font-mono text-[11px]"
                  placeholder='[{"id":"a","title":"Lint pass","prompt":"Run lints and summarize."}]'
                />
              </section>

              <section className="rounded-md border border-border-soft bg-bg-soft p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  Scheduled reminders (JSON)
                </div>
                <p className="mb-2 text-[10px] text-fg-subtle">
                  Fired from the main process every minute. Each enabled task pops a toast with its prompt.
                </p>
                <textarea
                  value={scheduledJsonDraft}
                  onChange={(e) => setScheduledJsonDraft(e.target.value)}
                  onBlur={() => {
                    try {
                      const v = JSON.parse(scheduledJsonDraft) as unknown;
                      if (!Array.isArray(v)) throw new Error('Expected array');
                      void update({ scheduledTasks: v as typeof settings.scheduledTasks });
                    } catch (e) {
                      pushLog('warn', `Scheduled tasks JSON invalid: ${(e as Error).message}`);
                    }
                  }}
                  rows={5}
                  className="w-full rounded border border-border bg-bg px-2 py-1 font-mono text-[11px]"
                  placeholder='[{"id":"1","title":"Standup","intervalMinutes":60,"prompt":"Review blockers","lastRunAt":null,"enabled":true}]'
                />
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
