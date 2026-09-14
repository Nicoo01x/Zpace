import { cn } from '@/lib/cn';
import type { SessionStatus } from '@/types/workspace';

export interface StatusDotProps {
  status: SessionStatus | 'dirty';
  size?: number;
  className?: string;
  title?: string;
}

/**
 * 6px status indicator.
 *  running → accent, breathing pulse
 *  waiting → warning, steady (the eye should find it, not be nagged by it)
 *  error   → danger
 *  dirty   → muted dot (pending changes)
 *  completed / idle → nothing
 */
export function StatusDot({ status, size = 6, className, title }: StatusDotProps) {
  if (status === 'idle' || status === 'completed') return null;
  return (
    <span
      title={title}
      aria-label={title ?? status}
      role="img"
      style={{ width: size, height: size }}
      className={cn(
        'inline-block shrink-0 rounded-full',
        status === 'running' && 'bg-accent animate-pulse-dot',
        status === 'waiting' && 'bg-warning',
        status === 'error' && 'bg-danger',
        status === 'dirty' && 'bg-muted',
        className,
      )}
    />
  );
}
