import { createContext, useContext, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { Dialog as RD } from 'radix-ui';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { easings, overlayVariants, springs } from '@/lib/motion';
import { IconButton } from './IconButton';
import { t } from '@/i18n';

const OpenCtx = createContext<{ open: boolean; gen: number }>({ open: false, gen: 0 });

export function Sheet({ open, onOpenChange, children }: { open: boolean; onOpenChange: (o: boolean) => void; children: ReactNode }) {
  // See Dialog: a new generation per opening keeps exit/enter instances apart.
  const [gen, setGen] = useState(0);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setGen((g) => g + 1);
  }
  const ctx = useMemo(() => ({ open, gen }), [open, gen]);
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <OpenCtx.Provider value={ctx}>{children}</OpenCtx.Provider>
    </RD.Root>
  );
}

export const SheetTrigger = RD.Trigger;
export const SheetClose = RD.Close;
export const SheetTitle = RD.Title;
export const SheetDescription = RD.Description;

export interface SheetContentProps extends Omit<ComponentProps<typeof RD.Content>, 'asChild' | 'forceMount' | 'title'> {
  side?: 'right' | 'left' | 'bottom';
  width?: number | string;
  title?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function SheetContent({ side = 'right', width = 560, title, className, children, ...rest }: SheetContentProps) {
  const { open, gen } = useContext(OpenCtx);
  const from = side === 'left' ? -24 : 24;
  const offset = (v: number) => (side === 'bottom' ? { y: v } : { x: v });
  return (
    <AnimatePresence>
      {open && (
        <RD.Portal forceMount key={gen}>
          <RD.Overlay asChild forceMount>
            <motion.div
              variants={overlayVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={{ duration: 0.2, ease: easings.out }}
              className="fixed inset-0 z-[950] bg-overlay backdrop-blur-[3px]"
            />
          </RD.Overlay>
          <RD.Content asChild forceMount {...rest}>
            <motion.div
              initial={{ opacity: 0, ...offset(from), scale: 0.985, filter: 'blur(6px)' }}
              animate={{ opacity: 1, ...offset(0), scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, ...offset(from * 0.6), scale: 0.985, filter: 'blur(6px)', transition: { duration: 0.18, ease: easings.out } }}
              transition={{ default: springs.modal, opacity: { duration: 0.16 }, filter: { duration: 0.3, ease: easings.soft } }}
              style={side === 'bottom' ? { height: width } : { width }}
              className={cn(
                'fixed z-[951] flex flex-col overflow-hidden bg-surface-raised text-primary shadow-window outline-none',
                side === 'right' && 'inset-y-3 right-3 rounded-[14px]',
                side === 'left' && 'inset-y-3 left-3 rounded-[14px]',
                side === 'bottom' && 'inset-x-3 bottom-3 rounded-[14px]',
                className,
              )}
            >
              {title ? (
                <div className="flex h-11 shrink-0 items-center justify-between px-4 hairline-b">
                  <RD.Title className="text-[13.5px] font-semibold tracking-[-0.01em]">{title}</RD.Title>
                  <RD.Close asChild>
                    <IconButton label={t('Close')} tooltip={false} size="sm">
                      <X />
                    </IconButton>
                  </RD.Close>
                </div>
              ) : null}
              <div className="min-h-0 flex-1 overflow-auto">{children}</div>
            </motion.div>
          </RD.Content>
        </RD.Portal>
      )}
    </AnimatePresence>
  );
}
