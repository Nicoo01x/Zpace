import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import { cn } from '@/lib/cn';

/**
 * A number that springs to its value, each digit that changes blurring in
 * from above — adapted from 21st.dev's CountUp (unlumen): the spring and the
 * per-digit blur kept, the odometer and the viewport trigger dropped; it
 * starts on mount and follows later values (a skill saved, one deleted).
 */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const reduced = useReducedMotion();
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 90, damping: 26, mass: 0.9 });
  const [animated, setAnimated] = useState(['0']);

  useEffect(() => {
    if (reduced) return;
    mv.set(value);
    return spring.on('change', (v) => setAnimated(String(Math.round(v)).split('')));
  }, [value, reduced, mv, spring]);
  const chars = reduced ? String(value).split('') : animated;

  return (
    <span className={cn('inline-flex items-center tabular', className)}>
      {chars.map((c, i) => (
        <span key={i} className="relative inline-block">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={`${i}-${c}`}
              initial={{ opacity: 0, y: -6, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: 6, filter: 'blur(6px)' }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="inline-block"
            >
              {c}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}
