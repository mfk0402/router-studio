import { useEffect, useRef } from 'react';

export interface ContextMenuItem {
  label: string;
  icon?: string;
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  divider?: boolean;
  danger?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (rect.right > viewportWidth) {
        menuRef.current.style.left = `${x - rect.width}px`;
      }
      if (rect.bottom > viewportHeight) {
        menuRef.current.style.top = `${y - rect.height}px`;
      }
    }
  }, [x, y]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-48 rounded-lg border border-border bg-bg-elevated py-1 shadow-xl"
      style={{ left: x, top: y }}
    >
      {items.map((item, i) =>
        item.divider ? (
          <div key={i} className="my-1 h-px bg-border-soft" />
        ) : (
          <button
            key={item.label}
            onClick={() => {
              if (item.action && !item.disabled) {
                item.action();
                onClose();
              }
            }}
            disabled={item.disabled}
            className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs ${
              item.disabled
                ? 'cursor-not-allowed text-fg-subtle'
                : item.danger
                  ? 'text-danger hover:bg-danger/10'
                  : 'text-fg-muted hover:bg-accent/10 hover:text-fg'
            }`}
          >
            <div className="flex items-center gap-2">
              {item.icon && <span className="w-4 text-center">{item.icon}</span>}
              <span>{item.label}</span>
            </div>
            {item.shortcut && (
              <span className="ml-4 text-[10px] text-fg-subtle">{item.shortcut}</span>
            )}
          </button>
        ),
      )}
    </div>
  );
}
