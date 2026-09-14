import { cn } from '@/lib/cn';

/** Six-dot drag grip in the warm accent — marks the selected session and the workspace tab. */
export function Grip({ className }: { className?: string }) {
  return (
    <svg width="8" height="13" viewBox="0 0 8 13" aria-hidden className={cn('shrink-0 text-accent-warm', className)}>
      {[1.5, 6.5, 11.5].map((y) => (
        <g key={y}>
          <circle cx="1.75" cy={y} r="1.25" fill="currentColor" />
          <circle cx="6.25" cy={y} r="1.25" fill="currentColor" />
        </g>
      ))}
    </svg>
  );
}
