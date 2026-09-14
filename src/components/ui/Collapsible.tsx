import { useId, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { easings, living, springs } from '@/lib/motion';

export interface CollapsibleProps {
  open: boolean;
  children: ReactNode;
  className?: string;
  id?: string;
}

/**
 * Height-animated region for the transcript's blocks (tool groups, command
 * output). Those rows are positioned by a virtualiser from their measured
 * heights, so the height itself has to move — a transform-based layout
 * animation would never be reported to it. Everywhere else the living layout
 * (`LivingBox` / `LivingReveal`) does this with `layout` and no height at all.
 * Same spring, same content entrance, so the two read as one system.
 */
export function Collapsible({ open, children, className, id }: CollapsibleProps) {
  const reduced = useReducedMotion();
  const auto = useId();
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          id={id ?? auto}
          key="content"
          initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
          animate={reduced ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
          exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0, transition: { height: springs.living, opacity: { duration: 0.2, ease: easings.inOut } } }}
          transition={{ height: springs.living, opacity: { duration: 0.18, ease: easings.out } }}
          style={{ overflow: 'hidden' }}
          className={className}
        >
          <motion.div initial={reduced ? false : { y: living.enter.y, scale: living.enter.scale }} animate={{ y: 0, scale: 1 }} exit={reduced ? undefined : { y: living.exit.y, scale: living.exit.scale }} transition={springs.living}>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
