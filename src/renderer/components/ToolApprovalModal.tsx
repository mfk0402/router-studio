import { useState } from 'react';
import { useTools } from '../store/toolsStore';
import type { ToolApprovalResponse } from '../../shared/types';

/**
 * Modal for approving/denying tool calls.
 * Shows tool name, arguments, preview, and approval options.
 */
export default function ToolApprovalModal() {
  const pendingApproval = useTools((s) => s.pendingApproval);
  const respondApproval = useTools((s) => s.respondApproval);
  const [patternInput, setPatternInput] = useState('');
  const [showPatternInput, setShowPatternInput] = useState(false);

  if (!pendingApproval) return null;

  const { id, toolName, args, preview, riskLevel } = pendingApproval;

  const handleResponse = async (action: ToolApprovalResponse['action'], pattern?: string) => {
    await respondApproval({ id, action, pattern });
    setShowPatternInput(false);
    setPatternInput('');
  };

  const riskBadge =
    riskLevel === 'high' ? (
      <span className="rounded bg-danger/20 px-1.5 py-0.5 text-[10px] font-semibold text-danger">
        HIGH RISK
      </span>
    ) : riskLevel === 'medium' ? (
      <span className="rounded bg-warn/20 px-1.5 py-0.5 text-[10px] font-semibold text-warn">
        MEDIUM RISK
      </span>
    ) : (
      <span className="rounded bg-success/20 px-1.5 py-0.5 text-[10px] font-semibold text-success">
        LOW RISK
      </span>
    );

  // Suggest pattern based on tool type
  const suggestedPattern =
    toolName === 'run_shell'
      ? String(args.command ?? '').split(' ')[0] // First word of command
      : String(args.path ?? '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-bg-elevated shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-fg">Tool Approval Required</span>
            {riskBadge}
          </div>
          <button
            onClick={() => handleResponse('deny')}
            className="text-fg-muted hover:text-fg"
            title="Deny"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4">
          <div className="mb-3">
            <div className="mb-1 text-xs font-medium text-fg-muted">Tool</div>
            <div className="rounded border border-border bg-bg px-2 py-1.5 font-mono text-sm text-accent">
              {toolName}
            </div>
          </div>

          <div className="mb-3">
            <div className="mb-1 text-xs font-medium text-fg-muted">Arguments</div>
            <pre className="max-h-40 overflow-auto rounded border border-border bg-bg px-2 py-1.5 text-xs text-fg">
              {JSON.stringify(args, null, 2)}
            </pre>
          </div>

          {preview && (
            <div className="mb-3">
              <div className="mb-1 text-xs font-medium text-fg-muted">Preview</div>
              <pre className="max-h-24 overflow-auto rounded border border-border bg-bg px-2 py-1.5 font-mono text-xs text-fg-muted">
                {preview}
              </pre>
            </div>
          )}

          {showPatternInput && (
            <div className="mb-3">
              <div className="mb-1 text-xs font-medium text-fg-muted">
                Pattern to always allow ({toolName === 'run_shell' ? 'regex for commands' : 'glob for paths'})
              </div>
              <input
                type="text"
                value={patternInput}
                onChange={(e) => setPatternInput(e.target.value)}
                placeholder={suggestedPattern}
                className="w-full rounded border border-border bg-bg px-2 py-1.5 text-sm text-fg focus:border-accent focus:outline-none"
                autoFocus
              />
              <p className="mt-1 text-[10px] text-fg-subtle">
                Future calls matching this pattern will be auto-approved.
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-soft px-4 py-3">
          <div className="flex gap-2">
            <button
              onClick={() => handleResponse('deny_stop')}
              className="rounded border border-danger/40 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/10"
            >
              Deny & Stop Task
            </button>
            <button
              onClick={() => handleResponse('deny')}
              className="rounded border border-border px-3 py-1.5 text-xs font-medium text-fg-muted hover:bg-bg-hover"
            >
              Deny
            </button>
          </div>

          <div className="flex gap-2">
            {!showPatternInput && (
              <button
                onClick={() => setShowPatternInput(true)}
                className="rounded border border-border px-3 py-1.5 text-xs font-medium text-fg-muted hover:bg-bg-hover"
                title="Always allow calls matching a pattern"
              >
                Always Allow Pattern…
              </button>
            )}
            {showPatternInput && (
              <button
                onClick={() => handleResponse('allow_always_pattern', patternInput || suggestedPattern)}
                className="rounded border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20"
                disabled={!patternInput && !suggestedPattern}
              >
                Allow Pattern
              </button>
            )}
            <button
              onClick={() => handleResponse('allow_always_tool')}
              className="rounded border border-accent/40 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10"
              title={`Always allow ${toolName} (no further prompts)`}
            >
              Always Allow Tool
            </button>
            <button
              onClick={() => handleResponse('allow')}
              className="rounded bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent/80"
            >
              Allow Once
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
