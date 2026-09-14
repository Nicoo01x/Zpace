import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Dialog as RD } from 'radix-ui';
import { AnimatePresence, animate, motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { consumeOrigin, easings, overlayVariants, springs, type OriginRect } from '@/lib/motion';
import { IconButton } from './IconButton';
import { t } from '@/i18n';

/**
 * Dialog — the pretty-modal recipe on top of Radix:
 *   open : FLIP from the element that was clicked (position + uniform scale),
 *          content blurs in from 8px, overlay dims with a soft backdrop blur.
 *   close: travels back to its origin while blurring out and fading, and its
 *          radius grows — the modal is "absorbed" by the control that opened it.
 */

const OpenCtx = createContext<{ open: boolean; gen: number }>({ open: false, gen: 0 });

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  // Each opening gets a new generation so re-opening while the previous
  // instance is still animating out mounts a fresh content instead of
  // resurrecting the exiting one (which would leave the overlay stuck).
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

export const DialogTrigger = RD.Trigger;
export const DialogClose = RD.Close;

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

const sizes: Record<DialogSize, string> = {
  sm: 'w-[400px]',
  md: 'w-[520px]',
  lg: 'w-[680px]',
  xl: 'w-[880px]',
  full: 'w-[calc(100vw-64px)] h-[calc(100vh-64px)]',
};

export interface DialogContentProps extends Omit<ComponentProps<typeof RD.Content>, 'asChild' | 'forceMount'> {
  size?: DialogSize;
  className?: string;
  /** Hide the default close button. */
  hideClose?: boolean;
  /** Vertical placement: centre or upper third (command palettes). */
  placement?: 'center' | 'top';
  /** Blur strength of the backdrop. */
  overlay?: 'dim' | 'blur' | 'none';
  children: ReactNode;
}

interface MorphState {
  x: number;
  y: number;
  scale: number;
  radius: number;
}

export function DialogContent({
  size = 'md',
  className,
  hideClose,
  placement = 'center',
  overlay = 'blur',
  children,
  ...rest
}: DialogContentProps) {
  const { open, gen } = useContext(OpenCtx);
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
              transition={{ duration: 0.22, ease: easings.out }}
              className={cn(
                'fixed inset-0 z-[950]',
                overlay === 'blur' && 'bg-overlay backdrop-blur-[6px]',
                overlay === 'dim' && 'bg-overlay',
              )}
            />
          </RD.Overlay>
          <div
            className={cn(
              'pointer-events-none fixed inset-0 z-[951] flex justify-center p-8',
              placement === 'center' ? 'items-center' : 'items-start pt-[14vh]',
            )}
          >
            <MorphingContent size={size} className={className} hideClose={hideClose} {...rest}>
              {children}
            </MorphingContent>
          </div>
        </RD.Portal>
      )}
    </AnimatePresence>
  );
}

function MorphingContent({
  size,
  className,
  hideClose,
  children,
  ...rest
}: Omit<DialogContentProps, 'placement' | 'overlay'> & { size: DialogSize }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const originRef = useRef<OriginRect | null>(null);
  const [morph, setMorph] = useState<MorphState>({ x: 0, y: 0, scale: 0.94, radius: 14 });

  // Capture the origin synchronously on first render.
  if (originRef.current === null) originRef.current = consumeOrigin() ?? { x: NaN, y: NaN, width: 0, height: 0, radius: 0 };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const origin = originRef.current;
    const r = el.getBoundingClientRect();
    const hasOrigin = origin && Number.isFinite(origin.x) && origin.width > 0;
    const from: MorphState = hasOrigin
      ? {
          x: origin.x + origin.width / 2 - (r.left + r.width / 2),
          y: origin.y + origin.height / 2 - (r.top + r.height / 2),
          scale: Math.min(0.9, Math.max(0.18, Math.max(origin.width / r.width, origin.height / r.height))),
          radius: Math.max(origin.radius, 14),
        }
      : { x: 0, y: 0, scale: 0.94, radius: 14 };
    setMorph(from);

    if (reduced) {
      el.style.opacity = '1';
      return;
    }
    const controls = animate(
      el,
      {
        x: [from.x, 0],
        y: [from.y, 0],
        scale: [from.scale, 1],
        opacity: [0, 1],
        filter: ['blur(8px)', 'blur(0px)'],
        borderRadius: [`${from.radius}px`, '14px'],
      },
      {
        ...(springs.modal as object),
        opacity: { duration: 0.18, ease: easings.out },
        filter: { duration: 0.38, ease: easings.soft },
        borderRadius: { duration: 0.32, ease: easings.soft },
      },
    );
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <RD.Content asChild forceMount {...rest}>
      <motion.div
        ref={ref}
        initial={false}
        style={{ opacity: 0, transformOrigin: 'center center' }}
        exit={
          reduced
            ? { opacity: 0, transition: { duration: 0.12 } }
            : {
                x: morph.x * 0.85,
                y: morph.y * 0.85,
                scale: Math.max(morph.scale, 0.55),
                opacity: 0,
                filter: 'blur(18px)',
                borderRadius: `${Math.max(morph.radius, 28)}px`,
                transition: {
                  default: { duration: 0.3, ease: easings.spring },
                  opacity: { duration: 0.26, ease: easings.out },
                  filter: { duration: 0.26, ease: easings.soft },
                },
              }
        }
        className={cn(
          'pointer-events-auto relative flex max-h-[calc(100vh-64px)] max-w-[calc(100vw-64px)] flex-col overflow-hidden rounded-[14px] bg-surface-raised text-primary shadow-window outline-none',
          sizes[size],
          className,
        )}
      >
        {children}
        {!hideClose ? (
          <RD.Close asChild>
            <IconButton label={t('Close')} tooltip={false} size="sm" className="absolute right-2.5 top-2.5">
              <X />
            </IconButton>
          </RD.Close>
        ) : null}
      </motion.div>
    </RD.Content>
  );
}

export function DialogHeader({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('flex flex-col gap-1 px-5 pb-3 pt-4', className)}>{children}</div>;
}

export function DialogTitle({ className, ...rest }: ComponentProps<typeof RD.Title>) {
  return <RD.Title className={cn('text-[14px] font-semibold leading-tight tracking-[-0.01em]', className)} {...rest} />;
}

export function DialogDescription({ className, ...rest }: ComponentProps<typeof RD.Description>) {
  return <RD.Description className={cn('text-ui text-secondary', className)} {...rest} />;
}

export function DialogBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-2', className)}>{children}</div>;
}

export function DialogFooter({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('flex items-center justify-end gap-2 px-5 pb-4 pt-3', className)}>{children}</div>;
}
