import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  leading?: ReactNode;
  trailing?: ReactNode;
  size?: 'sm' | 'md';
  mono?: boolean;
  invalid?: boolean;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { className, leading, trailing, size = 'md', mono, invalid, ...rest },
  ref,
) {
  return (
    <div
      className={cn(
        'group flex items-center gap-2 rounded-md bg-surface px-2.5 text-primary shadow-[inset_0_0_0_1px_var(--border)] transition-[box-shadow,background-color] duration-(--motion-fast)',
        'focus-within:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_var(--accent-soft)]',
        invalid && 'shadow-[inset_0_0_0_1px_var(--danger)] focus-within:shadow-[inset_0_0_0_1px_var(--danger),0_0_0_3px_var(--danger-soft)]',
        size === 'sm' ? 'h-7' : 'h-8',
        rest.disabled && 'opacity-50',
        className,
      )}
    >
      {leading ? <span className="inline-flex shrink-0 text-muted [&>svg]:size-[14px]">{leading}</span> : null}
      <input
        ref={ref}
        className={cn(
          'min-w-0 flex-1 bg-transparent text-ui outline-none placeholder:text-muted',
          mono && 'font-mono text-[12.5px]',
        )}
        {...rest}
      />
      {trailing ? <span className="inline-flex shrink-0 items-center text-muted">{trailing}</span> : null}
    </div>
  );
});
