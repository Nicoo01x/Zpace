import { createContext, useContext, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Dialog as RD } from 'radix-ui';
import { useReducedMotion } from 'motion/react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Draggable } from 'gsap/Draggable';
import { InertiaPlugin } from 'gsap/InertiaPlugin';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { IconButton } from './IconButton';
import { t } from '@/i18n';

gsap.registerPlugin(useGSAP, Draggable, InertiaPlugin);

/**
 * Dialog — Radix for the semantics (portal, focus, Escape, outside click),
 * GSAP for the motion, which is the drag-to-dismiss card and nothing else:
 *   open : overlay 0→1 in .22 power2.out; the card scale .94→1, y 16→0,
 *          opacity 0→1 in .34 power3.out.
 *   drag : grab it anywhere — it follows the pointer 1:1 with the
 *          transform-origin at the point you touched, and shrinks to a
 *          thumbnail of itself as it leaves the centre (0→1, 220→.75,
 *          350→.5, 500→.12), dims past 350 and blurs past 220. Let go far
 *          away or throw it and it flies off in that direction and closes;
 *          let go near and it springs back (elastic.out(0.75, 0.55), .58).
 *   close: (×, Escape, overlay) scale .94, opacity 0 in .18 power2.in.
 * Only transform, opacity and filter move; the size is fixed by CSS and the
 * card carries no CSS transition. Reduced motion: fades, no drag.
 */

const OpenCtx = createContext<{ open: boolean; gen: number; requestClose: () => void }>({ open: false, gen: 0, requestClose: () => void 0 });

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  // Each opening gets a new generation so re-opening while the previous
  // instance is still animating out mounts a fresh card instead of
  // resurrecting the exiting one.
  const [gen, setGen] = useState(0);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setGen((g) => g + 1);
  }
  const ctx = useMemo(() => ({ open, gen, requestClose: () => onOpenChange(false) }), [open, gen, onOpenChange]);
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

/* ---------- the physics, as given: distance from rest → scale, linear between the stops ---------- */

const SCALE_STOPS: ReadonlyArray<readonly [distance: number, scale: number]> = [
  [0, 1],
  [220, 0.75],
  [350, 0.5],
  [500, 0.12],
];

function mapDistanceToScale(distance: number): number {
  for (let i = 1; i < SCALE_STOPS.length; i++) {
    const [d0, s0] = SCALE_STOPS[i - 1];
    const [d1, s1] = SCALE_STOPS[i];
    if (distance <= d1) return gsap.utils.mapRange(d0, d1, s0, s1, distance);
  }
  return SCALE_STOPS[SCALE_STOPS.length - 1][1];
}

/** Where a drag must not start: controls (Draggable's own list) and anything the pointer selects or edits. */
const NOT_A_HANDLE = 'input, textarea, select, button, a, [contenteditable], .selectable, .monaco-editor, .xterm, [data-no-drag]';

export function DialogContent({ size = 'md', className, hideClose, placement = 'center', overlay = 'blur', children, ...rest }: DialogContentProps) {
  const { open, gen, requestClose } = useContext(OpenCtx);
  // the card stays in the DOM through its exit; a new generation is a new card
  const [shown, setShown] = useState<number | null>(open ? gen : null);
  if (open && shown !== gen) setShown(gen);
  if (shown === null) return null;
  const mine = shown;
  return (
    <RD.Portal forceMount key={mine}>
      <Card size={size} className={className} hideClose={hideClose} placement={placement} overlay={overlay} open={open && mine === gen} requestClose={requestClose} onGone={() => setShown((s) => (s === mine ? null : s))} {...rest}>
        {children}
      </Card>
    </RD.Portal>
  );
}

