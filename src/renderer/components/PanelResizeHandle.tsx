import { useCallback, type MouseEvent as ReactMouseEvent } from 'react';

type Props = {
  /** Incremental delta from the previous pointer position (px). */
  onDrag: (deltaPx: number) => void;
  orientation: 'col' | 'row';
  className?: string;
};

/**
 * Thin splitter for resizing adjacent panels (sidebar / AI / bottom).
 */
export function PanelResizeHandle({ onDrag, orientation, className = '' }: Props) {
  const onMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      const start = orientation === 'col' ? e.clientX : e.clientY;
      let prev = start;

      const move = (ev: MouseEvent) => {
        const cur = orientation === 'col' ? ev.clientX : ev.clientY;
        const d = cur - prev;
        prev = cur;
        if (d !== 0) onDrag(d);
      };
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    },
    [onDrag, orientation],
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
          : 'h-1 shrink-0 cursor-row-resize hover:bg-accent/35 active:bg-accent/55') +
        ' ' +
        className
      }
      onMouseDown={onMouseDown}
    />
  );
}
