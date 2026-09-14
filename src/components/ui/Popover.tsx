import { createContext, useContext, useState, type ComponentProps, type ReactNode } from 'react';
import { Popover as RP } from 'radix-ui';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { popoverTransition, popoverVariants } from '@/lib/motion';

const OpenCtx = createContext(false);

export interface PopoverProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
  children: ReactNode;
}

export function Popover({ open: controlled, onOpenChange, modal = false, children }: PopoverProps) {
  const [inner, setInner] = useState(false);
  const open = controlled ?? inner;
  const setOpen = (v: boolean) => {
    setInner(v);
    onOpenChange?.(v);
  };
  return (
    <RP.Root open={open} onOpenChange={setOpen} modal={modal}>
      <OpenCtx.Provider value={open}>{children}</OpenCtx.Provider>
    </RP.Root>
  );
}

export const PopoverTrigger = RP.Trigger;
export const PopoverAnchor = RP.Anchor;
export const PopoverClose = RP.Close;

export function PopoverContent({
  className,
  children,
  sideOffset = 6,
  align = 'start',
  ...rest
}: Omit<ComponentProps<typeof RP.Content>, 'asChild' | 'forceMount'>) {
  const open = useContext(OpenCtx);
  return (
    <AnimatePresence>
      {open && (
        <RP.Portal forceMount>
          <RP.Content asChild forceMount sideOffset={sideOffset} align={align} collisionPadding={8} {...rest}>
            <motion.div
              variants={popoverVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={popoverTransition}
              style={{ transformOrigin: 'var(--radix-popover-content-transform-origin)' }}
              className={cn(
                'z-[1050] rounded-lg bg-surface-raised p-1 shadow-popover outline-none backdrop-blur-xl',
                className,
              )}
            >
              {children}
            </motion.div>
          </RP.Content>
        </RP.Portal>
      )}
    </AnimatePresence>
  );
}
