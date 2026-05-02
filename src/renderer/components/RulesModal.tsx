import { useEffect, useState } from 'react';
import { useApp } from '../store/appStore';
import { useRules } from '../store/rulesStore';
import type { Rule } from '../../shared/types';
import logoIcon from '../assets/logo-icon.png';

export default function RulesModal() {
  const open = useApp((s) => s.showRules);
  const setOpen = useApp((s) => s.setShowRules);
  const rules = useRules((s) => s.rules);
  const refresh = useRules((s) => s.refresh);
  const setEnabled = useRules((s) => s.setEnabled);
  const saveUserRule = useRules((s) => s.saveUserRule);
  const deleteUserRule = useRules((s) => s.deleteUserRule);

  const [editing, setEditing] = useState<Rule | null>(null);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  if (!open) return null;

  const project = rules.filter((r) => r.source === 'project');
  const user = rules.filter((r) => r.source === 'user');

  const addNew = () => {
    const id = 'user:' + Math.random().toString(36).slice(2, 10);
    setEditing({
      id,
      name: 'New rule',
      source: 'user',
      path: '',
      content: '',
      enabled: true,
    });
  };

  return (
    <div className="modal-scrim fixed inset-0 z-40 flex items-center justify-center p-8">
      <div className="flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-bg-soft shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="brand-mark-icon-wrap mt-0.5">
              <img
                src={logoIcon}
                alt=""
                className="h-7 w-7 shrink-0 select-none"
                draggable={false}
              />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-fg">Agent Rules & Skill Files</div>
              <div className="text-[11px] text-fg-muted">
                Enabled rules are prepended to the AI's system prompt on every request.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void refresh()}
              className="rounded-md border border-border px-2 py-1 text-xs text-fg-muted hover:bg-bg-hover hover:text-fg"
            >
              Rescan
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded-md border border-border px-2 py-1 text-xs text-fg-muted hover:bg-bg-hover hover:text-fg"
            >
              Close
            </button>
          </div>
        </div>

        {editing ? (
          <RuleEditor
            rule={editing}
            onCancel={() => setEditing(null)}
            onSave={async (r) => {
              await saveUserRule({
                id: r.id,
                name: r.name,
                path: '',
                content: r.content,
                enabled: r.enabled,
              });
              setEditing(null);
            }}
            onDelete={
              rules.some((r) => r.id === editing.id)
                ? async () => {
                    await deleteUserRule(editing.id);
                    setEditing(null);
                  }
                : undefined
            }
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-auto">
            <div className="border-b border-border-soft p-3">
              <button
                onClick={addNew}
                className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent/80"
              >
                + New user rule
              </button>
              <p className="mt-2 text-[11px] text-fg-subtle">
                Tip: the app also auto-discovers{' '}
                <code className="rounded bg-bg px-1">AGENTS.md</code>,{' '}
                <code className="rounded bg-bg px-1">CLAUDE.md</code>,{' '}
                <code className="rounded bg-bg px-1">.opencoderules</code>,{' '}
                <code className="rounded bg-bg px-1">.cursorrules</code>, and{' '}
                <code className="rounded bg-bg px-1">.cursor/rules/*.md(c)</code> in
                the currently open project folder.
              </p>
            </div>
            <Section title={`Project rules (${project.length})`}>
              {project.length === 0 ? (
                <Empty text="No project-level rule files found. Add one of the filenames above to your repo and click Rescan." />
              ) : (
                project.map((r) => (
                  <RuleRow
                    key={r.id}
                    rule={r}
                    onToggle={() => void setEnabled(r.id, !r.enabled)}
                    onEdit={() => setEditing(r)}
                  />
                ))
              )}
            </Section>
            <Section title={`User rules (${user.length})`}>
              {user.length === 0 ? (
                <Empty text='Click "+ New user rule" to add one. User rules travel across projects.' />
              ) : (
                user.map((r) => (
                  <RuleRow
                    key={r.id}
                    rule={r}
                    onToggle={() => void setEnabled(r.id, !r.enabled)}
                    onEdit={() => setEditing(r)}
                    onDelete={() => void deleteUserRule(r.id)}
                  />
                ))
              )}
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="sticky top-0 z-10 border-b border-border-soft bg-bg-soft px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
        {title}
      </div>
      <div className="divide-y divide-border-soft">{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="px-4 py-4 text-xs text-fg-subtle">{text}</div>;
}

function RuleRow({
  rule,
  onToggle,
  onEdit,
  onDelete,
}: {
  rule: Rule;
  onToggle: () => void;
  onEdit: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <input
        type="checkbox"
        checked={rule.enabled}
        onChange={onToggle}
        className="mt-1"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-fg">{rule.name}</span>
          <span className="rounded border border-border px-1 text-[10px] text-fg-subtle">
            {rule.source}
          </span>
        </div>
        {rule.path && (
          <div className="text-[11px] text-fg-subtle">{rule.path}</div>
        )}
        <div className="mt-1 line-clamp-2 text-[11px] text-fg-muted">
          {rule.content.trim().split('\n').slice(0, 2).join(' ')}
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          onClick={onEdit}
          className="rounded border border-border px-2 py-0.5 text-[11px] text-fg-muted hover:bg-bg-hover hover:text-fg"
        >
          {rule.source === 'user' ? 'Edit' : 'View'}
        </button>
        {onDelete && (
          <button
            onClick={onDelete}
            className="rounded border border-border px-2 py-0.5 text-[11px] text-danger hover:bg-bg-hover"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

function RuleEditor({
  rule,
  onCancel,
  onSave,
  onDelete,
}: {
  rule: Rule;
  onCancel: () => void;
  onSave: (r: Rule) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [name, setName] = useState(rule.name);
  const [content, setContent] = useState(rule.content);
  const [enabled, setEnabled] = useState(rule.enabled);
  const readOnly = rule.source === 'project';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-border-soft px-4 py-3">
        <div className="flex items-center gap-3">
          <label className="min-w-[80px] text-xs text-fg-muted">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            readOnly={readOnly}
            className="flex-1 rounded-md border border-border bg-bg px-2 py-1 text-sm focus:border-accent focus:outline-none read-only:opacity-70"
          />
        </div>
        <div className="flex items-center gap-3">
          <label className="min-w-[80px] text-xs text-fg-muted">Source</label>
          <div className="text-xs text-fg-muted">
            {rule.source}
            {rule.path && <> · {rule.path}</>}
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-fg-muted">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Enabled — inject into the AI system prompt
        </label>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        readOnly={readOnly}
        placeholder="Write rules the AI should follow (e.g., coding style, allowed libraries, testing conventions)…"
        className="min-h-0 flex-1 resize-none bg-bg px-4 py-3 font-mono text-xs text-fg focus:outline-none read-only:opacity-80"
      />
      <div className="flex items-center justify-between border-t border-border-soft px-4 py-3">
        <div>
          {onDelete && (
            <button
              onClick={onDelete}
              className="rounded-md border border-border px-3 py-1 text-xs text-danger hover:bg-bg-hover"
            >
              Delete
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-border px-3 py-1 text-xs text-fg-muted hover:bg-bg-hover hover:text-fg"
          >
            Cancel
          </button>
          {!readOnly && (
            <button
              onClick={() =>
                void onSave({ ...rule, name: name.trim() || rule.name, content, enabled })
              }
              className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent/80"
            >
              Save
            </button>
          )}
          {readOnly && (
            <button
              onClick={() => void onSave({ ...rule, enabled })}
              className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent/80"
            >
              Save enabled state
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
