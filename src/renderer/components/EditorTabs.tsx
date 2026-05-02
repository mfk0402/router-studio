import { useState } from 'react';
import { useApp } from '../store/appStore';

export default function EditorTabs() {
  const tabs = useApp((s) => s.tabs);
  const activeTabPath = useApp((s) => s.activeTabPath);
  const setActiveTab = useApp((s) => s.setActiveTab);
  const closeTab = useApp((s) => s.closeTab);
  const reorderTabs = useApp((s) => s.reorderTabs);
  const pushLog = useApp((s) => s.pushLog);
  const [dragFrom, setDragFrom] = useState<number | null>(null);

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
      {tabs.map((t, index) => {
        const active = t.relativePath === activeTabPath;
        return (
          <div
            key={t.relativePath}
            role="tab"
            aria-selected={active}
            draggable
            onDragStart={() => setDragFrom(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragFrom != null) {
                reorderTabs(dragFrom, index);
                setDragFrom(null);
              }
            }}
            onDragEnd={() => setDragFrom(null)}
            onClick={() => setActiveTab(t.relativePath)}
            className={[
              'group flex h-full cursor-pointer items-center gap-2 border-r border-border-soft px-3 text-xs',
              active ? 'bg-bg text-fg' : 'text-fg-muted hover:bg-bg-hover',
            ].join(' ')}
            title={t.relativePath}
          >
            <span className="max-w-[180px] truncate">{t.name}</span>
            {t.dirty && (
              <span className="text-warn" title="Unsaved changes">
                ●
              </span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void handleClose(t.relativePath, t.dirty);
              }}
              className="rounded px-1 text-fg-subtle hover:bg-bg-hover hover:text-fg"
              title="Close"
              aria-label={`Close ${t.name}`}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
