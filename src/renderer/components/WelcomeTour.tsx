import { useState } from 'react';
import { useSettings } from '../store/settingsStore';
import { useApp } from '../store/appStore';
import logoIcon from '../assets/logo-icon.png';

const STEPS = [
  {
    title: 'Workspace',
    body: 'Open a folder from Explorer or the welcome screen. Files stay on disk — Router Studio edits through a safe IPC layer.',
  },
  {
    title: 'Editor',
    body: 'Edit code with Monaco. Try Ctrl+K for inline AI edits and Ctrl+. for quick code actions.',
  },
  {
    title: 'Models',
    body:
      'Open the Model Marketplace (Ctrl+Shift+M from chat, or “Models” on the top bar). Browse by category and price, use Auto routing, or pick from Recents after you try a few. Add your OpenRouter API key under Settings → Models when you are ready to send chat.',
  },
  {
    title: 'AI panel',
    body: 'Attach images or URLs, enable Agent Mode for multi-step tasks with tools, and use /commands in the input.',
  },
  {
    title: 'Bottom panel',
    body: 'Output log, integrated terminal, Problems, and Tests live here. Resize by dragging the divider.',
  },
  {
    title: 'Commands',
    body: 'Ctrl+Shift+P opens the command palette. Ctrl+P opens files; prefix with @ for symbols in the active file.',
  },
];

interface WelcomeTourProps {
  onDone: () => void;
}

export default function WelcomeTour({ onDone }: WelcomeTourProps) {
  const update = useSettings((s) => s.update);
  const pushLog = useApp((s) => s.pushLog);
  const [step, setStep] = useState(0);

  const finish = async (skipped: boolean) => {
    await update({ hasCompletedProductTour: true });
    if (skipped) pushLog('info', 'Skipped product tour.');
    else pushLog('info', 'Finished product tour.');
    onDone();
  };

  const s = STEPS[step];

  return (
    <div className="modal-scrim fixed inset-0 z-[60] flex items-center justify-center backdrop-blur-[1px] p-6">
      <div className="glass-panel glass-modal-lg w-full max-w-md p-5 ds-transition">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="brand-mark-icon-wrap">
              <img
                src={logoIcon}
                alt=""
                className="h-7 w-7 shrink-0 select-none"
                draggable={false}
              />
            </span>
            <div className="min-w-0 truncate text-sm font-semibold text-fg">
              Welcome to <span className="brand-wordmark">Router Studio</span>
            </div>
          </div>
          <span className="text-[11px] text-fg-muted">
            {step + 1} / {STEPS.length}
          </span>
        </div>
        <div className="mb-2 text-xs font-medium text-accent">{s.title}</div>
        <p className="mb-5 text-sm leading-relaxed text-fg-muted">{s.body}</p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1.5 text-xs text-fg-muted hover:bg-bg-hover hover:text-fg"
            onClick={() => void finish(true)}
          >
            Skip tour
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-bg-hover"
                onClick={() => setStep((x) => Math.max(0, x - 1))}
              >
                Back
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button
                type="button"
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90"
                onClick={() => setStep((x) => Math.min(STEPS.length - 1, x + 1))}
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90"
                onClick={() => void finish(false)}
              >
                Get started
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
