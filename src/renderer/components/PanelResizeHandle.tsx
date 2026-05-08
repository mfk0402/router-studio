import { useCallback, type MouseEvent as ReactMouseEvent } from 'react';

type Props = {
  /** Incremental delta from the previous pointer position (px). */
  onDrag: (deltaPx: number, totalDeltaPx: number) => void;
  /** Fired once when the drag ends (after mouseup). Persist layout here to avoid async settings races mid-drag. */
  onDragEnd?: () => void;
  orientation: 'col' | 'row';
  className?: string;
};

/**
 * Thin splitter for resizing adjacent panels (sidebar / AI / bottom).
 */
export function PanelResizeHandle({ onDrag, onDragEnd, orientation, className = '' }: Props) {
  const onMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      const start = orientation === 'col' ? e.clientX : e.clientY;
      let prev = start;

      const move = (ev: MouseEvent) => {
        const cur = orientation === 'col' ? ev.clientX : ev.clientY;
        const d = cur - prev;
        const total = cur - start;
        prev = cur;
        if (d !== 0) onDrag(d, total);
      };
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        onDragEnd?.();
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    },
    [onDrag, onDragEnd, orientation],
  );

  return (
    <div
      role="separator"
      aria-orientation={orientation === 'col' ? 'vertical' : 'horizontal'}
      tabIndex={0}
      title="Drag to resize"
      className={
        (orientation === 'col'
          ? 'w-1 shrink-0 cursor-col-resize hover:bg-accent/35 active:bg-accent/55'
          : 'resize-handle-row') +
        ' ' +
        className
      }
      onMouseDown={onMouseDown}
    />
  );
}
