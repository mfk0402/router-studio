import { useRef, useState } from 'react';

/**
 * Lightweight localhost iframe preview. Remote URLs are handled by Playwright tools in the agent.
 */
export default function BrowserPanel({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState('http://localhost:5173/');
  const [liveUrl, setLiveUrl] = useState('http://localhost:5173/');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const isLocalhost =
    /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(liveUrl.trim());

  const go = () => {
    let u = url.trim();
    if (!u.startsWith('http://') && !u.startsWith('https://')) {
      u = `http://${u}`;
      setUrl(u);
    }
    setLiveUrl(u);
  };

  return (
    <div className="fixed bottom-10 right-4 z-30 flex h-[min(420px,55vh)] w-[min(520px,92vw)] flex-col overflow-hidden ds-transition glass-panel glass-modal-lg">
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1.5">
        <span className="text-[10px] font-semibold uppercase text-fg-muted">Browser</span>
        <button
          type="button"
          className="rounded border border-border px-2 py-0.5 text-[10px] text-fg-muted hover:bg-bg-hover"
          title="Back"
          onClick={() => iframeRef.current?.contentWindow?.history.back()}
        >
          ←
        </button>
        <button
          type="button"
          className="rounded border border-border px-2 py-0.5 text-[10px] text-fg-muted hover:bg-bg-hover"
          title="Reload"
          onClick={() => {
            if (iframeRef.current && isLocalhost) {
              iframeRef.current.src = iframeRef.current.src;
            }
          }}
        >
          ↻
        </button>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && go()}
          className="min-w-[160px] flex-1 rounded border border-border bg-bg px-2 py-1 font-mono text-[10px] text-fg"
          placeholder="http://localhost:5173/"
        />
        <button
          type="button"
          className="rounded bg-accent px-2 py-1 text-[10px] font-medium text-accent-fg"
          onClick={go}
        >
          Go
        </button>
        <button
          type="button"
          className="rounded px-2 py-1 text-[11px] text-fg-muted hover:text-fg"
          onClick={onClose}
          title="Close"
        >
          ✕
        </button>
      </div>
      {isLocalhost ? (
        <iframe ref={iframeRef} title="Browser preview" src={liveUrl} className="min-h-0 flex-1 w-full bg-bg" />
      ) : (
        <div className="flex flex-1 flex-col gap-2 p-3 text-[11px] leading-snug text-fg-muted">
          <p>
            Preview is limited to <strong className="text-fg">localhost / 127.0.0.1</strong>. For other origins, use
            agent tools: <code className="text-accent">browser_open</code>,{' '}
            <code className="text-accent">browser_screenshot</code>, etc.
          </p>
          <p className="text-[10px] text-fg-subtle">Entered URL: {liveUrl || '(none)'}</p>
        </div>
      )}
    </div>
  );
}
