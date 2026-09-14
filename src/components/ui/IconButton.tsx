import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Tooltip } from './Tooltip';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  /** Show the label as a tooltip (default true). */
  tooltip?: boolean;
  shortcut?: string;
  size?: 'xs' | 'sm' | 'md';
  variant?: 'ghost' | 'subtle' | 'default';
  active?: boolean;
  children: ReactNode;
}

const sizes = {
  xs: 'size-6 rounded-sm [&>svg]:size-[13px]',
  sm: 'size-7 rounded-md [&>svg]:size-[15px]',
  md: 'size-8 rounded-md [&>svg]:size-4',
};

const variants = {
  ghost: 'text-secondary hover:bg-surface-hover hover:text-primary active:bg-surface-active',
  subtle: 'bg-surface-inset text-secondary hover:bg-surface-hover hover:text-primary active:bg-surface-active',
  default:
    'bg-surface text-secondary shadow-[0_0_0_1px_var(--border)] hover:text-primary hover:bg-surface-hover active:bg-surface-active',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, tooltip = true, shortcut, size = 'sm', variant = 'ghost', active, className, children, type = 'button', ...rest },
  ref,
) {
  const btn = (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      aria-pressed={active}
      data-active={active ? '' : undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center select-none press disabled:pointer-events-none disabled:opacity-40',
        'data-active:bg-surface-active data-active:text-primary',
        sizes[size],
        variants[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
  if (!tooltip) return btn;
  return (
    <Tooltip content={label} shortcut={shortcut}>
      {btn}
    </Tooltip>
  );
});
