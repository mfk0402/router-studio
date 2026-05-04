import { memo, useCallback, useState } from 'react';
import { useApp } from '../store/appStore';
import type { OpenTab } from '../store/appStore';

interface TabStripItemProps {
  tab: OpenTab;
  index: number;
  active: boolean;
  dragFrom: number | null;
  setDragFrom: (i: number | null) => void;
  reorderTabs: (from: number, to: number) => void;
  setActiveTab: (path: string) => void;
  onClose: (path: string, dirty: boolean) => void;
}

const TabStripItem = memo(function TabStripItem({
  tab,
  index,
  active,
  dragFrom,
  setDragFrom,
  reorderTabs,
  setActiveTab,
  onClose,
}: TabStripItemProps) {
  return (
    <div
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
      onClick={() => setActiveTab(tab.relativePath)}
      className={[
        'group flex h-full cursor-pointer items-center gap-2 border-b-2 border-r border-border-soft px-3 text-xs transition-colors duration-layout',
        active
          ? 'border-b-accent-electric bg-accent/12 text-fg'
          : 'border-b-transparent text-fg-muted hover:bg-bg-hover',
      ].join(' ')}
      title={tab.relativePath}
    >
      <span className="max-w-[180px] truncate">{tab.name}</span>
      {tab.dirty && (
        <span className="text-warn" title="Unsaved changes">
          ●
        </span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void onClose(tab.relativePath, tab.dirty);
        }}
        className="rounded px-1 text-fg-subtle hover:bg-bg-hover hover:text-fg"
        title="Close"
        aria-label={`Close ${tab.name}`}
      >
        ×
      </button>
    </div>
  );
});

export default function EditorTabs() {
  const tabs = useApp((s) => s.tabs);
  const activeTabPath = useApp((s) => s.activeTabPath);
  const setActiveTab = useApp((s) => s.setActiveTab);
  const closeTab = useApp((s) => s.closeTab);
  const reorderTabs = useApp((s) => s.reorderTabs);
  const pushLog = useApp((s) => s.pushLog);
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  const handleClose = useCallback(
    async (path: string, dirty: boolean) => {
      if (dirty) {
        const confirmed = window.confirm('Close file with unsaved changes?');
        if (!confirmed) return;
      }
      closeTab(path);
      pushLog('info', `Closed ${path}`);
    },
    [closeTab, pushLog],
  );

  if (tabs.length === 0) return null;

  return (
    <div className="chrome-tabstrip flex h-9 shrink-0 items-center overflow-x-auto ds-transition">
      {tabs.map((t, index) => (
        <TabStripItem
          key={t.relativePath}
          tab={t}
          index={index}
          active={t.relativePath === activeTabPath}
          dragFrom={dragFrom}
          setDragFrom={setDragFrom}
          reorderTabs={reorderTabs}
          setActiveTab={setActiveTab}
          onClose={handleClose}
        />
      ))}
    </div>
  );
}
