import { useEffect, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { cn } from '@/lib/cn';

/**
 * A pixel-grid loader for long-running work: nine cells with a chevron
 * wavefront driving right (`drive`), the same front on round cells
 * (`dots`), or a comet lapping the perimeter (`orbit`) — next to a
 * shimmering label and a live elapsed timer in tabular figures. The
 * timer counts from `since`, so a row that re-mounts keeps the truth.
 * Reduced motion freezes the grid dim; the timer still ticks.
 */
export type LoadingVariant = 'drive' | 'dots' | 'orbit';

// the cycle (650 ms) is shorter than the sweep, so two fronts are always in flight; the chevron's tip is the
// middle row, so with two rows it is a plain front driving right
const chevron = (rows: number) => Array.from({ length: rows * 3 }, (_, i) => (Math.abs(Math.floor(i / 3) - (rows - 1) / 2) + (i % 3)) * 90);
const ORBIT_ORDER = [0, 1, 2, 5, 8, 7, 6, 3];
const ORBIT = Array.from({ length: 9 }, (_, i) => (ORBIT_ORDER.indexOf(i) === -1 ? null : ORBIT_ORDER.indexOf(i) * 110));
function pattern(variant: LoadingVariant, rows: number): { delays: Array<number | null>; dur: number; round: boolean } {
  if (variant === 'orbit' && rows === 3) return { delays: ORBIT, dur: 950, round: false };
  return { delays: chevron(rows), dur: 650, round: variant === 'dots' };
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, ms) / 1000;
  if (total < 60) return `${total.toFixed(1)}s`;
  return `${Math.floor(total / 60)}m ${(total % 60).toFixed(1)}s`;
}

/** The nine cells alone — for a row that only has room for a glyph. Takes the text colour of its parent; still and dim when not `active`. */
export function PixelGrid({ variant = 'drive', rows = 3, active = true, className }: { variant?: LoadingVariant; rows?: 2 | 3; active?: boolean; className?: string }) {
  const reduced = useReducedMotion();
  const { delays, dur, round } = pattern(variant, rows);
  return (
    <span aria-hidden className={cn('grid shrink-0 grid-cols-[repeat(3,4px)] gap-[1.5px]', className)}>
      {delays.map((d, i) => (
        <span key={i} className={cn('size-[4px] bg-current', round ? 'rounded-full' : 'rounded-[1px]')} style={{ opacity: d === null ? 0.07 : active ? 0.15 : 0.45, animation: d === null || reduced || !active ? 'none' : `pixel-on ${dur}ms ease-in-out ${d}ms infinite` }} />
      ))}
    </span>
  );
}

export function LoadingState({ label, since, variant = 'drive', className }: { label: string; since: number; variant?: LoadingVariant; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, []);
  return (
    <span className={cn('inline-flex w-fit items-center gap-2 text-primary', className)}>
      <PixelGrid variant={variant} />
      <span className="bg-clip-text text-[12px] font-medium text-transparent" style={{ backgroundImage: 'linear-gradient(90deg, var(--text-muted) 35%, var(--text-primary) 50%, var(--text-muted) 65%)', backgroundSize: '200% 100%', animation: 'shimmer-text 1.4s linear infinite' }}>
        {label}
      </span>
      <span className="font-mono text-[11px] text-muted tabular">{formatElapsed(now - since)}</span>
    </span>
  );
}
