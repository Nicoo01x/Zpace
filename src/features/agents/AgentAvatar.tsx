import { cn } from '@/lib/cn';
import type { CustomAgent } from '@/stores/agents';
import { Bloub } from '@/features/mascot/Bloub';
import { usePaper } from '@/features/mascot/useMascot';

/**
 * The agent's creature — the same little mascot the app has, in the shape,
 * colour and face the agent was given. Still (one frozen frame) everywhere
 * it is small; the editor's preview is the live one.
 */
export function AgentAvatar({ agent, size = 20, className, ring, live }: { agent: Pick<CustomAgent, 'shape' | 'color' | 'expression' | 'name'>; size?: number; className?: string; ring?: boolean; live?: boolean }) {
  const paper = usePaper();
  return (
    <span role="img" aria-label={agent.name} title={agent.name} className={cn('inline-flex shrink-0 select-none items-center justify-center', ring && 'rounded-full shadow-[0_0_0_2px_var(--surface)]', className)} style={{ width: size, height: size }}>
      <Bloub size={size} shape={agent.shape} color={agent.color} expression={agent.expression} paper={paper} state="idle" follow={!!live} frozenAt={live ? undefined : 0.4} />
    </span>
  );
}
