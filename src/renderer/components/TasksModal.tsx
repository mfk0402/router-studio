import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store/appStore';
import { useTasks } from '../store/tasksStore';
import type {
  AgentTask,
  AgentTaskStatus,
  WorkspaceCheckpointPayload,
  WorkspaceCheckpointSummary,
} from '../../shared/types';
import logoIcon from '../assets/logo-icon.png';
import { toast } from './ToastContainer';

type PanelMode = 'tasks' | 'checkpoints';

function tasksToMermaid(taskList: AgentTask[]): string {
  const esc = (s: string) => s.replace(/"/g, "'");
  const idOf = (raw: string) => `t_${raw.replace(/[^a-zA-Z0-9_]/g, '_')}`;
  const lines = ['flowchart TD'];
  for (const t of taskList) {
    lines.push(`  ${idOf(t.id)}["${esc(t.title)}"]`);
  }
  for (const t of taskList) {
    if (t.parentTaskId) {
      lines.push(`  ${idOf(t.parentTaskId)} --> ${idOf(t.id)}`);
    }
  }
  return lines.join('\n');
}

/**
 * Saved-tasks browser + workspace checkpoints (from workspace_snapshot_save).
 */
export default function TasksModal() {
  const show = useApp((s) => s.showTasks);
  const setShow = useApp((s) => s.setShowTasks);
  const pushLog = useApp((s) => s.pushLog);
  const projectRoot = useApp((s) => s.projectRoot);
  const refreshFileTreeFromDisk = useApp((s) => s.refreshFileTreeFromDisk);
  const setActive = useTasks((s) => s.setActive);

  const tasks = useTasks((s) => s.tasks);
  const refresh = useTasks((s) => s.refresh);
  const remove = useTasks((s) => s.remove);

  const [panelMode, setPanelMode] = useState<PanelMode>('tasks');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | AgentTaskStatus>('all');

  const [checkpoints, setCheckpoints] = useState<WorkspaceCheckpointSummary[]>([]);
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string | null>(null);
  const [checkpointDetail, setCheckpointDetail] = useState<WorkspaceCheckpointPayload | null>(null);

  useEffect(() => {
    if (!show) return;
    void refresh();
  }, [show, refresh]);

  useEffect(() => {
    if (!show) {
      setSelectedCheckpointId(null);
      setCheckpointDetail(null);
    }
  }, [show]);

  useEffect(() => {
    if (!show || panelMode !== 'checkpoints') return;
    let cancelled = false;
    void (async () => {
      try {
        const list = await window.api.checkpoints.list();
        if (!cancelled) setCheckpoints(list);
      } catch (e) {
        if (!cancelled) pushLog('error', `Checkpoints: ${(e as Error).message}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [show, panelMode, pushLog]);

  useEffect(() => {
    if (!show || panelMode !== 'checkpoints' || !selectedCheckpointId) {
      setCheckpointDetail(null);
      return;
    }
    let cancelled = false;
    void window.api.checkpoints.get(selectedCheckpointId).then((p) => {
      if (!cancelled) setCheckpointDetail(p);
    });
    return () => {
      cancelled = true;
    };
  }, [show, panelMode, selectedCheckpointId]);

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t] as const)), [tasks]);

  const taskDepth = useMemo(() => {
    const memo = new Map<string, number>();
    const depth = (t: AgentTask): number => {
      if (memo.has(t.id)) return memo.get(t.id)!;
      if (!t.parentTaskId) {
        memo.set(t.id, 0);
        return 0;
      }
      const p = taskById.get(t.parentTaskId);
      const d = p ? 1 + depth(p) : 0;
      memo.set(t.id, d);
      return d;
    };
    return (t: AgentTask) => depth(t);
  }, [taskById]);

  const visible = useMemo(() => {
    if (filter === 'all') return tasks;
    return tasks.filter((t) => t.status === filter);
  }, [tasks, filter]);

  const selected = useMemo(
    () => tasks.find((t) => t.id === selectedId) ?? null,
    [tasks, selectedId],
  );

  const refreshCheckpointList = async () => {
    try {
      const list = await window.api.checkpoints.list();
      setCheckpoints(list);
    } catch (e) {
      pushLog('error', `Checkpoints refresh: ${(e as Error).message}`);
    }
  };

  if (!show) return null;

  const resume = async (task: AgentTask) => {
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

  const restoreCheckpoint = async (id: string) => {
    if (!projectRoot) {
      toast.error('Open a project folder first.');
      return;
    }
    // eslint-disable-next-line no-alert
    if (
      !confirm(
        'Restore files from this checkpoint?\n\nMatching paths in the current workspace will be overwritten.',
      )
    ) {
      return;
    }
    const r = await window.api.checkpoints.restore(id);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(`Restored ${r.written.length} file(s)`);
    await refreshFileTreeFromDisk();
    const st = useApp.getState();
    for (const rel of r.written) {
      try {
        const content = await window.api.fs.readFile(rel);
        st.syncOpenTabFromAgentWrite(rel, content);
      } catch {
        /* tab may be closed */
      }
    }
    pushLog('info', `Checkpoint restored ${r.written.length} file(s).`);
  };

  const deleteCheckpointEntry = async (id: string, label: string) => {
    // eslint-disable-next-line no-alert
    if (
      !confirm(
        `Delete checkpoint "${label}"?\n\nThe snapshot JSON will be removed from disk. Open files are unchanged unless you restored already.`,
      )
    ) {
      return;
    }
    const r = await window.api.checkpoints.delete(id);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success('Checkpoint deleted');
    if (selectedCheckpointId === id) {
      setSelectedCheckpointId(null);
      setCheckpointDetail(null);
    }
    await refreshCheckpointList();
    pushLog('info', `Deleted checkpoint "${label}".`);
  };

  const normRoot = (r: string | null) => (r ? r.replace(/\\/g, '/').replace(/\/$/, '') : '');
  const rootMismatch =
    checkpointDetail &&
    projectRoot &&
    normRoot(checkpointDetail.projectRoot) !== normRoot(projectRoot);

  return (
    <div className="modal-scrim fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="glass-panel glass-modal-lg flex h-[75vh] w-full max-w-5xl overflow-hidden ds-transition">
        <div className="flex w-72 min-w-0 flex-col border-r border-border-soft">
          <div className="flex flex-col gap-2 border-b border-border-soft px-3 py-2">
            <div className="flex items-center justify-between gap-2">
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
                type="button"
                className="rounded border border-border px-2 py-0.5 text-[11px] text-fg-muted hover:bg-bg-hover hover:text-fg"
                onClick={() => {
                  if (panelMode === 'tasks') void refresh();
                  else void refreshCheckpointList();
                }}
              >
                Refresh
              </button>
            </div>
            <div className="flex rounded-md border border-border bg-bg-soft p-0.5" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={panelMode === 'tasks'}
                className={
                  'flex-1 rounded px-2 py-1 text-[11px] font-medium ' +
                  (panelMode === 'tasks'
                    ? 'bg-bg text-accent shadow-sm'
                    : 'text-fg-muted hover:text-fg')
                }
                onClick={() => {
                  setPanelMode('tasks');
                  setSelectedCheckpointId(null);
                  setCheckpointDetail(null);
                }}
              >
                Saved tasks
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={panelMode === 'checkpoints'}
                className={
                  'flex-1 rounded px-2 py-1 text-[11px] font-medium ' +
                  (panelMode === 'checkpoints'
                    ? 'bg-bg text-accent shadow-sm'
                    : 'text-fg-muted hover:text-fg')
                }
                onClick={() => {
                  setPanelMode('checkpoints');
                  setSelectedId(null);
                }}
              >
                Checkpoints
              </button>
            </div>
          </div>
          {panelMode === 'tasks' ? (
            <div className="flex flex-wrap gap-1 border-b border-border-soft p-2">
              {(['all', 'running', 'paused', 'blocked', 'completed', 'failed'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
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
          ) : (
            <div className="border-b border-border-soft px-3 py-2 text-[10px] leading-snug text-fg-muted">
              From <span className="font-mono text-fg-muted">workspace_snapshot_save</span>. Restore
              writes files into the open folder (relative paths).
            </div>
          )}
          <div className="flex-1 overflow-auto">
            {panelMode === 'tasks' ? (
              visible.length === 0 ? (
                <div className="p-4 text-xs text-fg-muted">
                  No tasks. Turn on <strong className="text-fg">Agent Mode</strong> and send a prompt
                  to start one.
                </div>
              ) : (
                visible.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    style={{ paddingLeft: 12 + taskDepth(t) * 14 }}
                    className={
                      'block w-full border-b border-border-soft py-2 pr-3 text-left hover:bg-bg-hover ' +
                      (selectedId === t.id ? 'bg-bg-hover' : '')
                    }
                  >
                    <div className="flex items-center gap-2">
                      {taskDepth(t) > 0 ? (
                        <span className="shrink-0 text-[10px] text-fg-muted" aria-hidden>
                          ↳
                        </span>
                      ) : null}
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
              )
            ) : checkpoints.length === 0 ? (
              <div className="p-4 text-xs text-fg-muted">No checkpoints saved yet.</div>
            ) : (
              checkpoints.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCheckpointId(c.id)}
                  className={
                    'block w-full border-b border-border-soft px-3 py-2 text-left hover:bg-bg-hover ' +
                    (selectedCheckpointId === c.id ? 'bg-bg-hover' : '')
                  }
                >
                  <div className="truncate text-[13px] font-medium text-fg">{c.label}</div>
                  <div className="mt-0.5 text-[10px] text-fg-muted">
                    {c.fileCount} files · {new Date(c.createdAt).toLocaleString()}
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="border-t border-border-soft px-3 py-2 text-right">
            <button
              type="button"
              className="rounded border border-border px-2 py-1 text-xs text-fg-muted hover:bg-bg-hover hover:text-fg"
              onClick={() => setShow(false)}
            >
              Close
            </button>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          {panelMode === 'tasks' ? (
            !selected ? (
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
                      {selected.parentTaskId ? (
                        <>
                          {' '}
                          · sub-task of{' '}
                          <span className="font-mono text-fg">{selected.parentTaskId}</span>
                        </>
                      ) : null}
                    </div>
                    {selected.lastError && (
                      <div className="mt-1 text-[11px] text-danger">Error: {selected.lastError}</div>
                    )}
                    {selected.lastMarker && !selected.lastError && (
                      <div className="mt-1 text-[11px] text-fg-muted">Last: {selected.lastMarker}</div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void resume(selected)}
                      className="rounded bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent/80"
                    >
                      {selected.status === 'completed' ? 'Reopen' : 'Resume'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void del(selected)}
                      className="rounded border border-danger/40 px-2 py-1 text-xs text-danger hover:bg-danger/10"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(JSON.stringify(selected, null, 2));
                        toast.success('Copied task JSON');
                      }}
                      className="rounded border border-border px-2 py-1 text-xs text-fg-muted hover:bg-bg-hover"
                    >
                      Export JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const mm = tasksToMermaid(tasks);
                        void navigator.clipboard.writeText(mm);
                        toast.success('Copied Mermaid DAG');
                      }}
                      className="rounded border border-border px-2 py-1 text-xs text-fg-muted hover:bg-bg-hover"
                    >
                      DAG (Mermaid)
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
            )
          ) : !selectedCheckpointId ? (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-fg-muted">
              Select a checkpoint to inspect file list or restore.
            </div>
          ) : !checkpointDetail ? (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-fg-muted">
              Loading checkpoint…
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border-soft px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-fg">{checkpointDetail.label}</div>
                  <div className="mt-1 font-mono text-[10px] text-fg-muted">{checkpointDetail.id}</div>
                  <div className="mt-1 text-[11px] text-fg-muted">
                    {checkpointDetail.files.length} files · saved{' '}
                    {new Date(checkpointDetail.createdAt).toLocaleString()}
                  </div>
                  {rootMismatch ? (
                    <div className="mt-2 rounded border border-warn/35 bg-warn/10 px-2 py-1 text-[10px] text-warn">
                      Captured under a different absolute root — restoring applies{' '}
                      <strong className="font-medium">relative paths</strong> to the folder you have open now.
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-1">
                  <button
                    type="button"
                    disabled={!projectRoot}
                    onClick={() => void restoreCheckpoint(checkpointDetail.id)}
                    className="rounded bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent/80 disabled:opacity-40"
                  >
                    Restore files
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(JSON.stringify(checkpointDetail, null, 2));
                      toast.success('Copied checkpoint JSON');
                    }}
                    className="rounded border border-border px-2 py-1 text-xs text-fg-muted hover:bg-bg-hover"
                  >
                    Copy JSON
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteCheckpointEntry(checkpointDetail.id, checkpointDetail.label)}
                    className="rounded border border-danger/40 px-2 py-1 text-xs text-danger hover:bg-danger/10"
                  >
                    Delete snapshot
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto px-4 py-3">
                <div className="mb-2 text-[11px] font-medium text-fg-muted">Files in checkpoint</div>
                <ul className="max-h-[min(360px,50vh)] overflow-auto rounded border border-border-soft bg-bg-soft/40 font-mono text-[11px] text-fg-muted">
                  {checkpointDetail.files.map((f) => (
                    <li key={f.path} className="border-b border-border-soft px-2 py-1 last:border-b-0">
                      {f.path}
                    </li>
                  ))}
                </ul>
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
