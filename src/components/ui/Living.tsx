import { forwardRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion, type HTMLMotionProps } from 'motion/react';
import { cn } from '@/lib/cn';
import { living, springs } from '@/lib/motion';

/*
 * The living layout.
 *
 * Nothing here animates height. A container that changes size (`LivingBox`)
 * gets `layout` and moves with the shared spring; whatever is conditionally
 * inside (`LivingReveal`) enters and leaves with opacity/transform only,
 * *while* the box is still moving; everything below is a `layout="position"`
 * node (`LivingItem`) in the same `LivingGroup`, so it slides continuously
 * instead of jumping when the box changes. Interrupt any of it (open → close → open) and the
 * spring continues from where the element is.
 *
 * The transcript is the one place this does not apply: its rows are
 * positioned by a virtualiser from measured heights, which a transform-based
 * size animation would never report — that list keeps `Collapsible`.
 */

/** One layout scope: every `layout` node inside re-measures whenever any of them changes, so a change anywhere moves everything in one spring. */
export function LivingGroup({ id, children }: { id?: string; children: ReactNode }) {
  return <LayoutGroup id={id}>{children}</LayoutGroup>;
}

export interface LivingItemProps extends HTMLMotionProps<'div'> {
  /** Mount without the entrance (rows that are already there when the list first paints). */
  still?: boolean;
}

/**
 * A row or block that moves with the layout — position only, so it is never
 * stretched while a parent grows — and fades/slides in and out of it.
 */
export const LivingItem = forwardRef<HTMLDivElement, LivingItemProps>(function LivingItem({ still, transition, ...rest }, ref) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      ref={ref}
      layout={reduced ? false : 'position'}
      initial={still ? false : reduced ? { opacity: 0 } : living.enter}
      animate={living.present}
      exit={reduced ? { opacity: 0 } : living.exit}
      transition={transition ?? living.transition}
      {...rest}
    />
  );
});

/**
 * A list whose rows come and go: leaving rows pop out of the flow at once
 * (so the rows below start moving immediately) and fade in place. Children
 * must be keyed `LivingItem`s.
 */
export function LivingList({ children, className, as: Tag = 'div', ...rest }: { children: ReactNode; className?: string; as?: 'div' | 'ul' } & Record<string, unknown>) {
  return (
    <Tag className={cn('relative', className)} {...rest}>
      <AnimatePresence initial={false} mode="popLayout">
        {children}
      </AnimatePresence>
    </Tag>
  );
}

export interface LivingBoxProps extends HTMLMotionProps<'div'> {
  /** Corner radius in px — motion keeps it visually constant while the box scales (pass it when the box has one). */
  radius?: number;
  /** Clip the content to the box while it is moving (default) — only then, so a drag or a shadow inside it is never cut off at rest. */
  clip?: boolean;
}

/**
 * A container whose size changes: the row that owns a reveal, the card that
 * grows a form. It springs between its sizes; everything inside must be a
 * position node (`LivingItem`, `LivingReveal`) so nothing is stretched with
 * it. It must keep some permanent content — a box that closes to nothing
 * cannot be projected (there is no size to scale from).
 */
export const LivingBox = forwardRef<HTMLDivElement, LivingBoxProps>(function LivingBox({ radius, clip = true, className, style, transition, onLayoutAnimationStart, onLayoutAnimationComplete, ...rest }, ref) {
  const reduced = useReducedMotion();
  const [moving, setMoving] = useState(false);
  return (
    <motion.div
      ref={ref}
      layout={!reduced}
      transition={transition ?? springs.living}
      onLayoutAnimationStart={() => {
        setMoving(true);
        onLayoutAnimationStart?.();
      }}
      onLayoutAnimationComplete={() => {
        setMoving(false);
        onLayoutAnimationComplete?.();
      }}
      className={cn('relative', clip && moving && 'overflow-hidden', className)}
      style={radius !== undefined ? { borderRadius: radius, ...style } : style}
      {...rest}
    />
  );
});

export interface LivingRevealProps {
  open: boolean;
  children: ReactNode;
  className?: string;
  id?: string;
}

/**
 * Conditional content inside a `LivingBox`. Open: the box takes its new size
 * and springs there while this fades in from slightly above. Close: this pops
 * out of the flow at once — so the box starts closing and everything below
 * starts moving immediately — and fades in place under the closing box.
 */
export function LivingReveal({ open, children, className, id }: LivingRevealProps) {
  const reduced = useReducedMotion();
  return (
    <AnimatePresence initial={false} mode="popLayout">
      {open ? (
        <motion.div
          key="content"
          id={id}
          layout={reduced ? false : 'position'}
          initial={reduced ? { opacity: 0 } : living.enter}
          animate={living.present}
          exit={reduced ? { opacity: 0 } : living.exit}
          transition={living.transition}
          className={className}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** A field that just appeared in a form: fades in from 3px above, staggered by its index. */
export const LivingField = forwardRef<HTMLDivElement, HTMLMotionProps<'div'> & { index?: number }>(function LivingField({ index = 0, ...rest }, ref) {
  const reduced = useReducedMotion();
  return <motion.div ref={ref} initial={reduced ? { opacity: 0 } : living.fieldFrom} animate={living.fieldTo} exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={living.field(index)} {...rest} />;
});

/** A chevron or "+" that turns when its thing opens (0 → 90°). */
export function Turn({ open, children, className, degrees = 90 }: { open: boolean; children: ReactNode; className?: string; degrees?: number }) {
  return (
    <motion.span animate={{ rotate: open ? degrees : 0 }} transition={springs.snappy} className={cn('inline-flex', className)}>
      {children}
    </motion.span>
  );
}

/**
 * Content that swaps by key (a settings section, an editor ↔ its diff, a
 * form whose fields depend on a choice): the old pops out of the flow and
 * fades under the new, which springs in — interruptible, no height motion.
 */
export function LivingSwitch({ k, children, className }: { k: string | number; children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <AnimatePresence initial={false} mode="popLayout">
      <motion.div key={k} layout={reduced ? false : 'position'} initial={reduced ? { opacity: 0 } : living.enter} animate={living.present} exit={reduced ? { opacity: 0 } : living.exit} transition={living.transition} className={className}>
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * An inline swap that must keep its place in a row (a label that becomes
 * an input): the new state fades in from 3px above; the old just goes —
 * there is no room in a row for two of them.
 */
export function Swap({ k, children, className, style }: { k: string | number; children: ReactNode; className?: string; style?: CSSProperties }) {
  const reduced = useReducedMotion();
  return (
    <motion.div key={k} initial={reduced ? { opacity: 0 } : living.fieldFrom} animate={living.fieldTo} transition={living.field(0)} className={className} style={style}>
      {children}
    </motion.div>
  );
}
