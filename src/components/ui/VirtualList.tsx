import { useEffect, useImperativeHandle, useRef, type ReactNode, type Ref } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/lib/cn';

export interface VirtualListHandle {
  scrollToIndex: (index: number, opts?: { align?: 'start' | 'center' | 'end' | 'auto'; behavior?: 'auto' | 'smooth' }) => void;
  scrollToBottom: (behavior?: 'auto' | 'smooth') => void;
  element: HTMLDivElement | null;
}

export interface VirtualListProps<T> {
  items: T[];
  getKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  estimateSize?: (index: number) => number;
  overscan?: number;
  className?: string;
  innerClassName?: string;
  /** Keep the view pinned to the bottom when new items arrive (chat/terminal style). */
  followOutput?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
  handle?: Ref<VirtualListHandle>;
  onScroll?: (el: HTMLDivElement) => void;
}

/**
 * Dynamic-height virtual list. Rows are measured after render so markdown
 * blocks, expanded tool groups and terminal output can all coexist.
 */
export function VirtualList<T>({
  items,
  getKey,
  renderItem,
  estimateSize = () => 72,
  overscan = 6,
  className,
  innerClassName,
  followOutput,
  header,
  footer,
  handle,
  onScroll,
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual is used without the React Compiler.
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan,
    getItemKey: (i) => getKey(items[i], i),
    // Measurements arrive from ResizeObserver during commit; a sync flush there is what React 19 warns about.
    useFlushSync: false,
  });

  useImperativeHandle(
    handle,
    () => ({
      scrollToIndex: (i, opts) => virtualizer.scrollToIndex(i, opts),
      scrollToBottom: (behavior = 'auto') => {
        const el = parentRef.current;
        if (!el) return;
        el.scrollTo({ top: el.scrollHeight, behavior });
      },
      element: parentRef.current,
    }),
    [virtualizer],
  );

  // Follow output: when the user is at the bottom, keep them there on growth.
  const total = virtualizer.getTotalSize();
  useEffect(() => {
    if (!followOutput || !stickToBottom.current) return;
    const el = parentRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [total, items.length, followOutput]);

  return (
    <div
      ref={parentRef}
      className={cn('min-h-0 flex-1 overflow-y-auto overflow-x-hidden', className)}
      onScroll={(e) => {
        const el = e.currentTarget;
        stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        onScroll?.(el);
      }}
    >
      {header}
      <div className={cn('relative w-full', innerClassName)} style={{ height: total }}>
        {virtualizer.getVirtualItems().map((v) => (
          <div
            key={v.key as string}
            data-index={v.index}
            ref={virtualizer.measureElement}
            className="absolute left-0 top-0 w-full"
            style={{ transform: `translateY(${v.start}px)` }}
          >
            {renderItem(items[v.index], v.index)}
          </div>
        ))}
      </div>
      {footer}
    </div>
  );
}
