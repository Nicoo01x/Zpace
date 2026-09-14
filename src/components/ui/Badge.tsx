import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-surface-inset text-secondary',
  accent: 'bg-accent-soft text-accent',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  mono?: boolean;
}

/** Tiny, quiet label. Never larger than the text it annotates. */
export function Badge({ tone = 'neutral', mono, className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-[17px] items-center rounded-[4px] px-1.5 text-[10.5px] font-medium leading-none tabular',
        mono && 'font-mono',
        tones[tone],
        className,
      )}
      {...rest}
    />
  );
}
