import { useState, useRef, useEffect } from 'react';
import { useApp } from '../store/appStore';

export default function BranchSelector() {
  const branches = useApp((s) => s.conversationBranches);
  const currentBranchId = useApp((s) => s.currentBranchId);
  const switchToBranch = useApp((s) => s.switchToBranch);
  const deleteBranch = useApp((s) => s.deleteBranch);
  const renameBranch = useApp((s) => s.renameBranch);
  const pushLog = useApp((s) => s.pushLog);

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setEditingId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Don't show if no branches
  if (branches.length === 0) return null;

  const currentBranch = branches.find((b) => b.id === currentBranchId) ||
    branches.find((b) => b.id === 'main') ||
    branches[0];

  const handleSwitch = (branchId: string) => {
    switchToBranch(branchId);
    setIsOpen(false);
    pushLog('info', `Switched to branch: ${branches.find((b) => b.id === branchId)?.name}`);
  };

  const handleDelete = (branchId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (branchId === 'main') {
      pushLog('warn', 'Cannot delete main branch');
      return;
    }
    const branch = branches.find((b) => b.id === branchId);
    if (confirm(`Delete branch "${branch?.name}"? This cannot be undone.`)) {
      deleteBranch(branchId);
      pushLog('info', `Deleted branch: ${branch?.name}`);
    }
  };

  const startRename = (branchId: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(branchId);
    setEditName(currentName);
  };

  const saveRename = () => {
    if (editingId && editName.trim()) {
      renameBranch(editingId, editName.trim());
    }
    setEditingId(null);
    setEditName('');
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 rounded border border-border bg-bg-elevated px-2 py-1 text-xs text-fg-muted hover:bg-bg-hover hover:text-fg"
        title="Switch conversation branches"
      >
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4M8 17H4m0 0l4-4m-4 4l4 4" />
        </svg>
        <span className="max-w-[100px] truncate">{currentBranch?.name || 'Main'}</span>
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-border bg-bg-soft shadow-2xl">
          <div className="border-b border-border-soft px-3 py-2">
            <span className="text-xs font-medium text-fg">Conversation Branches</span>
            <p className="mt-0.5 text-[10px] text-fg-subtle">
              {branches.length} branch{branches.length === 1 ? '' : 'es'}
            </p>
          </div>
          <div className="max-h-64 overflow-auto py-1">
            {branches.map((branch) => (
              <div
                key={branch.id}
                onClick={() => handleSwitch(branch.id)}
                className={`group flex cursor-pointer items-center justify-between px-3 py-2 ${
                  branch.id === currentBranchId ? 'bg-accent/10' : 'hover:bg-bg-hover'
                }`}
              >
                <div className="flex-1 min-w-0">
                  {editingId === branch.id ? (
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveRename();
                        if (e.key === 'Escape') {
                          setEditingId(null);
                          setEditName('');
                        }
                      }}
                      onBlur={saveRename}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full rounded border border-accent bg-bg px-1 py-0.5 text-xs text-fg focus:outline-none"
                      autoFocus
                    />
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5">
                        {branch.id === currentBranchId && (
                          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                        )}
                        <span className="truncate text-xs text-fg">{branch.name}</span>
                        {branch.id === 'main' && (
                          <span className="rounded bg-bg-elevated px-1 py-0.5 text-[9px] text-fg-muted">
                            main
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[10px] text-fg-subtle">
                        {branch.messages.length} message{branch.messages.length === 1 ? '' : 's'}
                      </div>
                    </>
                  )}
                </div>
                <div className="ml-2 flex items-center gap-1 opacity-0 group-hover:opacity-100">
                  <button
                    onClick={(e) => startRename(branch.id, branch.name, e)}
                    className="rounded p-1 text-fg-muted hover:bg-bg-elevated hover:text-fg"
                    title="Rename branch"
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  {branch.id !== 'main' && (
                    <button
                      onClick={(e) => handleDelete(branch.id, e)}
                      className="rounded p-1 text-fg-muted hover:bg-danger/10 hover:text-danger"
                      title="Delete branch"
                    >
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-border-soft px-3 py-2 text-[10px] text-fg-subtle">
            Click any message's fork icon to create a branch
          </div>
        </div>
      )}
    </div>
  );
}
