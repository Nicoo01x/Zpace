import { Switch as RS } from 'radix-ui';
import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { springs } from '@/lib/motion';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  className?: string;
}

export function Switch({ checked, onCheckedChange, disabled, id, className, ...rest }: SwitchProps) {
  return (
    <RS.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={rest['aria-label']}
      className={cn(
        'relative inline-flex h-[18px] w-[30px] shrink-0 items-center rounded-full p-[2px] transition-colors duration-(--motion-normal) outline-none',
        'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
        checked ? 'bg-primary' : 'bg-[color-mix(in_srgb,var(--text-muted)_45%,transparent)]',
        'disabled:opacity-40',
        className,
      )}
    >
      <RS.Thumb asChild>
        <motion.span
          layout
          transition={springs.snappy}
          className={cn('block size-[14px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.25)]', checked && 'ml-auto')}
        />
      </RS.Thumb>
    </RS.Root>
  );
}
