import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'subtle' | 'danger' | 'outline';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Stretch to container width. */
  block?: boolean;
}

const base =
  'relative inline-flex items-center justify-center gap-1.5 select-none whitespace-nowrap font-medium press ' +
  'disabled:pointer-events-none disabled:opacity-45 ' +
  'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1';

const variants: Record<ButtonVariant, string> = {
  default:
    'bg-surface text-primary shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(0,0,0,0.04)] ' +
    'hover:bg-surface-hover hover:shadow-[0_0_0_1px_var(--border-strong),0_1px_2px_rgba(0,0,0,0.04)] active:bg-surface-active',
  primary:
    'bg-primary text-inverse shadow-[0_1px_2px_rgba(0,0,0,0.12)] hover:opacity-90 active:opacity-80',
  ghost: 'bg-transparent text-secondary hover:bg-surface-hover hover:text-primary active:bg-surface-active',
  subtle: 'bg-surface-inset text-primary hover:bg-surface-hover active:bg-surface-active',
  danger:
    'bg-danger-soft text-danger shadow-[0_0_0_1px_color-mix(in_srgb,var(--danger)_25%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_18%,transparent)]',
  outline: 'bg-transparent text-primary shadow-[0_0_0_1px_var(--border-strong)] hover:bg-surface-hover active:bg-surface-active',
};

const sizes: Record<ButtonSize, string> = {
  xs: 'h-6 px-2 text-[12px] rounded-sm',
  sm: 'h-7 px-2.5 text-[12.5px] rounded-md',
  md: 'h-8 px-3 text-ui rounded-md',
  lg: 'h-9 px-4 text-[13.5px] rounded-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'default', size = 'md', loading, leading, trailing, block, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      data-loading={loading ? '' : undefined}
      className={cn(base, variants[variant], sizes[size], block && 'w-full', className)}
      {...rest}
    >
      {loading ? (
        <span className="absolute inset-0 grid place-items-center">
          <Spinner size={size === 'xs' ? 11 : 13} />
        </span>
      ) : null}
      <span className={cn('inline-flex items-center gap-1.5', loading && 'invisible')}>
        {leading ? <span className="-ml-0.5 inline-flex shrink-0 items-center [&>svg]:size-[14px]">{leading}</span> : null}
        {children}
        {trailing ? <span className="-mr-0.5 inline-flex shrink-0 items-center [&>svg]:size-[14px]">{trailing}</span> : null}
      </span>
    </button>
  );
});
