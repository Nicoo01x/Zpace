import { cn } from '@/lib/cn';

/**
 * The agent's mark — a four-point asterisk. Rotates slowly while the agent
 * works. Used in the sidebar, the "Brewing…" status line and empty states.
 */
export function AgentGlyph({ active, className, size }: { active?: boolean; className?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden
      className={cn('shrink-0', active && 'animate-glyph', className)}
    >
      <path d="M8 0.5c.3 0 .55.22.6.52l.55 3.42a3.6 3.6 0 0 0 2.9 2.9l3.43.55a.6.6 0 0 1 0 1.2l-3.42.55a3.6 3.6 0 0 0-2.9 2.9l-.56 3.43a.6.6 0 0 1-1.2 0l-.55-3.42a3.6 3.6 0 0 0-2.9-2.9L.52 8.6a.6.6 0 0 1 0-1.2l3.42-.55a3.6 3.6 0 0 0 2.9-2.9L7.4 1.02A.6.6 0 0 1 8 .5Z" />
    </svg>
  );
}
