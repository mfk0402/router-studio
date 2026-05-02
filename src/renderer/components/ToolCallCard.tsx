import { useState } from 'react';
import type { ToolExecutionEvent } from '../../shared/types';

interface ToolCallCardProps {
  toolName: string;
  args: Record<string, unknown>;
  execution?: ToolExecutionEvent;
  /** If true, tool call is still being streamed (args incomplete) */
  streaming?: boolean;
}

/**
 * Renders a tool call in the chat as an expandable card.
 * Shows status, arguments, and result.
 */
export default function ToolCallCard({ toolName, args, execution, streaming }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);

  const status = execution?.status ?? (streaming ? 'pending' : 'pending');
  const result = execution?.result;
  const error = execution?.error;
  const durationMs = execution?.durationMs;

  const statusIcon = {
    pending: '⏳',
    approved: '✓',
    executing: '⚡',
    success: '✅',
    error: '❌',
    denied: '🚫',
  }[status];

  const statusColor = {
    pending: 'text-fg-muted',
    approved: 'text-accent',
    executing: 'text-accent',
    success: 'text-success',
    error: 'text-danger',
    denied: 'text-warn',
  }[status];

  const bgColor = {
    pending: 'bg-bg-soft',
    approved: 'bg-accent/5',
    executing: 'bg-accent/10',
    success: 'bg-success/5',
    error: 'bg-danger/5',
    denied: 'bg-warn/5',
  }[status];

  // Parse result if it's JSON
  let parsedResult: unknown = result;
  try {
    if (result) {
      parsedResult = JSON.parse(result);
    }
  } catch {
    // Keep as string
  }

  return (
    <div className={`my-2 rounded-lg border border-border-soft ${bgColor} transition-colors`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">{statusIcon}</span>
          <span className="font-mono text-xs font-medium text-fg">{toolName}</span>
          {streaming && (
            <span className="animate-pulse text-[10px] text-fg-muted">streaming...</span>
          )}
          {status === 'executing' && (
            <span className="animate-pulse text-[10px] text-fg-muted">running...</span>
          )}
          {durationMs != null && (
            <span className="text-[10px] text-fg-subtle">{durationMs}ms</span>
          )}
        </div>
        <svg
          className={`h-4 w-4 text-fg-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-border-soft px-3 py-2">
          <div className="mb-2">
            <div className="mb-1 text-[10px] font-medium uppercase text-fg-muted">Arguments</div>
            <pre className="max-h-32 overflow-auto rounded bg-bg p-2 text-[11px] text-fg">
              {JSON.stringify(args, null, 2)}
            </pre>
          </div>

          {(result || error) && (
            <div>
              <div className="mb-1 text-[10px] font-medium uppercase text-fg-muted">
                {error ? 'Error' : 'Result'}
              </div>
              <pre
                className={`max-h-48 overflow-auto rounded p-2 text-[11px] ${
                  error ? 'bg-danger/10 text-danger' : 'bg-bg text-fg'
                }`}
              >
                {error ?? (typeof parsedResult === 'string' ? parsedResult : JSON.stringify(parsedResult, null, 2))}
              </pre>
            </div>
          )}

          {status === 'denied' && (
            <div className="text-xs text-warn">Tool call was denied by user.</div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Format arguments for compact display in the card header.
 */
export function formatArgsCompact(args: Record<string, unknown>): string {
  const keys = Object.keys(args);
  if (keys.length === 0) return '()';
  if (keys.length === 1 && typeof args[keys[0]] === 'string') {
    const val = String(args[keys[0]]);
    if (val.length < 40) return `(${JSON.stringify(val)})`;
  }
  return `({...})`;
}
