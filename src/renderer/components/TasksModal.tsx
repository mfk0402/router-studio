import { useEffect, useMemo, useState } from 'react';
import { createTwoFilesPatch } from 'diff';
import { useApp } from '../store/appStore';
import { useSettings } from '../store/settingsStore';
import { useTasks } from '../store/tasksStore';
import type {
  AgentRunEvent,
  AgentTask,
  AgentTaskPhase,
  AgentTaskStatus,
  ModelRouteExplanation,
  ProjectGraphSnapshot,
  WorkspaceCheckpointPayload,
  WorkspaceCheckpointSummary,
} from '../../shared/types';
import logoIcon from '../assets/logo-icon.png';
import { toast } from './ToastContainer';
import { TaskChecklist } from './TaskChecklist';

type PanelMode = 'agents' | 'checkpoints' | 'intelligence';

function tasksToMermaid(taskList: AgentTask[]): string {
  const esc = (s: string) => s.replace(/"/g, "'");
  const idOf = (raw: string) => `t_${raw.replace(/[^a-zA-Z0-9_]/g, '_')}`;
  const lines = ['flowchart TD'];
  for (const t of taskList) lines.push(`  ${idOf(t.id)}["${esc(t.title)}"]`);
  for (const t of taskList) {
    if (t.parentTaskId) lines.push(`  ${idOf(t.parentTaskId)} --> ${idOf(t.id)}`);
  }
  return lines.join('\n');
}

function shortDate(ts?: number | null): string {
  return ts ? new Date(ts).toLocaleString() : 'never';
}

function statusTone(status: AgentTaskStatus): string {
  switch (status) {
    case 'queued':
      return 'bg-cyan/20 text-cyan';
    case 'running':
      return 'bg-accent/20 text-accent';
    case 'completed':
      return 'bg-success/20 text-success';
    case 'failed':
      return 'bg-danger/20 text-danger';
    case 'blocked':
      return 'bg-warn/20 text-warn';
    default:
      return 'bg-fg-subtle/20 text-fg-muted';
  }
}

function eventTone(status: AgentRunEvent['status']): string {
  switch (status) {
    case 'success':
      return 'border-success/40 bg-success/10';
    case 'error':
      return 'border-danger/45 bg-danger/10';
    case 'denied':
      return 'border-warn/45 bg-warn/10';
    case 'running':
      return 'border-accent/45 bg-accent/10';
    default:
      return 'border-border-soft bg-bg-soft/45';
  }
}

function defaultPhaseForStatus(status: AgentTaskStatus): AgentTaskPhase {
  if (status === 'queued') return 'queued';
  if (status === 'completed') return 'done';
  if (status === 'running') return 'implement';
  return 'plan';
}

function taskPhaseLabel(task: AgentTask): string {
  return task.phase ?? defaultPhaseForStatus(task.status);
}

function deriveTaskReport(task: AgentTask, events: AgentRunEvent[]) {
  const changedFiles = new Set<string>();
  const verification: string[] = [];
  const risks: string[] = [];
  for (const e of events) {
    if (e.type === 'tool' && e.detail) {
      const matches = e.detail.match(/["']?([A-Za-z0-9_.\-\/\\]+\.(?:ts|tsx|js|jsx|css|md|json|py|rs|go))["']?/g);
      for (const m of matches ?? []) changedFiles.add(m.replace(/["']/g, '').replace(/\\/g, '/'));
    }
    if (e.type === 'verification') verification.push(`${e.status}: ${e.title}`);
    if (e.type === 'trust' || e.status === 'denied' || e.status === 'error') {
      risks.push(`${e.title}${e.detail ? ` - ${e.detail}` : ''}`);
    }
  }
  return {
    summary: task.report?.summary || task.goal,
    changedFiles: task.report?.changedFiles?.length ? task.report.changedFiles : [...changedFiles].slice(0, 16),
    verification: task.report?.verification?.length ? task.report.verification : verification.slice(0, 8),
    risks: task.report?.risks?.length ? task.report.risks : risks.slice(0, 8),
    nextSteps: task.report?.nextSteps ?? [],
  };
}

export default function TasksModal() {
  const show = useApp((s) => s.showTasks);
  const setShow = useApp((s) => s.setShowTasks);
  const pushLog = useApp((s) => s.pushLog);
  const projectRoot = useApp((s) => s.projectRoot);
  const refreshFileTreeFromDisk = useApp((s) => s.refreshFileTreeFromDisk);
  const models = useApp((s) => s.models);
  const settings = useSettings((s) => s.settings);
  const setActive = useTasks((s) => s.setActive);
  const tasks = useTasks((s) => s.tasks);
  const refresh = useTasks((s) => s.refresh);
  const remove = useTasks((s) => s.remove);
  const saveTask = useTasks((s) => s.save);

  const [panelMode, setPanelMode] = useState<PanelMode>('agents');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | AgentTaskStatus>('all');
  const [events, setEvents] = useState<AgentRunEvent[]>([]);
  const [routeExplanation, setRouteExplanation] = useState<ModelRouteExplanation | null>(null);

  const [checkpoints, setCheckpoints] = useState<WorkspaceCheckpointSummary[]>([]);
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string | null>(null);
  const [checkpointDetail, setCheckpointDetail] = useState<WorkspaceCheckpointPayload | null>(null);
  const [checkpointCompare, setCheckpointCompare] = useState<{ path: string; patch: string } | null>(null);

  const [graph, setGraph] = useState<ProjectGraphSnapshot | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [recommendPrompt, setRecommendPrompt] = useState('');
  const [recommendations, setRecommendations] = useState<Array<{ path: string; score: number; reason: string }>>([]);

  useEffect(() => {
    if (!show) return;
    void refresh();
    void refreshCheckpointList();
    void loadGraph(false);
  }, [show]);

  useEffect(() => {
    if (!show || !selectedId) {
      setEvents([]);
      setRouteExplanation(null);
      return;
    }
    let cancelled = false;
    void window.api.agentEvents.list(selectedId).then((list) => {
      if (!cancelled) setEvents(list);
    });
    return () => {
      cancelled = true;
    };
  }, [show, selectedId]);

  useEffect(() => {
    if (!show) return;
    return window.api.events.onAgentEvent((event) => {
      if (event.taskId === selectedId) {
        setEvents((prev) => [...prev.filter((e) => e.id !== event.id), event].sort((a, b) => a.createdAt - b.createdAt));
      }
      void refresh();
    });
  }, [show, selectedId, refresh]);

  const selected = useMemo(
    () => tasks.find((t) => t.id === selectedId) ?? tasks[0] ?? null,
    [tasks, selectedId],
  );

  useEffect(() => {
    if (!selectedId && tasks.length > 0) setSelectedId(tasks[0]!.id);
  }, [tasks, selectedId]);

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

  const visibleTasks = useMemo(() => {
    const list = filter === 'all' ? tasks : tasks.filter((t) => t.status === filter);
    const rank = (p: AgentTask['priority']) => (p === 'high' ? 0 : p === 'normal' ? 1 : 2);
    return [...list].sort(
      (a, b) =>
        rank(a.priority) - rank(b.priority) ||
        (b.updatedAt ?? 0) - (a.updatedAt ?? 0),
    );
  }, [tasks, filter]);

  const queueStats = useMemo(() => {
    const queued = tasks.filter((t) => t.status === 'queued').length;
    const running = tasks.filter((t) => t.status === 'running').length;
    const blocked = tasks.filter((t) => t.status === 'blocked' || t.status === 'failed').length;
    const checkpointsTotal = tasks.reduce((sum, t) => sum + (t.checkpointIds?.length ?? 0), 0);
    return { queued, running, blocked, checkpointsTotal };
  }, [tasks]);

  if (!show) return null;

  async function refreshCheckpointList() {
    try {
      setCheckpoints(await window.api.checkpoints.list());
    } catch (e) {
      pushLog('error', `Checkpoints refresh: ${(e as Error).message}`);
    }
  }

  async function loadGraph(rebuild: boolean) {
    setGraphLoading(true);
    try {
      const next = rebuild ? await window.api.projectGraph.rebuild() : await window.api.projectGraph.get();
      setGraph(next);
    } catch (e) {
      toast.error('Project graph failed', (e as Error).message);
    } finally {
      setGraphLoading(false);
    }
  }

  async function explainRouteForTask(task: AgentTask) {
    try {
      const explanation = await window.api.modelRouter.explainRoute({
        prompt: task.goal,
        estimatedPromptTokens: Math.max(800, task.goal.length / 4 + task.messages.length * 600),
        hasImageAttachment: false,
        models,
      });
      setRouteExplanation(explanation);
    } catch (e) {
      toast.error('Router explanation failed', (e as Error).message);
    }
  }

  async function recommendContext() {
    const query = recommendPrompt.trim() || selected?.goal || '';
    if (!query) return;
    try {
      setRecommendations(await window.api.projectGraph.recommend(query, 14));
    } catch (e) {
      toast.error('Context recommendation failed', (e as Error).message);
    }
  }

  async function resume(task: AgentTask) {
    const chat = task.messages.map((m, i) => ({
      id: `${task.id}-${i}`,
      role: m.role,
      content: m.content,
      createdAt: task.createdAt + i,
    }));
    useApp.setState({ chat, attachments: [] });
    setActive(task.id);
    await window.api.agentQueue.updateStatus(task.id, 'running', task.phase ?? 'implement');
    setShow(false);
    pushLog('info', `Took over "${task.title}" in the AI panel.`);
  }

  async function queueTask(task: AgentTask) {
    const saved = await window.api.agentQueue.enqueue({
      ...task,
      status: 'queued',
      phase: 'queued',
      queuedAt: Date.now(),
    });
    await saveTask(saved);
    await refresh();
    toast.success('Queued', task.title);
  }

  async function setStatus(task: AgentTask, status: AgentTaskStatus, phase?: AgentTaskPhase) {
    const saved = await window.api.agentQueue.updateStatus(task.id, status, phase);
    if (saved) await saveTask(saved);
    await refresh();
  }

  async function deleteTask(task: AgentTask) {
    if (!confirm(`Delete task "${task.title}"? This cannot be undone.`)) return;
    await remove(task.id);
    if (selectedId === task.id) setSelectedId(null);
  }

  async function copyReport(task: AgentTask) {
    const report = deriveTaskReport(task, events);
    const md = [
      `# ${task.title}`,
      '',
      `Status: ${task.status}`,
      `Phase: ${taskPhaseLabel(task)}`,
      `Model: ${task.modelUsed}`,
      '',
      '## Summary',
      report.summary,
      '',
      '## Changed Files',
      ...(report.changedFiles.length ? report.changedFiles.map((f) => `- ${f}`) : ['- None recorded']),
      '',
      '## Verification',
      ...(report.verification.length ? report.verification.map((v) => `- ${v}`) : ['- Not run']),
      '',
      '## Risks / Trust Ledger',
      ...(report.risks.length ? report.risks.map((r) => `- ${r}`) : ['- No blocking trust events recorded']),
    ].join('\n');
    await navigator.clipboard.writeText(md);
    toast.success('Copied task report');
  }

  async function restoreCheckpoint(id: string) {
    if (!projectRoot) {
      toast.error('Open a project folder first.');
      return;
    }
    if (!confirm('Restore files from this checkpoint?\n\nMatching paths in the current workspace will be overwritten.')) return;
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
        // closed tab or binary
      }
    }
    pushLog('info', `Checkpoint restored ${r.written.length} file(s).`);
  }

  async function deleteCheckpointEntry(id: string, label: string) {
    if (!confirm(`Delete checkpoint "${label}"?`)) return;
    const r = await window.api.checkpoints.delete(id);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success('Checkpoint deleted');
    if (selectedCheckpointId === id) {
      setSelectedCheckpointId(null);
      setCheckpointDetail(null);
      setCheckpointCompare(null);
    }
    await refreshCheckpointList();
  }

  async function compareCheckpointFileToWorkspace(relPath: string, snapshotContent: string) {
    try {
      const disk = await window.api.fs.readFileIfExists(relPath);
      setCheckpointCompare({
        path: relPath,
        patch: createTwoFilesPatch(relPath, relPath, snapshotContent, disk ?? '', 'checkpoint', 'workspace', {
          context: 3,
        }),
      });
    } catch (e) {
      toast.error('Compare failed', (e as Error).message);
    }
  }

  const rootMismatch =
    checkpointDetail &&
    projectRoot &&
    checkpointDetail.projectRoot.replace(/\\/g, '/').replace(/\/$/, '') !==
      projectRoot.replace(/\\/g, '/').replace(/\/$/, '');

  return (
    <div className="modal-scrim fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="glass-panel glass-modal-lg flex h-[82vh] w-full max-w-7xl overflow-hidden ds-transition">
        <aside className="flex w-80 min-w-0 flex-col border-r border-border-soft bg-bg-soft/35">
          <div className="border-b border-border-soft px-3 py-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="brand-mark-icon-wrap">
                  <img src={logoIcon} alt="" className="h-6 w-6" draggable={false} />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-fg">Agent Command Center</div>
                  <div className="truncate text-[10px] text-fg-muted">
                    {settings.maxBackgroundAgents} worker{settings.maxBackgroundAgents === 1 ? '' : 's'} · auto-start{' '}
                    {settings.agentQueueAutoStart ? 'on' : 'off'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="rounded border border-border px-2 py-1 text-xs text-fg-muted hover:bg-bg-hover hover:text-fg"
                onClick={() => {
                  void refresh();
                  void refreshCheckpointList();
                }}
              >
                Refresh
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1 text-center text-[10px]">
              <Metric label="Queued" value={queueStats.queued} />
              <Metric label="Running" value={queueStats.running} />
              <Metric label="Risk" value={queueStats.blocked} />
              <Metric label="Snaps" value={queueStats.checkpointsTotal} />
            </div>
            <div className="mt-3 flex rounded-md border border-border bg-bg-soft p-0.5" role="tablist">
              {(['agents', 'checkpoints', 'intelligence'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={panelMode === mode}
                  className={
                    'flex-1 rounded px-2 py-1 text-[11px] font-medium capitalize ' +
                    (panelMode === mode ? 'bg-bg text-accent shadow-sm' : 'text-fg-muted hover:text-fg')
                  }
                  onClick={() => setPanelMode(mode)}
                >
                  {mode === 'agents' ? 'Agents' : mode}
                </button>
              ))}
            </div>
          </div>

          {panelMode === 'agents' ? (
            <>
              <div className="flex flex-wrap gap-1 border-b border-border-soft p-2">
                {(['all', 'queued', 'running', 'paused', 'blocked', 'completed', 'failed'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={
                      'rounded px-2 py-0.5 text-[11px] ' +
                      (filter === f ? 'bg-accent/20 text-accent' : 'border border-border text-fg-muted hover:bg-bg-hover')
                    }
                  >
                    {f}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-auto">
                {visibleTasks.length === 0 ? (
                  <div className="p-4 text-xs text-fg-muted">No agent tasks yet.</div>
                ) : (
                  visibleTasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => setSelectedId(task.id)}
                      className={
                        'block w-full border-b border-border-soft px-3 py-2 text-left hover:bg-bg-hover ' +
                        (selected?.id === task.id ? 'bg-bg-hover' : '')
                      }
                    >
                      <div className="flex items-center gap-2">
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${statusTone(task.status)}`}>
                          {task.status}
                        </span>
                        <div className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">{task.title}</div>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-fg-muted">
                        <span>{taskPhaseLabel(task)}</span>
                        <span>·</span>
                        <span>{task.iterations}/{task.maxIterations}</span>
                        <span>·</span>
                        <span>{shortDate(task.updatedAt)}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </>
          ) : panelMode === 'checkpoints' ? (
            <CheckpointList
              checkpoints={checkpoints}
              selectedId={selectedCheckpointId}
              onSelect={setSelectedCheckpointId}
            />
          ) : (
            <div className="flex-1 overflow-auto p-3 text-xs text-fg-muted">
              <div className="mb-2 font-semibold uppercase tracking-wide text-fg-subtle">Project graph</div>
              <div className="space-y-2">
                <MetricRow label="Files" value={graph?.files.length ?? 0} />
                <MetricRow label="Symbols" value={graph?.symbols.length ?? 0} />
                <MetricRow label="Imports" value={graph?.imports.length ?? 0} />
                <MetricRow label="Routes" value={graph?.routes.length ?? 0} />
              </div>
              <button
                type="button"
                disabled={graphLoading || !projectRoot}
                className="mt-3 w-full rounded border border-border px-2 py-1 text-xs text-fg-muted hover:bg-bg-hover disabled:opacity-50"
                onClick={() => void loadGraph(true)}
              >
                {graphLoading ? 'Indexing...' : 'Rebuild graph'}
              </button>
            </div>
          )}
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          {panelMode === 'agents' ? (
            selected ? (
              <AgentDetail
                task={selected}
                events={events}
                routeExplanation={routeExplanation}
                onExplainRoute={() => void explainRouteForTask(selected)}
                onResume={() => void resume(selected)}
                onQueue={() => void queueTask(selected)}
                onPause={() => void setStatus(selected, 'paused', selected.phase)}
                onComplete={() => void setStatus(selected, 'completed', 'done')}
                onDelete={() => void deleteTask(selected)}
                onCopyDag={() => {
                  void navigator.clipboard.writeText(tasksToMermaid(tasks));
                  toast.success('Copied Mermaid DAG');
                }}
                onCopyJson={() => {
                  void navigator.clipboard.writeText(JSON.stringify(selected, null, 2));
                  toast.success('Copied task JSON');
                }}
                onCopyReport={() => void copyReport(selected)}
              />
            ) : (
              <EmptyState title="No task selected" detail="Start an Agent Mode chat or spawn a child agent to fill this cockpit." />
            )
          ) : panelMode === 'checkpoints' ? (
            <CheckpointDetail
              detail={checkpointDetail}
              selectedCheckpointId={selectedCheckpointId}
              compare={checkpointCompare}
              rootMismatch={!!rootMismatch}
              projectOpen={!!projectRoot}
              onRestore={restoreCheckpoint}
              onDelete={deleteCheckpointEntry}
              onCompare={compareCheckpointFileToWorkspace}
              onCloseCompare={() => setCheckpointCompare(null)}
            />
          ) : (
            <IntelligenceDetail
              graph={graph}
              loading={graphLoading}
              query={recommendPrompt}
              setQuery={setRecommendPrompt}
              recommendations={recommendations}
              onRecommend={() => void recommendContext()}
              onRebuild={() => void loadGraph(true)}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-border-soft bg-bg/60 px-1.5 py-1">
      <div className="font-semibold text-fg">{value}</div>
      <div className="text-[9px] uppercase tracking-wide text-fg-subtle">{label}</div>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between rounded border border-border-soft bg-bg/50 px-2 py-1">
      <span>{label}</span>
      <span className="font-mono text-fg">{value}</span>
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6 text-center">
      <div>
        <div className="text-sm font-semibold text-fg">{title}</div>
        <div className="mt-1 max-w-md text-xs text-fg-muted">{detail}</div>
      </div>
    </div>
  );
}

function AgentDetail({
  task,
  events,
  routeExplanation,
  onExplainRoute,
  onResume,
  onQueue,
  onPause,
  onComplete,
  onDelete,
  onCopyDag,
  onCopyJson,
  onCopyReport,
}: {
  task: AgentTask;
  events: AgentRunEvent[];
  routeExplanation: ModelRouteExplanation | null;
  onExplainRoute: () => void;
  onResume: () => void;
  onQueue: () => void;
  onPause: () => void;
  onComplete: () => void;
  onDelete: () => void;
  onCopyDag: () => void;
  onCopyJson: () => void;
  onCopyReport: () => void;
}) {
  const report = deriveTaskReport(task, events);
  const trustEvents = events.filter((e) => e.type === 'approval' || e.type === 'trust' || e.status === 'denied' || e.status === 'error');
  return (
    <>
      <header className="border-b border-border-soft px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${statusTone(task.status)}`}>
                {task.status}
              </span>
              <span className="rounded border border-border-soft px-2 py-0.5 text-[10px] text-fg-muted">
                {taskPhaseLabel(task)}
              </span>
              <h2 className="truncate text-base font-semibold text-fg">{task.title}</h2>
            </div>
            <div className="mt-1 text-[11px] text-fg-muted">
              {task.modelUsed} · {task.iterations}/{task.maxIterations} iter · updated {shortDate(task.updatedAt)}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-1">
            <button className="rounded bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent/85" onClick={onResume}>
              Take over
            </button>
            <button className="rounded border border-border px-2 py-1 text-xs text-fg-muted hover:bg-bg-hover" onClick={onQueue}>
              Queue
            </button>
            <button className="rounded border border-border px-2 py-1 text-xs text-fg-muted hover:bg-bg-hover" onClick={onPause}>
              Pause
            </button>
            <button className="rounded border border-success/40 px-2 py-1 text-xs text-success hover:bg-success/10" onClick={onComplete}>
              Complete
            </button>
            <button className="rounded border border-danger/40 px-2 py-1 text-xs text-danger hover:bg-danger/10" onClick={onDelete}>
              Delete
            </button>
          </div>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px] overflow-hidden">
        <section className="min-w-0 overflow-auto px-4 py-3">
          <div className="mb-3 rounded-lg border border-border-soft bg-bg-soft/40 p-3">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">Goal</div>
            <div className="text-sm leading-relaxed text-fg">{task.goal}</div>
          </div>
          {task.plan?.length ? (
            <div className="mb-3">
              <TaskChecklist steps={task.plan} />
            </div>
          ) : null}
          <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
            <InfoBox label="Queued" value={shortDate(task.queuedAt)} />
            <InfoBox label="Started" value={shortDate(task.startedAt)} />
            <InfoBox label="Completed" value={shortDate(task.completedAt)} />
            <InfoBox label="Checkpoints" value={String(task.checkpointIds?.length ?? 0)} />
          </div>
          <div className="rounded-lg border border-border-soft bg-bg/60">
            <div className="flex items-center justify-between border-b border-border-soft px-3 py-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">Timeline</div>
              <div className="text-[10px] text-fg-muted">{events.length} events</div>
            </div>
            <div className="max-h-[42vh] overflow-auto p-2">
              {events.length === 0 ? (
                <div className="p-4 text-xs text-fg-muted">No timeline events yet. Tool runs, approvals, checkpoints, and reports will appear here.</div>
              ) : (
                events.map((event) => (
                  <div key={event.id} className={`mb-2 rounded border px-3 py-2 text-xs ${eventTone(event.status)}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 truncate font-medium text-fg">{event.title}</div>
                      <div className="shrink-0 text-[10px] text-fg-subtle">{new Date(event.createdAt).toLocaleTimeString()}</div>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-1 text-[10px] text-fg-muted">
                      <span>{event.type}</span>
                      <span>·</span>
                      <span>{event.status}</span>
                      {event.checkpointId ? <span>· checkpoint {event.checkpointId.slice(0, 8)}</span> : null}
                    </div>
                    {event.detail ? <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] text-fg-muted">{event.detail}</pre> : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
        <aside className="min-w-0 overflow-auto border-l border-border-soft bg-bg-soft/25 p-3">
          <div className="mb-3 rounded-lg border border-border-soft bg-bg/50 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">Smart router</div>
              <button className="rounded border border-border px-2 py-0.5 text-[10px] text-fg-muted hover:bg-bg-hover" onClick={onExplainRoute}>
                Explain
              </button>
            </div>
            {routeExplanation ? (
              <div className="space-y-1 text-[11px] text-fg-muted">
                <MetricRow label="Task" value={0} />
                <div><strong className="text-fg">Type:</strong> {routeExplanation.taskType}</div>
                <div><strong className="text-fg">Primary:</strong> {routeExplanation.primaryModel}</div>
                <div><strong className="text-fg">Reasoning:</strong> {routeExplanation.reasoningModel}</div>
                <div><strong className="text-fg">Estimate:</strong> {routeExplanation.estimatedCostUsd == null ? 'unknown' : `$${routeExplanation.estimatedCostUsd.toFixed(4)}`}</div>
                <div className={routeExplanation.budgetOk ? 'text-success' : 'text-danger'}>
                  {routeExplanation.budgetOk ? 'Within budget' : 'Above task ceiling'}
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-fg-muted">Route explanations show why a model was chosen and whether the task is inside your cost ceiling.</div>
            )}
          </div>
          <div className="mb-3 rounded-lg border border-border-soft bg-bg/50 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Trust ledger</div>
            {trustEvents.length === 0 ? (
              <div className="text-[11px] text-fg-muted">No approvals, denials, warnings, or tool errors recorded.</div>
            ) : (
              <div className="space-y-2">
                {trustEvents.slice(-8).map((event) => (
                  <div key={event.id} className="rounded border border-border-soft bg-bg-soft/45 px-2 py-1 text-[11px]">
                    <div className="font-medium text-fg">{event.title}</div>
                    <div className="text-fg-muted">{event.detail ?? event.status}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-lg border border-border-soft bg-bg/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">Task report</div>
              <button className="rounded border border-border px-2 py-0.5 text-[10px] text-fg-muted hover:bg-bg-hover" onClick={onCopyReport}>
                Copy
              </button>
            </div>
            <div className="space-y-2 text-[11px] text-fg-muted">
              <div>{report.summary}</div>
              <ReportList label="Changed files" rows={report.changedFiles} empty="None recorded" />
              <ReportList label="Verification" rows={report.verification} empty="Not run" />
              <ReportList label="Risks" rows={report.risks} empty="No risks recorded" />
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              <button className="rounded border border-border px-2 py-1 text-[10px] text-fg-muted hover:bg-bg-hover" onClick={onCopyJson}>
                JSON
              </button>
              <button className="rounded border border-border px-2 py-1 text-[10px] text-fg-muted hover:bg-bg-hover" onClick={onCopyDag}>
                DAG
              </button>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border-soft bg-bg-soft/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-fg-subtle">{label}</div>
      <div className="truncate font-mono text-[11px] text-fg">{value}</div>
    </div>
  );
}

function ReportList({ label, rows, empty }: { label: string; rows: string[]; empty: string }) {
  return (
    <div>
      <div className="font-medium text-fg">{label}</div>
      <ul className="mt-1 space-y-0.5">
        {(rows.length ? rows : [empty]).slice(0, 8).map((row, i) => (
          <li key={`${row}-${i}`} className="truncate">- {row}</li>
        ))}
      </ul>
    </div>
  );
}

function CheckpointList({
  checkpoints,
  selectedId,
  onSelect,
}: {
  checkpoints: WorkspaceCheckpointSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex-1 overflow-auto">
      {checkpoints.length === 0 ? (
        <div className="p-4 text-xs text-fg-muted">No checkpoints saved yet.</div>
      ) : (
        checkpoints.map((checkpoint) => (
          <button
            key={checkpoint.id}
            type="button"
            onClick={() => onSelect(checkpoint.id)}
            className={
              'block w-full border-b border-border-soft px-3 py-2 text-left hover:bg-bg-hover ' +
              (selectedId === checkpoint.id ? 'bg-bg-hover' : '')
            }
          >
            <div className="truncate text-[13px] font-medium text-fg">{checkpoint.label}</div>
            <div className="mt-0.5 text-[10px] text-fg-muted">
              {checkpoint.fileCount} files · {shortDate(checkpoint.createdAt)}
            </div>
            <div className="mt-0.5 truncate font-mono text-[9px] text-fg-subtle" title={checkpoint.capturedRoot}>
              {checkpoint.capturedRoot}
            </div>
          </button>
        ))
      )}
    </div>
  );
}

function CheckpointDetail({
  detail,
  selectedCheckpointId,
  compare,
  rootMismatch,
  projectOpen,
  onRestore,
  onDelete,
  onCompare,
  onCloseCompare,
}: {
  detail: WorkspaceCheckpointPayload | null;
  selectedCheckpointId: string | null;
  compare: { path: string; patch: string } | null;
  rootMismatch: boolean;
  projectOpen: boolean;
  onRestore: (id: string) => Promise<void>;
  onDelete: (id: string, label: string) => Promise<void>;
  onCompare: (relPath: string, snapshotContent: string) => Promise<void>;
  onCloseCompare: () => void;
}) {
  if (!selectedCheckpointId) {
    return <EmptyState title="Select a checkpoint" detail="Inspect snapshots, compare files to disk, restore, or create a branch recipe." />;
  }
  if (!detail) return <EmptyState title="Loading checkpoint" detail="Reading snapshot contents from local user data." />;
  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border-soft px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-fg">{detail.label}</div>
          <div className="mt-1 font-mono text-[10px] text-fg-muted">{detail.id}</div>
          <div className="mt-1 text-[11px] text-fg-muted">{detail.files.length} files · saved {shortDate(detail.createdAt)}</div>
          {rootMismatch ? (
            <div className="mt-2 rounded border border-warn/35 bg-warn/10 px-2 py-1 text-[10px] text-warn">
              Captured under a different root; restore applies relative paths to the currently open folder.
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-1">
          <button disabled={!projectOpen} className="rounded bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent/85 disabled:opacity-40" onClick={() => void onRestore(detail.id)}>
            Restore all
          </button>
          <button className="rounded border border-border px-2 py-1 text-xs text-fg-muted hover:bg-bg-hover" onClick={() => {
            const branch = `checkpoint/${detail.label.replace(/[^\w.-]+/g, '-').slice(0, 48) || detail.id.slice(0, 8)}`;
            void navigator.clipboard.writeText(`git checkout -b ${branch}`);
            toast.success('Copied branch recipe');
          }}>
            Branch recipe
          </button>
          <button className="rounded border border-danger/40 px-2 py-1 text-xs text-danger hover:bg-danger/10" onClick={() => void onDelete(detail.id, detail.label)}>
            Delete
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mb-2 text-[11px] font-medium text-fg-muted">Files in checkpoint</div>
        <ul className="max-h-[38vh] overflow-auto rounded border border-border-soft bg-bg-soft/40 font-mono text-[11px] text-fg-muted">
          {detail.files.map((file) => (
            <li key={file.path} className="flex flex-wrap items-center gap-2 border-b border-border-soft px-2 py-1 last:border-b-0">
              <span className="min-w-0 flex-1 truncate" title={file.path}>{file.path}</span>
              <button disabled={!projectOpen} className="shrink-0 rounded border border-border-soft px-2 py-0.5 text-[10px] text-accent hover:bg-bg-hover disabled:opacity-40" onClick={() => void onCompare(file.path, file.content)}>
                vs disk
              </button>
            </li>
          ))}
        </ul>
        {compare ? (
          <div className="mt-3 rounded border border-border-soft bg-bg/80">
            <div className="flex items-center justify-between gap-2 border-b border-border-soft px-3 py-1.5 text-[11px] text-fg-muted">
              <span className="min-w-0 flex-1 truncate font-mono" title={compare.path}>Diff · {compare.path}</span>
              <button className="rounded border border-border px-2 py-0.5 text-[10px] hover:bg-bg-hover" onClick={onCloseCompare}>Close</button>
            </div>
            <pre className="max-h-[40vh] overflow-auto p-3 text-[10px] leading-snug text-fg">{compare.patch || '-'}</pre>
          </div>
        ) : null}
      </div>
    </>
  );
}

function IntelligenceDetail({
  graph,
  loading,
  query,
  setQuery,
  recommendations,
  onRecommend,
  onRebuild,
}: {
  graph: ProjectGraphSnapshot | null;
  loading: boolean;
  query: string;
  setQuery: (v: string) => void;
  recommendations: Array<{ path: string; score: number; reason: string }>;
  onRecommend: () => void;
  onRebuild: () => void;
}) {
  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border-soft px-4 py-3">
        <div>
          <div className="text-base font-semibold text-fg">Project Intelligence</div>
          <div className="text-[11px] text-fg-muted">
            {graph ? `Indexed ${graph.files.length} files at ${shortDate(graph.builtAt)}` : 'Open a folder to build the graph.'}
          </div>
        </div>
        <button disabled={loading} className="rounded border border-border px-3 py-1 text-xs text-fg-muted hover:bg-bg-hover disabled:opacity-50" onClick={onRebuild}>
          {loading ? 'Indexing...' : 'Rebuild graph'}
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mb-4 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
          <InfoBox label="Files" value={String(graph?.files.length ?? 0)} />
          <InfoBox label="Symbols" value={String(graph?.symbols.length ?? 0)} />
          <InfoBox label="Imports" value={String(graph?.imports.length ?? 0)} />
          <InfoBox label="Routes" value={String(graph?.routes.length ?? 0)} />
        </div>
        <div className="mb-4 rounded-lg border border-border-soft bg-bg-soft/40 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Context recommendations</div>
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Describe the task or files you need"
              className="min-w-0 flex-1 rounded border border-border bg-bg px-2 py-1 text-sm text-fg focus:border-accent focus:outline-none"
            />
            <button className="rounded bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent/85" onClick={onRecommend}>
              Recommend
            </button>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {recommendations.map((rec) => (
              <div key={rec.path} className="rounded border border-border-soft bg-bg/60 px-3 py-2 text-xs">
                <div className="truncate font-mono text-fg" title={rec.path}>{rec.path}</div>
                <div className="mt-1 text-[10px] text-fg-muted">score {rec.score} · {rec.reason}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <GraphList title="Package scripts" rows={Object.entries(graph?.packageScripts ?? {}).map(([k, v]) => `${k}: ${v}`)} />
          <GraphList title="Test commands" rows={graph?.testCommands ?? []} />
          <GraphList title="Routes" rows={(graph?.routes ?? []).map((r) => `${r.route} -> ${r.file}`)} />
          <GraphList title="Top symbols" rows={(graph?.symbols ?? []).slice(0, 40).map((s) => `${s.name} (${s.kind}) - ${s.file}${s.line ? `:${s.line}` : ''}`)} />
        </div>
      </div>
    </>
  );
}

function GraphList({ title, rows }: { title: string; rows: string[] }) {
  return (
    <div className="rounded-lg border border-border-soft bg-bg/60">
      <div className="border-b border-border-soft px-3 py-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{title}</div>
      <div className="max-h-48 overflow-auto p-2 text-[11px] text-fg-muted">
        {rows.length === 0 ? (
          <div className="p-2">None detected.</div>
        ) : (
          rows.slice(0, 80).map((row, i) => <div key={`${row}-${i}`} className="truncate py-0.5 font-mono" title={row}>{row}</div>)
        )}
      </div>
    </div>
  );
}
