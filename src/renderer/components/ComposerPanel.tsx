import { useEffect, useRef, useState } from 'react';
import type { ComposerSessionState } from '../../shared/types';
import {
  buildComposerApplyPrompt,
  buildComposerPreviewPrompt,
  buildSmallerPatchPrompt,
  buildSplitCommitsPrompt,
  parseComposerImpactJson,
  type ComposerImpactRow,
} from '../lib/composer';

interface ComposerPanelProps {
  open: boolean;
  onClose: () => void;
  /** Resume from saved agent task */
  initialSession?: ComposerSessionState | null;
  onPreviewImpact: (prompt: string) => void;
  onConfirmApply: (prompt: string) => void;
  onSessionSnapshot?: (session: ComposerSessionState) => void;
}

export function ComposerPanel({
  open,
  onClose,
  initialSession,
  onPreviewImpact,
  onConfirmApply,
  onSessionSnapshot,
}: ComposerPanelProps) {
  const openedOnceRef = useRef(false);
  const [goal, setGoal] = useState('');
  const [pasteJson, setPasteJson] = useState('');
  const [rows, setRows] = useState<ComposerImpactRow[]>([]);
  const [parseErr, setParseErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      openedOnceRef.current = false;
      return;
    }
    if (openedOnceRef.current) return;
    openedOnceRef.current = true;
    const g = initialSession?.goal?.trim() ?? '';
    setGoal(g);
    const summary = initialSession?.planSummary ?? '';
    setPasteJson(summary);
    if (summary) {
      const parsed = parseComposerImpactJson(summary);
      setRows(parsed ?? []);
    } else {
      setRows([]);
    }
    setParseErr(null);
  }, [open, initialSession]);

  useEffect(() => {
    if (!open || !onSessionSnapshot) return;
    const snap: ComposerSessionState = {
      goal,
      planSummary: pasteJson.trim() || JSON.stringify(rows),
      selectedPaths: rows.filter((r) => r.selected !== false).map((r) => r.path),
      updatedAt: Date.now(),
    };
    const t = window.setTimeout(() => onSessionSnapshot(snap), 400);
    return () => window.clearTimeout(t);
  }, [goal, pasteJson, rows, open, onSessionSnapshot]);

  if (!open) return null;

  const parsePasted = () => {
    const parsed = parseComposerImpactJson(pasteJson);
    if (!parsed) {
      setParseErr('Could not parse JSON. Paste the model response or bare `{ "files": [...] }`.');
      setRows([]);
      return;
    }
    setParseErr(null);
    setRows(parsed);
  };

  const toggleRow = (path: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.path === path ? { ...r, selected: !(r.selected !== false) } : r,
      ),
    );
  };

  const preview = () => {
    const g = goal.trim();
    if (!g) return;
    onPreviewImpact(buildComposerPreviewPrompt(g));
  };

  const confirm = () => {
    if (!rows.length) return;
    onConfirmApply(buildComposerApplyPrompt(rows));
  };

  return (
    <div className="fixed inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l border-border bg-bg-elevated shadow-2xl">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="text-sm font-semibold text-fg">Multi-file Composer</div>
        <button
          type="button"
          className="rounded px-2 py-1 text-[11px] text-fg-muted hover:bg-bg-hover hover:text-fg"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-auto p-3 text-[11px] text-fg-muted">
        <p>
          Describe a feature → <strong className="text-fg">Preview impact</strong> sends a JSON plan request to
          chat → paste the model&apos;s JSON below → <strong className="text-fg">Parse</strong> → confirm rows →{' '}
          <strong className="text-fg">Apply</strong> sends implementation instructions.
        </p>

        <label className="block text-[10px] font-medium uppercase text-fg-subtle">Goal</label>
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          rows={4}
          placeholder="e.g. Add dark-mode toggle to settings and persist it."
          className="w-full resize-y rounded border border-border bg-bg px-2 py-1.5 font-mono text-[11px] text-fg"
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg bg-accent px-3 py-1.5 text-[11px] font-medium text-accent-fg"
            onClick={preview}
          >
            Preview impact
          </button>
          <button
            type="button"
            className="rounded-lg border border-border px-3 py-1.5 text-[11px] text-fg-muted hover:bg-bg-hover"
            onClick={() => goal.trim() && onPreviewImpact(buildSmallerPatchPrompt(goal.trim()))}
          >
            Make smaller patch
          </button>
          <button
            type="button"
            className="rounded-lg border border-border px-3 py-1.5 text-[11px] text-fg-muted hover:bg-bg-hover"
            onClick={() => goal.trim() && onPreviewImpact(buildSplitCommitsPrompt(goal.trim()))}
          >
            Split into commits
          </button>
        </div>

        <label className="block text-[10px] font-medium uppercase text-fg-subtle">Planner JSON (paste)</label>
        <textarea
          value={pasteJson}
          onChange={(e) => setPasteJson(e.target.value)}
          rows={6}
          placeholder='{ "files": [ { "path": "...", "action": "edit", "reason": "..." } ] }'
          className="w-full resize-y rounded border border-border bg-bg px-2 py-1.5 font-mono text-[11px] text-fg"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-border px-3 py-1.5 text-[11px] text-fg hover:bg-bg-hover"
            onClick={parsePasted}
          >
            Parse JSON
          </button>
        </div>
        {parseErr && <div className="rounded border border-danger/40 bg-danger/10 px-2 py-1 text-danger">{parseErr}</div>}

        {rows.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase text-fg-subtle">Impact rows</div>
            <ul className="max-h-48 space-y-1 overflow-auto rounded border border-border-soft bg-bg p-2">
              {rows.map((r) => (
                <li key={`${r.path}-${r.action}`} className="flex gap-2 text-[11px] text-fg">
                  <input
                    type="checkbox"
                    checked={r.selected !== false}
                    onChange={() => toggleRow(r.path)}
                    title="Include in apply prompt"
                  />
                  <span className="shrink-0 rounded bg-bg-soft px-1 font-mono text-[10px] text-accent">{r.action}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[10px]" title={r.path}>
                    {r.path}
                  </span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="w-full rounded-lg bg-success/90 px-3 py-2 text-[11px] font-semibold text-white hover:bg-success"
              onClick={confirm}
            >
              Apply selected rows (send to chat)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
