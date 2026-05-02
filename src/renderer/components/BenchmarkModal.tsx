import { useMemo, useState } from 'react';
import { useApp } from '../store/appStore';
import { useSettings } from '../store/settingsStore';
import logoIcon from '../assets/logo-icon.png';

/**
 * Simple latency probe: one non-streaming completion and elapsed ms.
 */
export default function BenchmarkModal() {
  const open = useApp((s) => s.showBenchmark);
  const setOpen = useApp((s) => s.setShowBenchmark);
  const models = useApp((s) => s.models);
  const settings = useSettings((s) => s.settings);

  const [model, setModel] = useState('');
  const [prompt, setPrompt] = useState('Reply with exactly: pong');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ ms: number; reply: string; usage?: string } | null>(null);

  const modelOptions = useMemo(() => {
    const m = model || settings.defaultModel;
    return { effective: m };
  }, [model, settings.defaultModel]);

  if (!open) return null;

  const run = async () => {
    const id = modelOptions.effective;
    if (!settings.apiKey?.trim()) return;
    setBusy(true);
    setLast(null);
    const t0 = performance.now();
    try {
      const r = await window.api.openrouter.chat({
        apiKey: settings.apiKey,
        model: id,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        maxTokens: 64,
        temperature: 0,
      });
      const ms = Math.round(performance.now() - t0);
      const usage = r.usage
        ? `in ${r.usage.prompt_tokens ?? '?'} / out ${r.usage.completion_tokens ?? '?'}`
        : undefined;
      setLast({ ms, reply: r.content.slice(0, 2000), usage });
    } catch (e) {
      setLast({ ms: Math.round(performance.now() - t0), reply: `Error: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-scrim fixed inset-0 z-40 flex items-center justify-center p-6">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-bg-soft shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="brand-mark-icon-wrap">
              <img src={logoIcon} alt="" className="h-7 w-7 shrink-0 select-none" draggable={false} />
            </span>
            <div className="truncate text-sm font-semibold text-fg">Model benchmark</div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md border border-border px-2 py-1 text-xs text-fg-muted hover:bg-bg-hover hover:text-fg"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4 text-sm">
          <label className="block text-xs font-medium text-fg-muted">Model</label>
          <select
            value={model || settings.defaultModel}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-md border border-border bg-bg px-2 py-1 text-sm"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
            {models.length === 0 && (
              <option value={settings.defaultModel}>{settings.defaultModel}</option>
            )}
          </select>
          <label className="block text-xs font-medium text-fg-muted">Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-border bg-bg px-2 py-1 text-sm"
          />
          <button
            type="button"
            disabled={busy || !settings.apiKey}
            onClick={() => void run()}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-40"
          >
            {busy ? 'Running…' : 'Run once'}
          </button>
          {!settings.apiKey && (
            <p className="text-xs text-danger">Add an OpenRouter API key in Settings first.</p>
          )}
          {last && (
            <div className="rounded-md border border-border-soft bg-bg p-3 text-xs">
              <div className="mb-1 font-medium text-fg">
                {last.ms} ms {last.usage ? `· ${last.usage}` : ''}
              </div>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-mono text-fg-muted">
                {last.reply}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
