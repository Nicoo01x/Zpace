import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Gutter + content row used by every block. The gutter is one monospace
 * column wide so ● ✱ ❯ line up like in a terminal transcript.
 */
export function Row({ gutter, children, className, gutterClassName, align = 'start' }: { gutter?: ReactNode; children: ReactNode; className?: string; gutterClassName?: string; align?: 'start' | 'center' }) {
  return (
    <div className={cn('grid grid-cols-[18px_minmax(0,1fr)] gap-x-2 px-(--content-padding)', className)}>
      <span className={cn('flex h-[21px] select-none justify-start text-content leading-[1.6]', align === 'center' ? 'items-center' : 'items-start', gutterClassName)}>{gutter}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