function Card({
  size,
  className,
  hideClose,
  placement,
  overlay,
  open,
  requestClose,
  onGone,
  children,
  ...rest
}: Omit<DialogContentProps, 'size' | 'placement' | 'overlay'> & { size: DialogSize; placement: 'center' | 'top'; overlay: 'dim' | 'blur' | 'none'; open: boolean; requestClose: () => void; onGone: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  // the transform-origin in force, in % — a grab mid-bounce compensates for moving it
  const origin = useRef({ x: 50, y: 50 });
  // a drag that decided to close: the open=false that follows must not animate again
  const flying = useRef(false);
  const gone = useRef(onGone);
  const close = useRef(requestClose);
  useEffect(() => {
    gone.current = onGone;
    close.current = requestClose;
  });

  useGSAP(
    () => {
      const ov = overlayRef.current;
      const card = cardRef.current;
      if (!ov || !card) return;
      gsap.set(card, { x: 0, y: 0, transformOrigin: '50% 50%', filter: 'blur(0px)' });
      if (reduced) {
        gsap.fromTo(ov, { opacity: 0 }, { opacity: 1, duration: 0.18 });
        gsap.fromTo(card, { opacity: 0 }, { opacity: 1, duration: 0.18 });
        return;
      }
      gsap.fromTo(ov, { opacity: 0 }, { opacity: 1, duration: 0.22, ease: 'power2.out' });
      gsap.fromTo(card, { scale: 0.94, opacity: 0, y: 16 }, { scale: 1, opacity: 1, y: 0, duration: 0.34, ease: 'power3.out' });

      // Draggable has no getVelocity(): InertiaPlugin tracks x/y for it once registered, even with inertia off.
      const velocity = (axis: 'x' | 'y') => InertiaPlugin.getVelocity(card, axis);
      const [drag] = Draggable.create(card, {
        type: 'x,y',
        inertia: false,
        zIndexBoost: false,
        // gsap 3.15 only spares clickables when this is an explicit false — undefined drags them too
        dragClickables: false,
        cursor: 'grab',
        activeCursor: 'grabbing',
        clickableTest: (el: Element) => !!el.closest(NOT_A_HANDLE),

        onPress(this: Draggable, event: PointerEvent | TouchEvent) {
          gsap.killTweensOf([card, ov]);
          gsap.to(ov, { opacity: 1, duration: 0.15 });
          // the transform-origin at the exact point under the pointer
          const rect = card.getBoundingClientRect();
          const clientX = 'clientX' in event ? event.clientX : this.pointerX - window.scrollX;
          const clientY = 'clientY' in event ? event.clientY : this.pointerY - window.scrollY;
          const ox = ((clientX - rect.left) / rect.width) * 100;
          const oy = ((clientY - rect.top) / rect.height) * 100;
          // grabbed mid-bounce (scale ≠ 1): moving the origin would make it jump, so x/y absorb the difference
          const scale = gsap.getProperty(card, 'scale') as number;
          const dx = ((ox - origin.current.x) / 100) * (rect.width / scale) * (1 - scale);
          const dy = ((oy - origin.current.y) / 100) * (rect.height / scale) * (1 - scale);
          origin.current = { x: ox, y: oy };
          gsap.set(card, { transformOrigin: `${ox}% ${oy}%`, x: this.x - dx, y: this.y - dy });
          this.update();
        },

        onDrag(this: Draggable) {
          const distance = Math.hypot(this.x, this.y);
          gsap.set(card, {
            x: this.x,
            y: this.y,
            scale: mapDistanceToScale(distance),
            opacity: gsap.utils.interpolate(1, 0.86, gsap.utils.clamp(0, 1, (distance - 350) / 180)),
            filter: `blur(${gsap.utils.interpolate(0, 3, gsap.utils.clamp(0, 1, (distance - 220) / 280))}px)`,
          });
        },

        onDragEnd(this: Draggable) {
          const distance = Math.hypot(this.x, this.y);
          const scale = mapDistanceToScale(distance);
          const vx = velocity('x');
          const vy = velocity('y');
          const speed = Math.hypot(vx, vy);
          if (scale <= 0.35 || distance > 430 || (speed > 900 && distance > 260)) {
            flying.current = true;
            gsap.to(card, {
              x: this.x + vx * 0.12,
              y: this.y + vy * 0.12,
              scale: 0.08,
              opacity: 0,
              duration: 0.18,
              ease: 'power2.in',
              onComplete: () => {
                close.current();
                gone.current();
              },
            });
            gsap.to(ov, { opacity: 0, duration: 0.18, ease: 'power2.out' });
            return;
          }
          gsap.to(card, { x: 0, y: 0, scale: 1, opacity: 1, filter: 'blur(0px)', duration: 0.58, ease: 'elastic.out(0.75, 0.55)' });
        },
      });
      return () => drag.kill();
    },
    { scope: cardRef, dependencies: [reduced] },
  );

  // Closed by ×, Escape, the overlay or the app: the card leaves in place.
  useEffect(() => {
    if (open) return;
    const ov = overlayRef.current;
    const card = cardRef.current;
    if (!ov || !card || flying.current) return;
    gsap.killTweensOf([ov, card]);
    if (reduced) {
      gsap.to([ov, card], { opacity: 0, duration: 0.12, onComplete: () => gone.current() });
      return;
    }
    gsap.to(card, { scale: 0.94, opacity: 0, duration: 0.18, ease: 'power2.in', onComplete: () => gone.current() });
    gsap.to(ov, { opacity: 0, duration: 0.18, ease: 'power2.out' });
  }, [open, reduced]);

  return (
    <>
      <RD.Overlay asChild forceMount>
        <div ref={overlayRef} className={cn('fixed inset-0 z-[950] bg-[rgba(0,0,0,0.11)]', overlay === 'blur' && 'backdrop-blur-[6px]', overlay === 'none' && 'bg-transparent')} style={{ opacity: 0 }} />
      </RD.Overlay>
      <div className={cn('pointer-events-none fixed inset-0 z-[951] flex justify-center p-8', placement === 'center' ? 'items-center' : 'items-start pt-[14vh]')}>
        <RD.Content asChild forceMount {...rest}>
          <div
            ref={cardRef}
            style={{ opacity: 0 }}
            className={cn(
              'pointer-events-auto relative flex max-h-[calc(100vh-64px)] max-w-[calc(100vw-64px)] flex-col overflow-hidden rounded-[14px] bg-surface-raised text-primary shadow-window outline-none will-change-transform',
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
          </div>
        </RD.Content>
      </div>
    </>
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
