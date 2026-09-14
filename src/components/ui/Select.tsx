import { ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from './DropdownMenu';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
  /** Inline style for the item (e.g. render a font option in its own face). */
  style?: React.CSSProperties;
  disabled?: boolean;
}

export interface SelectProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: SelectOption<T>[];
  size?: 'sm' | 'md';
  className?: string;
  'aria-label'?: string;
  align?: 'start' | 'end';
}

/** Menu-backed select — same motion as every other popover in the app. */
export function Select<T extends string>({ value, onChange, options, size = 'md', className, align = 'end', ...rest }: SelectProps<T>) {
  const current = options.find((o) => o.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={rest['aria-label']}
          className={cn(
            'inline-flex min-w-0 max-w-full items-center gap-2 rounded-md bg-surface pl-2.5 pr-1.5 text-left text-ui text-primary shadow-[0_0_0_1px_var(--border)] transition-[background-color,box-shadow] duration-(--motion-fast)',
            'hover:bg-surface-hover hover:shadow-[0_0_0_1px_var(--border-strong)] data-[state=open]:bg-surface-hover',
            size === 'sm' ? 'h-7 text-[12.5px]' : 'h-8',
            className,
          )}
        >
          <span className="truncate" style={current?.style}>{current?.label ?? value}</span>
          <ChevronsUpDown className="ml-auto size-[13px] shrink-0 text-muted" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="max-h-[min(60vh,480px)] min-w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto">
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as T)}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value} hint={o.hint} style={o.style} disabled={o.disabled}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
