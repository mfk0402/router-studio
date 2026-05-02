import { useApp } from '../store/appStore';

export default function EditorTabs() {
  const tabs = useApp((s) => s.tabs);
  const activeTabPath = useApp((s) => s.activeTabPath);
  const setActiveTab = useApp((s) => s.setActiveTab);
  const closeTab = useApp((s) => s.closeTab);
  const pushLog = useApp((s) => s.pushLog);

  if (tabs.length === 0) return null;

  const handleClose = async (path: string, dirty: boolean) => {
    if (dirty) {
      const confirmed = window.confirm('Close file with unsaved changes?');
      if (!confirmed) return;
    }
    closeTab(path);
    pushLog('info', `Closed ${path}`);
  };

  return (
    <div className="flex h-9 shrink-0 items-center overflow-x-auto border-b border-border-soft bg-bg-elevated shadow-chrome">
      {tabs.map((t) => {
        const active = t.relativePath === activeTabPath;
        return (
          <div
            key={t.relativePath}
            onClick={() => setActiveTab(t.relativePath)}
            className={[
              'group flex h-full cursor-pointer items-center gap-2 border-r border-border-soft px-3 text-xs',
              active ? 'bg-bg text-fg' : 'text-fg-muted hover:bg-bg-hover',
            ].join(' ')}
            title={t.relativePath}
          >
            <span className="max-w-[180px] truncate">{t.name}</span>
            {t.dirty && <span className="text-warn" title="Unsaved changes">●</span>}
            <button
              onClick={(e) => {
                e.stopPropagation();
                void handleClose(t.relativePath, t.dirty);
              }}
              className="rounded px-1 text-fg-subtle hover:bg-bg-hover hover:text-fg"
              title="Close"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
