import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { easings } from '@/lib/motion';

export interface ProgressProps {
  /** 0..1 */
  value: number;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
  className?: string;
  height?: number;
  label?: string;
}

const tones = {
  neutral: 'bg-primary/70',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

export function Progress({ value, tone = 'neutral', className, height = 3, label }: ProgressProps) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      aria-label={label}
      style={{ height }}
      className={cn('w-full overflow-hidden rounded-full bg-surface-inset', className)}
    >
      <motion.div
        className={cn('h-full rounded-full', tones[tone])}
        initial={false}
        animate={{ width: `${v * 100}%` }}
        transition={{ duration: 0.28, ease: easings.out }}
      />
    </div>
  );
}
