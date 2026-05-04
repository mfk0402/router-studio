import { useEffect, useMemo, useRef } from 'react';
import { useApp } from '../store/appStore';
import { useSettings } from '../store/settingsStore';
import { PanelResizeHandle } from './PanelResizeHandle';
import TerminalPane from './TerminalPane';
import { ProblemsPanel } from './ProblemsPanel';
import TestRunnerPanel from './TestRunnerPanel';

export default function BottomPanel() {
  const logs = useApp((s) => s.logs);
  const clearLogs = useApp((s) => s.clearLogs);
  const models = useApp((s) => s.models);
  const freeModeEnabled = useApp((s) => s.freeModeEnabled);
  const settings = useSettings((s) => s.settings);

  const bottomTab = useApp((s) => s.bottomTab);
  const setBottomTab = useApp((s) => s.setBottomTab);
  const collapsed = useApp((s) => s.bottomCollapsed);
  const setCollapsed = useApp((s) => s.setBottomCollapsed);
  // Terminal session is mounted once; keep it alive across tab switches so
  // scrollback / process state is preserved.
  const terminalEverActive = useRef(false);
  if (bottomTab === 'terminal') terminalEverActive.current = true;

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (bottomTab === 'output') {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [logs, bottomTab]);

  const currentModel = useMemo(
    () => models.find((m) => m.id === settings.defaultModel) ?? null,
    [models, settings.defaultModel],
  );

  const priceHint = useMemo(() => {
    if (freeModeEnabled) return 'Free Mode';
    if (!currentModel) return settings.defaultModel;
    if (currentModel.isFree) return 'free';
    const inP = currentModel.pricingPrompt * 1_000_000;
    const outP = currentModel.pricingCompletion * 1_000_000;
    return `in $${inP.toFixed(2)}/M · out $${outP.toFixed(2)}/M`;
  }, [currentModel, settings.defaultModel, freeModeEnabled]);

  return (
    <div className="panel-chrome shrink-0">
      <div className="flex h-8 items-center justify-between border-b border-border-soft px-2 text-[11px] text-fg-muted">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="rounded px-1 text-fg-muted hover:bg-bg-hover hover:text-fg"
            title="Toggle panel"
          >
            {collapsed ? '▸' : '▾'}
          </button>
          <TabButton
            label="Output"
            count={logs.length}
            active={bottomTab === 'output' && !collapsed}
            onClick={() => {
              setCollapsed(false);
              setBottomTab('output');
            }}
          />
          <TabButton
            label="Terminal"
            active={bottomTab === 'terminal' && !collapsed}
            onClick={() => {
              setCollapsed(false);
              setBottomTab('terminal');
            }}
          />
          <TabButton
            label="Problems"
            active={bottomTab === 'problems' && !collapsed}
            onClick={() => {
              setCollapsed(false);
              setBottomTab('problems');
            }}
          />
          <TabButton
            label="Tests"
            active={bottomTab === 'tests' && !collapsed}
            onClick={() => {
              setCollapsed(false);
              setBottomTab('tests');
            }}
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="truncate">
            Model:{' '}
            {freeModeEnabled ? 'Free Mode' : currentModel?.name ?? settings.defaultModel}
          </span>
          <span>·</span>
          <span>{priceHint}</span>
          {bottomTab === 'output' && (
            <button onClick={clearLogs} className="hover:text-fg">
              Clear
            </button>
          )}
        </div>
      </div>
      {!collapsed && (
        <>
          <PanelResizeHandle
            orientation="row"
            onDrag={(dy) => {
              const cur = useSettings.getState().settings.bottomPanelHeightPx;
              void useSettings.getState().update({
                bottomPanelHeightPx: Math.min(560, Math.max(120, cur - dy)),
              });
            }}
          />
          <div
            className="relative border-t border-border-soft bg-[#0b0d12]"
            style={{ height: settings.bottomPanelHeightPx }}
          >
            <div
              ref={scrollRef}
              className={
                'absolute inset-0 overflow-auto px-3 py-2 font-mono text-[11px] ' +
                (bottomTab === 'output' ? 'block' : 'hidden')
              }
            >
            {logs.length === 0 ? (
              <div className="text-fg-subtle">No output yet.</div>
            ) : (
              logs.map((l) => (
                <div
                  key={l.id}
                  className={
                    l.level === 'error'
                      ? 'text-danger'
                      : l.level === 'warn'
                      ? 'text-warn'
                      : 'text-fg-muted'
                  }
                >
                  <span className="text-fg-subtle">
                    {new Date(l.at).toLocaleTimeString()}{' '}
                  </span>
                  {l.text}
                </div>
              ))
            )}
            </div>
          {/* Keep the terminal mounted after its first activation so its
              session and scrollback survive tab switches. */}
          {terminalEverActive.current && (
            <div
              className={
                'absolute inset-0 ' + (bottomTab === 'terminal' ? 'block' : 'hidden')
              }
            >
              <TerminalPane active={bottomTab === 'terminal'} />
            </div>
          )}
          {/* Problems panel */}
          <div
            className={
              'absolute inset-0 ' + (bottomTab === 'problems' ? 'block' : 'hidden')
            }
          >
            <ProblemsPanel />
          </div>
          {/* Test runner panel */}
          <div
            className={
              'absolute inset-0 ' + (bottomTab === 'tests' ? 'block' : 'hidden')
            }
          >
            <TestRunnerPanel />
          </div>
          </div>
        </>
      )}
    </div>
  );
}

function TabButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'rounded px-2 py-0.5 text-[11px]',
        active ? 'bg-bg text-fg' : 'text-fg-muted hover:bg-bg-hover hover:text-fg',
      ].join(' ')}
    >
      {label}
      {typeof count === 'number' && count > 0 && (
        <span className="ml-1 text-fg-subtle">({count})</span>
      )}
    </button>
  );
}
