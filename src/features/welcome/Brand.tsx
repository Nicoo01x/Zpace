import { useState } from 'react';
import { motion, useReducedMotion, type Transition } from 'motion/react';
import { ZorynqMark } from '@/features/brand/ZorynqMark';
import { BRAND_LAYOUT_ID } from '@/features/island/Island';
import { springs } from '@/lib/motion';
import markUrl from '@/assets/brand/zorynq-mark.png';

const TILE = 64;
const MARK = 34;

/** The Z in three strokes (horizontal bands of the mark): each one flies in from its own side and they lock together. */
const STROKES = [
  { clip: 'inset(0 0 66% 0)', x: -26, y: -16, rotate: -18 },
  { clip: 'inset(33% 0 33% 0)', x: 30, y: 0, rotate: 24 },
  { clip: 'inset(66% 0 0 0)', x: -24, y: 18, rotate: 14 },
];

/** Where each letter of the word starts: scattered around its slot, tilted; they settle one after the other. */
const LETTERS = [
  { x: -36, y: -28, rotate: -24 },
  { x: 24, y: 32, rotate: 14 },
  { x: -14, y: -38, rotate: 28 },
  { x: 32, y: 20, rotate: -18 },
  { x: 48, y: -24, rotate: 12 },
];

const STROKE_AT = 0.22;
const LETTER_AT = 0.4;
const assemble: Transition = { type: 'spring', stiffness: 420, damping: 30, mass: 0.8 };
const settle: Transition = { type: 'spring', stiffness: 380, damping: 26, mass: 0.8 };

/**
 * The brand on the entrance: the island's tile with the Z assembling from its
 * strokes, then "Zpace" pulling itself together letter by letter. The real
 * mark (the shared element that flies up into the island on enter) sits
 * underneath, hidden (visibility, so a shared-layout flight from the island
 * stays invisible too) until the strokes have landed on top of it, so the
 * hand-off is pixel-exact. Leaving scatters the letters again.
 */
export function Brand() {
  const reduced = useReducedMotion();
  const [assembled, setAssembled] = useState(() => !!reduced);
  return (
    <div className="mb-6 flex items-center justify-center gap-3">
      <motion.div
        initial={{ opacity: 0, scale: 0.5, rotate: -14, y: 10 }}
        animate={{ opacity: 1, scale: 1, rotate: 0, y: 0 }}
        exit={{ opacity: 0, scale: 0.4, y: -40, transition: { duration: 0.35 } }}
        transition={{ ...springs.pop, delay: 0.05 }}
        className="relative inline-flex items-center justify-center bg-[#111] text-white shadow-[0_1px_3px_rgba(0,0,0,0.25),0_0_0_1px_rgba(255,255,255,0.06)]"
        style={{ width: TILE, height: TILE, borderRadius: 18 }}
      >
        {/* motion owns `visibility` on a layout element, so the hiding lives on a wrapper it does not touch */}
        <span style={{ display: 'contents', visibility: assembled ? undefined : 'hidden' }}>
          <ZorynqMark size={MARK} layoutId={BRAND_LAYOUT_ID} className="text-white" />
        </span>
        {!assembled &&
          STROKES.map((s, i) => {
            const delay = STROKE_AT + i * 0.07;
            return (
              <motion.span
                key={i}
                aria-hidden
                initial={{ x: s.x, y: s.y, rotate: s.rotate, opacity: 0, filter: 'blur(5px)' }}
                animate={{ x: 0, y: 0, rotate: 0, opacity: 1, filter: 'blur(0px)' }}
                transition={{ ...assemble, delay, opacity: { duration: 0.18, delay }, filter: { duration: 0.32, delay } }}
                onAnimationComplete={i === STROKES.length - 1 ? () => setAssembled(true) : undefined}
                className="absolute bg-current will-change-transform"
                style={{
                  width: MARK,
                  height: MARK,
                  left: (TILE - MARK) / 2,
                  top: (TILE - MARK) / 2,
                  clipPath: s.clip,
                  WebkitMaskImage: `url(${markUrl})`,
                  WebkitMaskSize: 'contain',
                  WebkitMaskRepeat: 'no-repeat',
                  WebkitMaskPosition: 'center',
                  mask: `url(${markUrl}) center / contain no-repeat`,
                }}
              />
            );
          })}
      </motion.div>
      <span role="img" aria-label="Zpace" className="inline-flex text-[22px] font-semibold tracking-[-0.02em] text-primary">
        {'Zpace'.split('').map((ch, i) => {
          const from = LETTERS[i] ?? { x: 0, y: 0, rotate: 0 };
          const delay = LETTER_AT + i * 0.06;
          return (
            <motion.span
              key={i}
              aria-hidden
              initial={reduced ? { opacity: 0 } : { opacity: 0, filter: 'blur(6px)', ...from }}
              animate={{ opacity: 1, filter: 'blur(0px)', x: 0, y: 0, rotate: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, filter: 'blur(4px)', x: (i - 2) * 12, y: -10 - i * 3, rotate: from.rotate / 2, transition: { duration: 0.22, delay: i * 0.02 } }}
              transition={{ ...settle, delay, opacity: { duration: 0.2, delay }, filter: { duration: 0.35, delay } }}
              className="inline-block will-change-transform"
            >
              {ch}
            </motion.span>
          );
        })}
      </span>
    </div>
  );
}
