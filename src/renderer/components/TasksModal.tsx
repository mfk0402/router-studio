import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store/appStore';
import { useTasks } from '../store/tasksStore';
import type { AgentTask, AgentTaskStatus } from '../../shared/types';
import logoIcon from '../assets/logo-icon.png';

/**
 * Saved-tasks browser. Each row is a task persisted in userData/tasks/ — we
 * can resume (rehydrate the chat + auto-continue), inspect (view messages),
 * or delete.
 */
export default function TasksModal() {
  const show = useApp((s) => s.showTasks);
  const setShow = useApp((s) => s.setShowTasks);
  const pushLog = useApp((s) => s.pushLog);
  const setActive = useTasks((s) => s.setActive);

  const tasks = useTasks((s) => s.tasks);
  const refresh = useTasks((s) => s.refresh);
  const remove = useTasks((s) => s.remove);
  const load = useTasks((s) => s.load);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | AgentTaskStatus>('all');

  useEffect(() => {
    if (!show) return;
    void refresh();
  }, [show, refresh]);

  const visible = useMemo(() => {
    if (filter === 'all') return tasks;
    return tasks.filter((t) => t.status === filter);
  }, [tasks, filter]);

  const selected = useMemo(
    () => tasks.find((t) => t.id === selectedId) ?? null,
    [tasks, selectedId],
  );

  if (!show) return null;

  const resume = async (task: AgentTask) => {
    // Rehydrate chat with saved messages, mark this task active, close modal.
    const chat = task.messages.map((m, i) => ({
      id: `${task.id}-${i}`,
      role: m.role,
      content: m.content,
      createdAt: task.createdAt + i,
    }));
    useApp.setState({ chat, attachments: [] });
    setActive(task.id);
    setShow(false);
    pushLog(
      'info',
      `Resumed task "${task.title}" (${task.iterations} iter, last: ${task.status}). ` +
        'Click Resume in the status bar or send a new message to continue.',
    );
  };

  const del = async (task: AgentTask) => {
    // eslint-disable-next-line no-alert
    if (!confirm(`Delete task "${task.title}"? This cannot be undone.`)) return;
    await remove(task.id);
    if (selectedId === task.id) setSelectedId(null);
  };

  return (
    <div className="modal-scrim fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="flex h-[75vh] w-full max-w-5xl overflow-hidden rounded-lg border border-border bg-bg-elevated shadow-2xl">
        <div className="flex w-72 min-w-0 flex-col border-r border-border-soft">
          <div className="flex items-center justify-between border-b border-border-soft px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="brand-mark-icon-wrap">
                <img
                  src={logoIcon}
                  alt=""
                  className="h-6 w-6 shrink-0 select-none"
                  draggable={false}
                />
              </span>
              <div className="truncate text-sm font-semibold text-fg">Tasks</div>
            </div>
            <button
              className="rounded border border-border px-2 py-0.5 text-[11px] text-fg-muted hover:bg-bg-hover hover:text-fg"
              onClick={() => void refresh()}
            >
              Refresh
            </button>
          </div>
          <div className="flex flex-wrap gap-1 border-b border-border-soft p-2">
            {(['all', 'running', 'paused', 'blocked', 'completed', 'failed'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={
                  'rounded px-2 py-0.5 text-[11px] ' +
                  (filter === f
                    ? 'bg-accent/20 text-accent'
                    : 'border border-border text-fg-muted hover:bg-bg-hover')
                }
              >
                {f}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-auto">
            {visible.length === 0 ? (
              <div className="p-4 text-xs text-fg-muted">
                No tasks. Turn on <strong className="text-fg">Agent Mode</strong> and send a prompt
                to start one.
              </div>
            ) : (
              visible.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={
                    'block w-full border-b border-border-soft px-3 py-2 text-left hover:bg-bg-hover ' +
                    (selectedId === t.id ? 'bg-bg-hover' : '')
                  }
                >
                  <div className="flex items-center gap-2">
                    <StatusDot status={t.status} />
                    <div className="truncate text-[13px] font-medium text-fg">{t.title}</div>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-fg-muted">
                    <span>{t.iterations} iter</span>
                    <span>·</span>
                    <span>{new Date(t.updatedAt).toLocaleString()}</span>
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="border-t border-border-soft px-3 py-2 text-right">
            <button
              className="rounded border border-border px-2 py-1 text-xs text-fg-muted hover:bg-bg-hover hover:text-fg"
              onClick={() => setShow(false)}
            >
              Close
            </button>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-fg-muted">
              Select a task to inspect or resume.
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2 border-b border-border-soft px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <StatusDot status={selected.status} />
                    <div className="truncate text-sm font-semibold text-fg">{selected.title}</div>
                  </div>
                  <div className="mt-1 text-[11px] text-fg-muted">
                    {selected.modelUsed} · {selected.iterations}/{selected.maxIterations} iter · updated{' '}
                    {new Date(selected.updatedAt).toLocaleString()}
                  </div>
                  {selected.lastError && (
                    <div className="mt-1 text-[11px] text-danger">Error: {selected.lastError}</div>
                  )}
                  {selected.lastMarker && !selected.lastError && (
                    <div className="mt-1 text-[11px] text-fg-muted">Last: {selected.lastMarker}</div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => void resume(selected)}
                    className="rounded bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent/80"
                  >
                    {selected.status === 'completed' ? 'Reopen' : 'Resume'}
                  </button>
                  <button
                    onClick={() => void del(selected)}
                    className="rounded border border-danger/40 px-2 py-1 text-xs text-danger hover:bg-danger/10"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="mb-2 border-b border-border-soft px-4 py-2 text-[11px] text-fg-muted">
                <strong className="text-fg">Goal:</strong> {selected.goal}
              </div>

              <div className="flex-1 overflow-auto px-4 py-2">
                {selected.messages.length === 0 ? (
                  <div className="text-xs text-fg-muted">No messages recorded.</div>
                ) : (
                  selected.messages.map((m, i) => (
                    <div
                      key={i}
                      className={
                        'mb-2 rounded border p-2 text-[12px] ' +
                        (m.role === 'user'
                          ? 'border-accent/30 bg-accent/5'
                          : 'border-border-soft bg-bg')
                      }
                    >
                      <div className="mb-1 text-[10px] font-semibold uppercase text-fg-muted">
                        {m.role}
                      </div>
                      <pre className="whitespace-pre-wrap break-words font-sans text-fg">
                        {m.content}
                      </pre>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: AgentTaskStatus }) {
  const color =
    status === 'running'
      ? 'bg-accent'
      : status === 'completed'
      ? 'bg-success'
      : status === 'failed'
      ? 'bg-danger'
      : status === 'blocked'
      ? 'bg-warn'
      : 'bg-fg-muted';
  return <span className={'inline-block h-2 w-2 shrink-0 rounded-full ' + color} />;
}
