import type { CSSProperties } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import markUrl from '@/assets/brand/zorynq-mark.png';
import tileUrl from '@/assets/brand/zorynq.png';

/**
 * The Zpace "Z", painted in the current text colour: the logo's alpha is a
 * CSS mask over a `currentColor` box, so the same mark reads on light and
 * dark surfaces and can take the accent. Square; `size` in px. With a
 * `layoutId` it is a shared element: the mark flies between two places (the
 * entrance → the island).
 */
export function ZorynqMark({ size = 16, className, style, layoutId }: { size?: number; className?: string; style?: CSSProperties; layoutId?: string }) {
  const mask = `url(${markUrl}) center / contain no-repeat`;
  return (
    <motion.span
      layoutId={layoutId}
      layout={layoutId ? true : undefined}
      role="img"
      aria-label="Zpace"
      className={cn('inline-block shrink-0 bg-current', className)}
      style={{ width: size, height: size, WebkitMaskImage: `url(${markUrl})`, WebkitMaskSize: 'contain', WebkitMaskRepeat: 'no-repeat', WebkitMaskPosition: 'center', mask, ...style }}
    />
  );
}

/** The app icon as delivered: the Z on its white rounded tile (for dialogs and the entrance). */
export function ZorynqTile({ size = 48, className }: { size?: number; className?: string }) {
  return <img src={tileUrl} width={size} height={size} alt="Zpace" draggable={false} className={cn('shrink-0 select-none', className)} style={{ width: size, height: size, borderRadius: size * 0.2237 }} />;
}
