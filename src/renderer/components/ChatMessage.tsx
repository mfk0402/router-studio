import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { memo, useState, useCallback, useMemo, useEffect, type ReactNode } from 'react';
import type { ChatMsg } from '../store/appStore';
import { useApp } from '../store/appStore';
import { useSettings } from '../store/settingsStore';
import { useShallow } from 'zustand/react/shallow';
import { extractUnifiedDiff, previewDiff } from '../lib/diffUtils';
import { extToLanguage } from '../lib/fileUtils';
import ThinkingPanel, { extractAnswer, hasThinkingContent } from './ThinkingPanel';

interface ChatMessageProps {
  msg: ChatMsg;
  onEdit?: (messageId: string, newContent: string) => void;
  onDelete?: (messageId: string) => void;
  onFork?: (messageId: string) => void;
}

function formatVideoElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${r.toString().padStart(2, '0')}` : `${s}s`;
}

function humanizeVideoPollStatus(status: string): string {
  switch (status) {
    case 'pending':
      return 'Queued';
    case 'in_progress':
      return 'Rendering';
    case 'completed':
      return 'Done';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    case 'expired':
      return 'Expired';
    default:
      return status;
  }
}

function downloadGeneratedVideo(mediaUrl: string, indexOneBased: number): void {
  void (async () => {
    try {
      const res = await fetch(mediaUrl, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const ext =
        blob.type.includes('webm') ? 'webm'
        : blob.type.includes('quicktime') ? 'mov'
        : blob.type.includes('mp4') ? 'mp4'
        : 'mp4';
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `router-studio-video-${indexOneBased}-${Date.now()}.${ext}`;
      a.rel = 'noopener';
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(mediaUrl, '_blank', 'noopener,noreferrer');
    }
  })();
}

function VideoJobProgressPanel({
  progress,
}: {
  progress: NonNullable<ChatMsg['videoRenderProgress']>;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [progress.startedAt]);

  const elapsed = formatVideoElapsed(now - progress.startedAt);

  return (
    <div
      className="video-job-progress mb-3 rounded-xl border border-accent/25 bg-gradient-to-br from-accent/[0.08] to-cyan/[0.06] px-3 py-2.5 shadow-sm"
      role="status"
      aria-live="polite"
      aria-label="Video render in progress"
    >
      <div className="mb-2 flex items-center justify-between gap-2 text-[11px]">
        <span className="font-semibold uppercase tracking-wide text-accent">Video render</span>
        <span className="tabular-nums text-fg-muted">{elapsed}</span>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-bg-deep/80">
        <div className="video-job-progress-bar absolute inset-y-0 w-[38%] rounded-full bg-gradient-to-r from-accent to-cyan opacity-90 shadow-[0_0_12px_rgb(99_102_255_/_0.35)]" />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-muted">
        <span className="inline-flex gap-1" aria-hidden>
          <span className="video-job-dot h-1.5 w-1.5 rounded-full bg-accent" />
          <span className="video-job-dot video-job-dot-delay-1 h-1.5 w-1.5 rounded-full bg-accent" />
          <span className="video-job-dot video-job-dot-delay-2 h-1.5 w-1.5 rounded-full bg-accent" />
        </span>
        <span>
          {humanizeVideoPollStatus(progress.apiStatus)}
          {progress.pollIndex > 0 ? ` · check ${progress.pollIndex}` : ''}
        </span>
        <span className="font-mono text-[10px] text-fg-subtle">
          id <span className="text-fg-muted">{progress.jobId.slice(0, 8)}…</span>
        </span>
      </div>
    </div>
  );
}

function ChatMessageComponent({ msg, onEdit, onDelete, onFork }: ChatMessageProps) {
  if (msg.role === 'system') return null;

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(msg.displayContent ?? msg.content);

  const isUser = msg.role === 'user';

  const remarkPlugins = useMemo(() => [remarkGfm], []);
  const markdownComponents = useMemo(
    () => ({
      code: (props: { className?: string; children?: ReactNode }) => (
        <Code {...(props as CodeProps)} />
      ),
      pre: ({ children }: { children?: ReactNode }) => <>{children}</>,
    }),
    [],
  );

  const handleStartEdit = () => {
    setEditContent(msg.displayContent ?? msg.content);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    if (onEdit && editContent.trim()) {
      onEdit(msg.id, editContent.trim());
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditContent(msg.displayContent ?? msg.content);
    setIsEditing(false);
  };

  return (
    <div
      className={[
        'fade-in group max-w-full rounded-2xl border px-4 py-3 shadow-sm transition-shadow',
        isUser
          ? 'border-accent/25 bg-gradient-to-br from-accent/[0.12] to-accent/[0.04]'
          : 'border-border-soft bg-bg-soft/90 backdrop-blur-[2px]',
      ].join(' ')}
    >
      <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-medium text-fg-muted">
        <span className={isUser ? 'text-accent' : 'text-fg-subtle'}>{isUser ? 'You' : 'Assistant'}</span>
        <div className="flex items-center gap-2">
          {msg.modelUsed && <span className="text-fg-muted normal-case">{msg.modelUsed}</span>}
          {!msg.streaming && (
            <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
              {isUser && (
                <button
                  onClick={handleStartEdit}
                  className="rounded p-0.5 text-fg-muted hover:bg-bg-hover hover:text-fg"
                  title="Edit message (will branch conversation)"
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )}
              {onFork && (
                <button
                  onClick={() => onFork(msg.id)}
                  className="rounded p-0.5 text-fg-muted hover:bg-accent/20 hover:text-accent"
                  title="Fork conversation from here"
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4M8 17H4m0 0l4-4m-4 4l4 4" />
                  </svg>
                </button>
              )}
              {isUser && onDelete && (
                <button
                  onClick={() => onDelete(msg.id)}
                  className="rounded p-0.5 text-fg-muted hover:bg-danger/20 hover:text-danger"
                  title="Delete this message and all following"
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {msg.error ? (
        <div className="text-sm text-danger">{msg.error}</div>
      ) : isEditing ? (
        <div className="space-y-2">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full rounded border border-border bg-bg p-2 text-sm text-fg outline-none focus:border-accent"
            rows={4}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={handleCancelEdit}
              className="rounded border border-border px-2 py-1 text-xs text-fg-muted hover:bg-bg-hover"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              className="rounded bg-accent px-2 py-1 text-xs text-white hover:bg-accent/80"
            >
              Save & Regenerate
            </button>
          </div>
        </div>
      ) : (
        <div className="markdown-body prose-chat">
          {!isUser && msg.videoRenderProgress && !msg.error ? (
            <VideoJobProgressPanel progress={msg.videoRenderProgress} />
          ) : null}
          {!isUser && msg.generatedVideoUrls && msg.generatedVideoUrls.length > 0 ? (
            <div className="mb-3 flex flex-col gap-3">
              <p className="text-[13px] leading-relaxed text-fg-muted">
                Play inline in the chat, or download to preview offline. Hosted previews may stop working after a
                while — save the file if you need to keep it.
              </p>
              {msg.generatedVideoUrls.map((src, idx) => (
                <div key={idx} className="flex flex-col gap-2">
                  <video
                    src={src}
                    controls
                    playsInline
                    className="max-h-[min(70vh,560px)] w-full max-w-full rounded-xl border border-border-soft shadow-sm"
                  >
                    Video playback is not supported.
                  </video>
                  <div>
                    <button
                      type="button"
                      className="rounded-md border border-border-soft px-2.5 py-1 text-[11px] text-fg-muted hover:bg-bg-hover hover:text-fg"
                      onClick={() => downloadGeneratedVideo(src, idx + 1)}
                    >
                      Download video
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {!isUser && msg.generatedImageUrls && msg.generatedImageUrls.length > 0 ? (
            <div className="mb-3 flex flex-col gap-3">
              {msg.generatedImageUrls.map((src, idx) => (
                <img
                  key={idx}
                  src={src}
                  alt={`Generated ${idx + 1}`}
                  className="max-h-[min(70vh,560px)] w-auto max-w-full rounded-xl border border-border-soft object-contain shadow-sm"
                />
              ))}
            </div>
          ) : null}
          {/* Thinking/Reasoning panel for CoT models */}
          {!isUser && hasThinkingContent(msg.content) && (
            <ThinkingPanel content={msg.content} isStreaming={msg.streaming} />
          )}
          
          <ReactMarkdown remarkPlugins={remarkPlugins} components={markdownComponents}>
            {!isUser && hasThinkingContent(msg.content)
              ? extractAnswer(msg.content) || (msg.streaming ? '…' : '')
              : isUser
                ? (msg.displayContent ?? msg.content) || (msg.streaming ? '…' : '')
                : msg.content || (msg.streaming ? '…' : '')}
          </ReactMarkdown>
          {!isUser && msg.generatedAudioObjectUrl ? (
            <div className="mt-3 rounded-xl border border-border-soft bg-bg-deep/40 p-3">
              <audio
                src={msg.generatedAudioObjectUrl}
                controls
                className="h-10 w-full max-w-lg"
                preload="metadata"
              />
              <div className="mt-2">
                <button
                  type="button"
                  className="rounded-md border border-border-soft px-2 py-1 text-[11px] text-fg-muted hover:bg-bg-hover hover:text-fg"
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = msg.generatedAudioObjectUrl!;
                    a.download = msg.ttsAudioFileName ?? 'router-studio-tts.audio';
                    a.rel = 'noopener';
                    a.click();
                  }}
                >
                  Download again
                </button>
              </div>
            </div>
          ) : null}
          {!isUser && !msg.streaming && msg.content && (
            <AssistantActions raw={msg.content} />
          )}
        </div>
      )}
    </div>
  );
}

interface CodeProps {
  className?: string;
  children?: ReactNode;
}

function Code({ className, children }: CodeProps) {
  const match = /language-([^\s]+)/.exec(className ?? '');
  const lang = match?.[1] ?? 'plaintext';
  const code = String(children ?? '').replace(/\n$/, '');
  // react-markdown v9 removed the `inline` prop. A fenced block always has a
  // language-xxx className OR a newline in its content; anything else is inline.
  const isBlock = !!match || code.includes('\n');
  if (!isBlock) {
    return <code className={className}>{children}</code>;
  }
  const shellLangs = new Set([
    'bash',
    'sh',
    'shell',
    'zsh',
    'fish',
    'powershell',
    'pwsh',
    'ps',
    'ps1',
    'cmd',
    'bat',
    'console',
  ]);
  const isShell = shellLangs.has(lang.toLowerCase());
  return (
    <div className="bg-bg-deep/95 overflow-hidden rounded-xl border border-border-soft shadow-inner">
      <div className="flex items-center justify-between border-b border-border-soft/80 bg-black/20 px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
        <span>{lang}</span>
        <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
          <CopyButton text={code} />
          {isShell && <RunInTerminalButton code={code} />}
          <InsertButton code={code} />
          <NewFileButton code={code} lang={lang} />
        </div>
      </div>
      <pre className="overflow-auto p-3">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

function RunInTerminalButton({ code }: { code: string }) {
  const requestRun = useApp((s) => s.requestRunTerminalCommand);
  const pushLog = useApp((s) => s.pushLog);
  const confirmBeforeRun = useSettings((s) => s.settings.confirmBeforeRun);

  const run = () => {
    // Strip leading prompt glyphs if present (``$ npm test`` / ``> ls``).
    const normalized = code
      .split('\n')
      .map((l) => l.replace(/^\s*[$>]\s?/, ''))
      .join('\n')
      .trim();
    if (!normalized) return;
    // Default to running the first non-blank line. Multi-line blocks get
    // opened in the terminal with the user able to press Enter themselves.
    const firstLine = normalized.split('\n').find((l) => l.trim().length > 0) ?? normalized;
    const isMultiline = normalized.split('\n').filter((l) => l.trim()).length > 1;
    const commandToRun = isMultiline ? firstLine : normalized;

    if (confirmBeforeRun) {
      const ok = window.confirm(
        `Run this command in the terminal?\n\n${commandToRun}\n\n` +
          (isMultiline
            ? '(Only the first line will be sent. Disable in Settings.)\n'
            : '(Disable this prompt in Settings → Confirm before run.)'),
      );
      if (!ok) return;
    }
    requestRun(commandToRun);
    pushLog('info', `AI requested: ${commandToRun}`);
  };

  return (
    <button
      onClick={run}
      className="rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent hover:bg-accent/20"
      title="Run this command in the Terminal"
    >
      Run
    </button>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="rounded border border-border px-1.5 py-0.5 text-[10px] text-fg-muted hover:bg-bg-hover hover:text-fg"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function InsertButton({ code }: { code: string }) {
  const pushLog = useApp((s) => s.pushLog);
  const updateTabContent = useApp((s) => s.updateTabContent);
  const { activeTabPath, activeTab } = useApp(
    useShallow((s) => {
      const p = s.activeTabPath;
      return {
        activeTabPath: p,
        activeTab: p ? s.tabs.find((x) => x.relativePath === p) : undefined,
      };
    }),
  );

  const insert = () => {
    if (!activeTabPath || !activeTab) {
      pushLog('warn', 'No active file to insert into.');
      return;
    }
    const t = activeTab;
    const newContent = t.content + (t.content.endsWith('\n') ? '' : '\n') + code + '\n';
    updateTabContent(activeTabPath, newContent);
    pushLog('info', `Inserted code into ${activeTabPath}`);
  };
  return (
    <button
      onClick={insert}
      className="rounded border border-border px-1.5 py-0.5 text-[10px] text-fg-muted hover:bg-bg-hover hover:text-fg"
      title="Append to end of current file"
    >
      Insert
    </button>
  );
}

function NewFileButton({ code, lang }: { code: string; lang: string }) {
  const pushLog = useApp((s) => s.pushLog);
  const setFileTree = useApp((s) => s.setFileTree);
  const openTab = useApp((s) => s.openTab);

  const create = async () => {
    const suggested = suggestFilename(lang);
    const input = window.prompt('New file (relative path):', suggested);
    if (!input) return;
    try {
      await window.api.fs.createFile(input, code);
      const tree = await window.api.fs.listFiles();
      setFileTree(tree);
      openTab({
        relativePath: input,
        name: input.split('/').pop() || input,
        language: extToLanguage(input),
        content: code,
        original: code,
        dirty: false,
      });
      pushLog('info', `Created ${input}`);
    } catch (e) {
      pushLog('error', `Create failed: ${(e as Error).message}`);
    }
  };
  return (
    <button
      onClick={create}
      className="rounded border border-border px-1.5 py-0.5 text-[10px] text-fg-muted hover:bg-bg-hover hover:text-fg"
      title="Create new file with this code"
    >
      New File
    </button>
  );
}

function suggestFilename(lang: string): string {
  switch (lang) {
    case 'typescript':
      return 'new-file.ts';
    case 'javascript':
      return 'new-file.js';
    case 'tsx':
      return 'Component.tsx';
    case 'python':
      return 'new_file.py';
    case 'json':
      return 'new.json';
    case 'css':
      return 'styles.css';
    case 'html':
      return 'index.html';
    case 'markdown':
      return 'NOTES.md';
    default:
      return 'new-file.txt';
  }
}

function AssistantActions({ raw }: { raw: string }) {
  const setPendingDiff = useApp((s) => s.setPendingDiff);
  const pushLog = useApp((s) => s.pushLog);
  const { activeTabPath, activeTab } = useApp(
    useShallow((s) => {
      const p = s.activeTabPath;
      return {
        activeTabPath: p,
        activeTab: p ? s.tabs.find((x) => x.relativePath === p) : undefined,
      };
    }),
  );

  const applyAsPatch = useCallback(async () => {
    const diff = extractUnifiedDiff(raw);
    if (!diff) {
      pushLog('warn', 'No unified diff detected in this response.');
      return;
    }
    if (!activeTabPath || !activeTab) {
      pushLog('warn', 'Open a file to apply the patch to.');
      return;
    }
    const tab = activeTab;
    const res = previewDiff(tab.content, diff);
    if (!res.ok || res.newContent === undefined) {
      pushLog('error', `Could not apply patch safely. ${res.error ?? ''}`);
      setPendingDiff({
        relativePath: tab.relativePath,
        original: tab.content,
        modified: tab.content,
        source: 'patch',
      });
      return;
    }
    setPendingDiff({
      relativePath: tab.relativePath,
      original: tab.content,
      modified: res.newContent,
      source: 'patch',
    });
  }, [raw, activeTabPath, activeTab, setPendingDiff, pushLog]);

  const hasDiff = extractUnifiedDiff(raw) !== null;

  return (
    <div className="mt-2 flex flex-wrap gap-2 border-t border-border-soft pt-2 text-[11px]">
      <button
        onClick={applyAsPatch}
        disabled={!hasDiff}
        className="rounded border border-border px-2 py-1 text-fg-muted hover:bg-bg-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
        title={hasDiff ? 'Preview unified diff before applying' : 'No diff in this response'}
      >
        Apply as patch
      </button>
    </div>
  );
}

export default memo(ChatMessageComponent);
