import { useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface SplitPaneProps {
  direction: 'horizontal' | 'vertical';
  ratio: number;
  onRatioChange: (ratio: number) => void;
  first: ReactNode;
  second: ReactNode;
  className?: string;
  minPx?: number;
}

/**
 * Two-child split with a draggable hairline divider. The divider grows a
 * 1px accent line on hover/drag; the hit area stays 7px so it is easy to grab.
 */
export function SplitPane({ direction, ratio, onRatioChange, first, second, className, minPx = 160 }: SplitPaneProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const horizontal = direction === 'horizontal';

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const el = ref.current;
    if (!el) return;
    setDragging(true);
    const rect = el.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const total = horizontal ? rect.width : rect.height;
      const pos = horizontal ? ev.clientX - rect.left : ev.clientY - rect.top;
      const min = minPx / total;
      onRatioChange(Math.min(1 - min, Math.max(min, pos / total)));
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = horizontal ? 'col-resize' : 'row-resize';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div ref={ref} className={cn('relative flex h-full w-full min-h-0 min-w-0', horizontal ? 'flex-row' : 'flex-col', className)}>
      <div className="min-h-0 min-w-0 overflow-hidden" style={{ flex: `${ratio} 1 0%` }}>
        {first}
      </div>
      <div
        role="separator"
        aria-orientation={horizontal ? 'vertical' : 'horizontal'}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onKeyDown={(e) => {
          const step = 0.02;
          if ((horizontal && e.key === 'ArrowLeft') || (!horizontal && e.key === 'ArrowUp')) onRatioChange(ratio - step);
          if ((horizontal && e.key === 'ArrowRight') || (!horizontal && e.key === 'ArrowDown')) onRatioChange(ratio + step);
        }}
        className={cn(
          'group/divider relative z-10 shrink-0 outline-none',
          horizontal ? 'w-[7px] -mx-[3px] cursor-col-resize' : 'h-[7px] -my-[3px] cursor-row-resize',
        )}
      >
        <span
          className={cn(
            'absolute bg-border transition-colors duration-(--motion-normal) group-hover/divider:bg-accent group-focus-visible/divider:bg-accent',
            horizontal ? 'inset-y-0 left-[3px] w-px' : 'inset-x-0 top-[3px] h-px',
            dragging && 'bg-accent',
          )}
        />
      </div>
      <div className="min-h-0 min-w-0 overflow-hidden" style={{ flex: `${1 - ratio} 1 0%` }}>
        {second}
      </div>
      {dragging ? <div className="absolute inset-0 z-20" /> : null}
    </div>
  );
}
