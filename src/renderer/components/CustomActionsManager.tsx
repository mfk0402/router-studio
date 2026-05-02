import { useState } from 'react';
import { useSettings } from '../store/settingsStore';
import { useApp } from '../store/appStore';

interface CustomAction {
  id: string;
  label: string;
  icon: string;
  prompt: string;
  showInToolbar: boolean;
}

const ICONS = ['⚡', '🔧', '💡', '📝', '🎯', '🚀', '✨', '🔍', '📦', '🧪', '🎨', '⭐', '🔥', '💎', '🛠️', '📌'];

export default function CustomActionsManager({ onClose }: { onClose: () => void }) {
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const pushLog = useApp((s) => s.pushLog);

  const [actions, setActions] = useState<CustomAction[]>(settings.customActions || []);
  const [editingAction, setEditingAction] = useState<CustomAction | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);

  const saveActions = (newActions: CustomAction[]) => {
    setActions(newActions);
    void update({ customActions: newActions });
  };

  const addAction = () => {
    const newAction: CustomAction = {
      id: `action-${Date.now()}`,
      label: 'New Action',
      icon: '⚡',
      prompt: '',
      showInToolbar: true,
    };
    setEditingAction(newAction);
    setIsAddingNew(true);
  };

  const saveEditingAction = () => {
    if (!editingAction) return;
    if (!editingAction.label.trim() || !editingAction.prompt.trim()) {
      pushLog('warn', 'Action must have a label and prompt');
      return;
    }

    if (isAddingNew) {
      saveActions([...actions, editingAction]);
    } else {
      saveActions(actions.map((a) => (a.id === editingAction.id ? editingAction : a)));
    }
    setEditingAction(null);
    setIsAddingNew(false);
    pushLog('info', `Action "${editingAction.label}" saved`);
  };

  const deleteAction = (id: string) => {
    const action = actions.find((a) => a.id === id);
    if (confirm(`Delete action "${action?.label}"?`)) {
      saveActions(actions.filter((a) => a.id !== id));
      if (editingAction?.id === id) {
        setEditingAction(null);
        setIsAddingNew(false);
      }
      pushLog('info', 'Action deleted');
    }
  };

  const moveAction = (id: string, direction: 'up' | 'down') => {
    const idx = actions.findIndex((a) => a.id === id);
    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === actions.length - 1) return;

    const newActions = [...actions];
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    [newActions[idx], newActions[swapIdx]] = [newActions[swapIdx], newActions[idx]];
    saveActions(newActions);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-bg-soft shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-fg">Custom Actions</h2>
            <p className="text-xs text-fg-muted">Create quick action buttons for common prompts</p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-fg-muted hover:bg-bg-hover hover:text-fg"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex min-h-0 max-h-[calc(85vh-100px)]">
          {/* Actions list */}
          <div className="w-1/3 border-r border-border-soft overflow-auto">
            <div className="p-2">
              <button
                onClick={addAction}
                className="flex w-full items-center justify-center gap-1 rounded bg-accent px-3 py-2 text-xs font-medium text-white hover:bg-accent/90"
              >
                <span>+</span> Add Action
              </button>
            </div>
            <div className="space-y-1 px-2 pb-2">
              {actions.length === 0 ? (
                <div className="py-8 text-center text-xs text-fg-muted">
                  No custom actions yet
                </div>
              ) : (
                actions.map((action, idx) => (
                  <div
                    key={action.id}
                    onClick={() => {
                      setEditingAction({ ...action });
                      setIsAddingNew(false);
                    }}
                    className={`group flex cursor-pointer items-center gap-2 rounded px-2 py-2 ${
                      editingAction?.id === action.id ? 'bg-accent/10' : 'hover:bg-bg-hover'
                    }`}
                  >
                    <span className="text-sm">{action.icon}</span>
                    <span className="flex-1 truncate text-xs text-fg">{action.label}</span>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                      {idx > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            moveAction(action.id, 'up');
                          }}
                          className="rounded p-0.5 text-fg-muted hover:bg-bg-elevated hover:text-fg"
                          title="Move up"
                        >
                          ↑
                        </button>
                      )}
                      {idx < actions.length - 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            moveAction(action.id, 'down');
                          }}
                          className="rounded p-0.5 text-fg-muted hover:bg-bg-elevated hover:text-fg"
                          title="Move down"
                        >
                          ↓
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Editor panel */}
          <div className="flex-1 overflow-auto p-4">
            {editingAction ? (
              <div className="space-y-4">
                {/* Label */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-fg-muted">Label</label>
                  <input
                    type="text"
                    value={editingAction.label}
                    onChange={(e) => setEditingAction({ ...editingAction, label: e.target.value })}
                    placeholder="e.g., Explain Code"
                    className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
                  />
                </div>

                {/* Icon */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-fg-muted">Icon</label>
                  <div className="flex flex-wrap gap-1">
                    {ICONS.map((icon) => (
                      <button
                        key={icon}
                        onClick={() => setEditingAction({ ...editingAction, icon })}
                        className={`rounded p-1.5 text-sm ${
                          editingAction.icon === icon
                            ? 'bg-accent/20 ring-1 ring-accent'
                            : 'hover:bg-bg-hover'
                        }`}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Prompt */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-fg-muted">Prompt</label>
                  <textarea
                    value={editingAction.prompt}
                    onChange={(e) => setEditingAction({ ...editingAction, prompt: e.target.value })}
                    placeholder="Enter the prompt that will be sent when this action is clicked..."
                    rows={6}
                    className="w-full resize-none rounded border border-border bg-bg px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
                  />
                  <p className="mt-1 text-[10px] text-fg-subtle">
                    Tip: Use {'{selection}'} to include selected code, {'{file}'} for current file path
                  </p>
                </div>

                {/* Show in toolbar */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="showInToolbar"
                    checked={editingAction.showInToolbar}
                    onChange={(e) =>
                      setEditingAction({ ...editingAction, showInToolbar: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-border"
                  />
                  <label htmlFor="showInToolbar" className="text-xs text-fg">
                    Show in toolbar
                  </label>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    onClick={() => deleteAction(editingAction.id)}
                    className="rounded px-3 py-1.5 text-xs text-danger hover:bg-danger/10"
                  >
                    Delete
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditingAction(null);
                        setIsAddingNew(false);
                      }}
                      className="rounded border border-border px-3 py-1.5 text-xs text-fg-muted hover:bg-bg-hover"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveEditingAction}
                      className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-fg-muted">
                Select an action to edit or create a new one
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
