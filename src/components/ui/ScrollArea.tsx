import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  axis?: 'y' | 'x' | 'both';
  /** Fade content at the edges to hint overflow. */
  fade?: boolean;
}

/**
 * Plain overflow container relying on the global thin scrollbar styling.
 * Kept deliberately simple (no JS scrollbars) for performance in long sessions.
 */
export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(function ScrollArea(
  { axis = 'y', fade, className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'min-h-0 min-w-0',
        axis === 'y' && 'overflow-y-auto overflow-x-hidden',
        axis === 'x' && 'overflow-x-auto overflow-y-hidden',
        axis === 'both' && 'overflow-auto',
        fade && '[mask-image:linear-gradient(to_bottom,transparent,black_12px,black_calc(100%-12px),transparent)]',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
});
