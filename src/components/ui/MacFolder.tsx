import { memo, useId } from 'react';
import { cn } from '@/lib/cn';

/**
 * The macOS folder — the Big Sur one: a darker back plate with the tab, a
 * lighter front plate with a soft top-to-bottom gradient and a hairline of
 * light along its top edge. `color` tints the whole thing (Finder tags,
 * project colours); without one it is the system blue. `open` lifts the
 * front plate a touch, the way Finder shows an open folder.
 */
export const MAC_FOLDER_BLUE = '#5aa6f5';

export const MacFolder = memo(function MacFolder({ color = MAC_FOLDER_BLUE, open, size = 16, className, title }: { color?: string; open?: boolean; size?: number; className?: string; title?: string }) {
  const id = useId();
  const back = `color-mix(in srgb, ${color} 78%, #1a2a44)`;
  const frontTop = `color-mix(in srgb, ${color} 62%, white)`;
  const frontBottom = `color-mix(in srgb, ${color} 92%, white)`;
  const edge = `color-mix(in srgb, ${color} 40%, white)`;
  return (
    <svg viewBox="0 0 20 16" width={size} height={size * 0.8} className={cn('shrink-0', className)} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={`${id}-front`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: frontTop }} />
          <stop offset="1" style={{ stopColor: frontBottom }} />
        </linearGradient>
      </defs>
      {/* back plate with the tab */}
      <path d="M1 3.2C1 2.4 1.65 1.75 2.45 1.75h4.3c.48 0 .93.2 1.25.55l.8.85c.3.32.72.5 1.15.5h7.6c.8 0 1.45.65 1.45 1.45v8.2c0 .8-.65 1.45-1.45 1.45h-15C1.65 14.75 1 14.1 1 13.3V3.2z" style={{ fill: back }} />
      {/* front plate — lifted when open */}
      <g style={{ transform: open ? 'translateY(-0.9px) skewX(-4deg)' : undefined, transformOrigin: '10px 15px' }}>
        <rect x="1" y={open ? 6.6 : 5.9} width="18" height={open ? 8.15 : 8.85} rx="1.45" style={{ fill: `url(#${id}-front)` }} />
        <rect x="1.6" y={open ? 6.9 : 6.2} width="16.8" height="0.6" rx="0.3" style={{ fill: edge, opacity: 0.9 }} />
      </g>
    </svg>
  );
});
