import { cn } from '@/lib/cn';

/** Discreet ring spinner — 1.5px stroke, no track. */
export function Spinner({ size = 13, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={cn('animate-spin-slow text-secondary', className)}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeOpacity="0.18" strokeWidth="1.5" />
      <path d="M14.25 8a6.25 6.25 0 0 0-6.25-6.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
