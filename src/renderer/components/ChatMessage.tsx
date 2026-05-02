import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useState, useCallback, useMemo } from 'react';
import type { ChatMsg } from '../store/appStore';
import { useApp } from '../store/appStore';
import { useSettings } from '../store/settingsStore';
import { extractUnifiedDiff, previewDiff } from '../lib/diffUtils';
import { extToLanguage } from '../lib/fileUtils';
import ThinkingPanel, { extractAnswer, hasThinkingContent } from './ThinkingPanel';

interface ChatMessageProps {
  msg: ChatMsg;
  onEdit?: (newContent: string) => void;
  onDelete?: () => void;
  onFork?: () => void;
}

export default function ChatMessage({ msg, onEdit, onDelete, onFork }: ChatMessageProps) {
  if (msg.role === 'system') return null;

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(msg.content);

  const isUser = msg.role === 'user';

  const handleStartEdit = () => {
    setEditContent(msg.content);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    if (onEdit && editContent.trim()) {
      onEdit(editContent);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditContent(msg.content);
    setIsEditing(false);
  };

  return (
    <div
      className={[
        'fade-in group rounded-lg border px-3 py-2',
        isUser
          ? 'border-border bg-bg-elevated/60'
          : 'border-border-soft bg-bg-soft',
      ].join(' ')}
    >
      <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-wide text-fg-subtle">
        <span>{isUser ? 'You' : 'Assistant'}</span>
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
                  onClick={onFork}
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
                  onClick={onDelete}
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
        <div className="markdown-body">
          {/* Thinking/Reasoning panel for CoT models */}
          {!isUser && hasThinkingContent(msg.content) && (
            <ThinkingPanel content={msg.content} isStreaming={msg.streaming} />
          )}
          
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code: (props) => <Code {...(props as CodeProps)} msg={msg} />,
              pre: ({ children }) => <>{children}</>,
            }}
          >
            {hasThinkingContent(msg.content) 
              ? (extractAnswer(msg.content) || (msg.streaming ? '…' : ''))
              : (msg.content || (msg.streaming ? '…' : ''))}
          </ReactMarkdown>
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
  children?: React.ReactNode;
  msg: ChatMsg;
}

function Code({ className, children, msg: _msg }: CodeProps) {
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
    <div className="group my-2 overflow-hidden rounded-md border border-border bg-[#0b0d12]">
      <div className="flex items-center justify-between border-b border-border px-2 py-1 text-[10px] uppercase text-fg-subtle">
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
  const activeTabPath = useApp((s) => s.activeTabPath);
  const updateTabContent = useApp((s) => s.updateTabContent);
  const tabs = useApp((s) => s.tabs);
  const pushLog = useApp((s) => s.pushLog);

  const insert = () => {
    if (!activeTabPath) {
      pushLog('warn', 'No active file to insert into.');
      return;
    }
    const t = tabs.find((x) => x.relativePath === activeTabPath);
    if (!t) return;
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
  const activeTabPath = useApp((s) => s.activeTabPath);
  const tabs = useApp((s) => s.tabs);
  const pushLog = useApp((s) => s.pushLog);

  const applyAsPatch = useCallback(async () => {
    const diff = extractUnifiedDiff(raw);
    if (!diff) {
      pushLog('warn', 'No unified diff detected in this response.');
      return;
    }
    if (!activeTabPath) {
      pushLog('warn', 'Open a file to apply the patch to.');
      return;
    }
    const tab = tabs.find((t) => t.relativePath === activeTabPath);
    if (!tab) return;
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
  }, [raw, activeTabPath, tabs, setPendingDiff, pushLog]);

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
