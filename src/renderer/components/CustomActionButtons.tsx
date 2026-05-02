import { useState } from 'react';
import { useSettings } from '../store/settingsStore';
import { useApp } from '../store/appStore';
import CustomActionsManager from './CustomActionsManager';

interface CustomActionButtonsProps {
  onAction: (prompt: string) => void;
}

export default function CustomActionButtons({ onAction }: CustomActionButtonsProps) {
  const settings = useSettings((s) => s.settings);
  const selectedCode = useApp((s) => s.selectedCode);
  const activeTabPath = useApp((s) => s.activeTabPath);
  const [showManager, setShowManager] = useState(false);

  const customActions = settings.customActions || [];
  const toolbarActions = customActions.filter((a) => a.showInToolbar);

  const handleAction = (action: { prompt: string }) => {
    let prompt = action.prompt;

    // Replace placeholders
    if (selectedCode) {
      prompt = prompt.replace(/{selection}/g, selectedCode);
    }
    if (activeTabPath) {
      prompt = prompt.replace(/{file}/g, activeTabPath);
    }

    onAction(prompt);
  };

  return (
    <>
      <div className="flex items-center gap-1">
        {toolbarActions.map((action) => (
          <button
            key={action.id}
            onClick={() => handleAction(action)}
            className="rounded border border-border px-2 py-1 text-xs text-fg-muted hover:bg-bg-hover hover:text-fg"
            title={action.label}
          >
            <span className="mr-1">{action.icon}</span>
            <span className="hidden sm:inline">{action.label}</span>
          </button>
        ))}
        <button
          onClick={() => setShowManager(true)}
          className="rounded border border-dashed border-border px-2 py-1 text-xs text-fg-subtle hover:border-border hover:bg-bg-hover hover:text-fg-muted"
          title="Manage custom actions"
        >
          +
        </button>
      </div>

      {showManager && <CustomActionsManager onClose={() => setShowManager(false)} />}
    </>
  );
}
