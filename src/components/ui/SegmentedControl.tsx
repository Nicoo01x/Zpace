import { useId, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { springs } from '@/lib/motion';

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  size?: 'sm' | 'md';
  className?: string;
  'aria-label'?: string;
}

/** iOS/macOS-style segmented control with a sliding thumb. */
export function SegmentedControl<T extends string>({ value, onChange, options, size = 'md', className, ...rest }: SegmentedControlProps<T>) {
  const id = useId();
  return (
    <div
      role="radiogroup"
      aria-label={rest['aria-label']}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-md bg-surface-inset p-[2px] shadow-[inset_0_0_0_1px_var(--border-subtle)]',
        className,
      )}
      onKeyDown={(e) => {
        const idx = options.findIndex((o) => o.value === value);
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          const next = options[(idx + 1) % options.length];
          if (next) onChange(next.value);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          const prev = options[(idx - 1 + options.length) % options.length];
          if (prev) onChange(prev.value);
        }
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative z-10 inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[5px] font-medium transition-colors duration-(--motion-fast) outline-none',
              size === 'sm' ? 'h-6 px-2 text-[12px]' : 'h-7 px-3 text-ui',
              active ? 'text-primary' : 'text-secondary hover:text-primary',
              'disabled:opacity-40 [&>svg]:size-[13px]',
            )}
          >
            {active ? (
              <motion.span
                layoutId={`segment-${id}`}
                transition={springs.layout}
                className="absolute inset-0 -z-10 rounded-[5px] bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_var(--border-subtle)] dark:bg-surface-raised"
              />
            ) : null}
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
