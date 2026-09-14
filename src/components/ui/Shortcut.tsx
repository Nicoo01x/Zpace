import { cn } from '@/lib/cn';
import { formatShortcut } from '@/lib/platform';

export interface ShortcutProps {
  combo: string;
  inverse?: boolean;
  className?: string;
}

/** Keyboard shortcut chips, e.g. ⌘ K / Ctrl K. */
export function Shortcut({ combo, inverse, className }: ShortcutProps) {
  const keys = formatShortcut(combo);
  return (
    <span className={cn('inline-flex items-center gap-[3px]', className)} aria-label={keys.join(' ')}>
      {keys.map((k, i) => (
        <kbd
          key={`${k}-${i}`}
          className={cn(
            'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] px-[4px] font-sans text-[10.5px] font-medium tabular leading-none',
            inverse
              ? 'bg-white/14 text-inverse/85 dark:bg-black/25'
              : 'bg-surface-inset text-secondary shadow-[inset_0_0_0_1px_var(--border-subtle),0_1px_0_var(--border-subtle)]',
          )}
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}
