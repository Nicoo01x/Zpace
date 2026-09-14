import { useId, type ComponentProps, type ReactNode } from 'react';
import { Tabs as RT } from 'radix-ui';
import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { springs } from '@/lib/motion';

export const Tabs = RT.Root;
export const TabsContent = RT.Content;

export function TabsList({ className, ...rest }: ComponentProps<typeof RT.List>) {
  return <RT.List className={cn('relative flex items-center gap-0.5 hairline-b', className)} {...rest} />;
}

export interface TabsTriggerProps extends ComponentProps<typeof RT.Trigger> {
  active?: boolean;
  icon?: ReactNode;
  count?: number;
  layoutId?: string;
}

/**
 * Underline tab. The active indicator is a shared-layout element so it slides
 * between tabs instead of blinking.
 */
export function TabsTrigger({ className, children, active, icon, count, layoutId, ...rest }: TabsTriggerProps) {
  const id = useId();
  return (
    <RT.Trigger
      className={cn(
        'group relative flex h-8 items-center gap-1.5 px-2.5 text-ui text-secondary outline-none transition-colors duration-(--motion-fast)',
        'hover:text-primary data-[state=active]:text-primary focus-visible:rounded-md',
        '[&>svg]:size-[14px]',
        className,
      )}
      {...rest}
    >
      {icon}
      <span>{children}</span>
      {typeof count === 'number' ? <span className="rounded-[4px] bg-surface-inset px-1 text-[10.5px] tabular text-muted">{count}</span> : null}
      {active ? (
        <motion.span
          layoutId={layoutId ?? `tab-indicator-${id}`}
          transition={springs.layout}
          className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-primary"
        />
      ) : null}
    </RT.Trigger>
  );
}
