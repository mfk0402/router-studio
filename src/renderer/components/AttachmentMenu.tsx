import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store/appStore';
import type { Attachment } from '../../shared/types';
import ScreenshotPicker from './ScreenshotPicker';

/**
 * Small dropdown button: add image / url / file / snippet / screenshot to the AI context.
 * Handles the URL prompt and snippet textarea inline via a lightweight modal.
 */
export default function AttachmentMenu() {
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<null | 'url' | 'snippet' | 'screenshot'>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const pushLog = useApp((s) => s.pushLog);
  const addAttachment = useApp((s) => s.addAttachment);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const addImage = async () => {
    setOpen(false);
    try {
      const picked = await window.api.fs.pickImage();
      if (!picked) return;
      const a: Attachment = {
        id: rid(),
        kind: 'image',
        label: picked.filename,
        filename: picked.filename,
        imageUrl: picked.dataUrl,
        sizeBytes: picked.sizeBytes,
      };
      addAttachment(a);
      pushLog('info', `Attached image: ${picked.filename}`);
    } catch (e) {
      pushLog('error', `Image attach failed: ${(e as Error).message}`);
    }
  };

  const addFile = async () => {
    setOpen(false);
    try {
      const picked = await window.api.fs.pickTextFile();
      if (!picked) return;
      addAttachment({
        id: rid(),
        kind: 'file',
        label: picked.filename,
        filename: picked.filename,
        text: picked.content,
        language: picked.language,
        sizeBytes: picked.sizeBytes,
      });
      pushLog('info', `Attached file: ${picked.filename} (${picked.content.length} chars)`);
    } catch (e) {
      pushLog('error', `File attach failed: ${(e as Error).message}`);
    }
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded border border-border bg-bg px-2 py-1 text-[11px] text-fg-muted hover:bg-bg-hover hover:text-fg"
        title="Attach context (image, URL, file, snippet)"
      >
        + Attach
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-10 mb-1 w-48 overflow-hidden rounded-md border border-border bg-bg-soft shadow-2xl">
          <MenuItem label="Image…" hint="png, jpg, webp" onClick={addImage} />
          <MenuItem label="Screenshot…" hint="capture screen region" onClick={() => {
            setOpen(false);
            setModal('screenshot');
          }} />
          <MenuItem label="Web page (URL)…" hint="fetch & extract text" onClick={() => {
            setOpen(false);
            setModal('url');
          }} />
          <MenuItem label="File…" hint="text/code" onClick={addFile} />
          <MenuItem label="Snippet / paste…" hint="type or paste text" onClick={() => {
            setOpen(false);
            setModal('snippet');
          }} />
        </div>
      )}

      {modal === 'url' && <UrlModal onClose={() => setModal(null)} />}
      {modal === 'snippet' && <SnippetModal onClose={() => setModal(null)} />}
      {modal === 'screenshot' && (
        <ScreenshotPicker
          onCapture={(dataUrl) => {
            addAttachment({
              id: rid(),
              kind: 'image',
              label: `Screenshot ${new Date().toLocaleTimeString()}`,
              filename: `screenshot-${Date.now()}.png`,
              imageUrl: dataUrl,
              sizeBytes: Math.round(dataUrl.length * 0.75), // approximate decoded size
            });
            pushLog('info', 'Screenshot attached');
            setModal(null);
          }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function MenuItem({
  label,
  hint,
  onClick,
}: {
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="block w-full px-3 py-2 text-left text-xs text-fg-muted hover:bg-bg-hover hover:text-fg"
    >
      <div className="text-fg">{label}</div>
      {hint && <div className="text-[10px] text-fg-subtle">{hint}</div>}
    </button>
  );
}

function UrlModal({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addAttachment = useApp((s) => s.addAttachment);
  const pushLog = useApp((s) => s.pushLog);

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await window.api.context.fetchUrl(url.trim());
      if (!result.ok) {
        setError(result.error ?? 'Fetch failed.');
        return;
      }
      addAttachment({
        id: rid(),
        kind: 'url',
        label: result.title || result.url || url,
        sourceUrl: result.url || url,
        text: result.text ?? '',
        sizeBytes: result.sizeBytes,
      });
      pushLog('info', `Attached URL: ${result.url || url}`);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-border bg-bg-soft p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 text-sm font-semibold">Attach Web Page</div>
        <input
          autoFocus
          type="text"
          value={url}
          placeholder="https://example.com/article"
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !loading) void submit();
            if (e.key === 'Escape') onClose();
          }}
          disabled={loading}
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none disabled:opacity-60"
        />
        <p className="mt-2 text-[11px] text-fg-subtle">
          The page's text content will be fetched and attached. Large pages are truncated
          to ~40K characters.
        </p>
        {error && <div className="mt-2 text-xs text-danger">{error}</div>}
        <div className="mt-3 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1 text-xs text-fg-muted hover:bg-bg-hover hover:text-fg"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading || !url.trim()}
            className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent/80 disabled:opacity-40"
          >
            {loading ? 'Fetching…' : 'Attach'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SnippetModal({ onClose }: { onClose: () => void }) {
  const [label, setLabel] = useState('Snippet');
  const [text, setText] = useState('');
  const addAttachment = useApp((s) => s.addAttachment);
  const pushLog = useApp((s) => s.pushLog);

  const submit = () => {
    if (!text.trim()) return;
    addAttachment({
      id: rid(),
      kind: 'snippet',
      label: label.trim() || 'Snippet',
      text,
      sizeBytes: text.length,
    });
    pushLog('info', `Attached snippet: ${label} (${text.length} chars)`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-bg-soft p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 text-sm font-semibold">Attach Snippet</div>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (e.g. 'error log')"
          className="mb-2 w-full rounded-md border border-border bg-bg px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
        />
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submit();
          }}
          rows={10}
          placeholder="Paste text, code, a stack trace, etc…"
          className="w-full resize-none rounded-md border border-border bg-bg px-3 py-2 font-mono text-xs focus:border-accent focus:outline-none"
        />
        <div className="mt-3 flex justify-between text-[11px] text-fg-subtle">
          <span>{text.length} chars</span>
          <span>Ctrl/Cmd + Enter to attach · Esc to cancel</span>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1 text-xs text-fg-muted hover:bg-bg-hover hover:text-fg"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!text.trim()}
            className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent/80 disabled:opacity-40"
          >
            Attach
          </button>
        </div>
      </div>
    </div>
  );
}

function rid(): string {
  return Math.random().toString(36).slice(2, 12);
}
