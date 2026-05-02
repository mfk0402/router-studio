import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

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

/**
 * Floating menu portaled to `document.body` so it stacks above Monaco, xterm,
 * and panel chrome. Outside-close ignores non-primary buttons so the opening
 * right-click does not immediately dismiss the menu.
 */
export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let removePointer: (() => void) | undefined;
    let cancelled = false;

    const t = window.setTimeout(() => {
      if (cancelled) return;
      const onPointerDown = (e: PointerEvent) => {
        if (e.button !== 0) return;
        if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
          onClose();
        }
      };
      document.addEventListener('pointerdown', onPointerDown, true);
      removePointer = () => document.removeEventListener('pointerdown', onPointerDown, true);
    }, 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
      removePointer?.();
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x;
    let top = y;
    if (rect.right > vw) left = Math.max(8, x - rect.width);
    if (rect.bottom > vh) top = Math.max(8, y - rect.height);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [x, y, items]);

  const menu = (
    <div
      ref={menuRef}
      className="fixed z-[200000] min-w-48 rounded-lg border border-border bg-bg-elevated py-1 shadow-float ring-1 ring-subtle"
      style={{ left: x, top: y }}
      role="menu"
    >
      {items.map((item, i) =>
        item.divider ? (
          <div key={i} className="my-1 h-px bg-border-soft" />
        ) : (
          <button
            key={`${item.label}-${i}`}
            type="button"
            role="menuitem"
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

  return createPortal(menu, document.body);
}
