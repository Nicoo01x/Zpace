import { useState, type ReactNode } from 'react';
import { Tooltip as RT } from 'radix-ui';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { Shortcut } from './Shortcut';
import { tooltipVariants, springs } from '@/lib/motion';

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RT.Provider delayDuration={550} skipDelayDuration={250}>
      {children}
    </RT.Provider>
  );
}

export interface TooltipProps {
  content: ReactNode;
  shortcut?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function Tooltip({ content, shortcut, side = 'bottom', align = 'center', sideOffset = 6, children, disabled, className }: TooltipProps) {
  const [open, setOpen] = useState(false);
  if (disabled || !content) return <>{children}</>;
  return (
    <RT.Root open={open} onOpenChange={setOpen}>
      <RT.Trigger asChild>{children}</RT.Trigger>
      <AnimatePresence>
        {open && (
          <RT.Portal forceMount>
            <RT.Content asChild forceMount side={side} align={align} sideOffset={sideOffset} collisionPadding={8}>
              <motion.div
                variants={tooltipVariants}
                initial="hidden"
                animate="visible"
                exit="hidden"
                transition={{ default: springs.snappy, opacity: { duration: 0.1 } }}
                style={{ transformOrigin: 'var(--radix-tooltip-content-transform-origin)' }}
                className={cn(
                  'z-[1100] flex items-center gap-2 rounded-md bg-[var(--text-primary)] px-2 py-1 text-[12px] font-medium text-inverse shadow-[0_4px_16px_rgba(0,0,0,0.18)]',
                  'pointer-events-none max-w-72',
                  className,
                )}
              >
                <span className="leading-[1.35]">{content}</span>
                {shortcut ? <Shortcut combo={shortcut} inverse /> : null}
              </motion.div>
            </RT.Content>
          </RT.Portal>
        )}
      </AnimatePresence>
    </RT.Root>
  );
}
