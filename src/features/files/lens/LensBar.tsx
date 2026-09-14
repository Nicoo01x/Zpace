import { motion } from 'motion/react';
import { Code2, History, MessageSquareText } from 'lucide-react';
import { cn } from '@/lib/cn';
import { springs } from '@/lib/motion';
import { Tooltip } from '@/components/ui/Tooltip';
import { t } from '@/i18n';

export type Lens = 'code' | 'timeline';

/**
 * The lens strip under a file's header: Code · Timeline, and the margin
 * toggle on the right with how many notes wait there. Keyboard: Alt+1/2 for
 * the lenses, Alt+M for the margin (handled by the pane).
 */
export function LensBar({ lens, onLens, margin, onMargin, notes, steps }: { lens: Lens; onLens: (l: Lens) => void; margin: boolean; onMargin: () => void; notes: number; steps: number }) {
  const items: Array<{ id: Lens; label: string; icon: typeof Code2; hint: string; badge?: number }> = [
    { id: 'code', label: t('Code'), icon: Code2, hint: t('The editor') },
    { id: 'timeline', label: t('Timeline'), icon: History, hint: t('Every edit the agent made here, step by step'), badge: steps > 1 ? steps - 1 : undefined },
  ];
  return (
    <div className="flex h-8 shrink-0 items-center gap-1 px-2 hairline-b">
      <div className="relative flex items-center gap-0.5 rounded-md bg-surface-inset p-0.5">
        {items.map((it) => {
          const Icon = it.icon;
          const on = lens === it.id;
          return (
            <Tooltip key={it.id} content={it.hint} side="bottom">
              <button type="button" onClick={() => onLens(it.id)} aria-pressed={on} className={cn('relative inline-flex h-6 items-center gap-1.5 rounded-[5px] px-2 text-[11.5px] font-medium transition-colors', on ? 'text-primary' : 'text-secondary hover:text-primary')}>
                {on ? <motion.span layoutId="lens-pill" transition={springs.snappy} className="absolute inset-0 -z-10 rounded-[5px] bg-surface-raised shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_var(--border)]" /> : null}
                <Icon className="size-[13px]" />
                <span className="hidden @[520px]:inline">{it.label}</span>
                {it.badge ? <span className="rounded-full bg-accent-soft px-1 text-[10px] tabular text-accent">{it.badge}</span> : null}
              </button>
            </Tooltip>
          );
        })}
      </div>
      <span className="flex-1" />
      <Tooltip content={t('Notes pinned to lines — ask Claude without leaving the file')} side="bottom">
        <button type="button" onClick={onMargin} aria-pressed={margin} className={cn('inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[11.5px] font-medium transition-colors', margin ? 'bg-surface-active text-primary' : 'text-secondary hover:bg-surface-hover hover:text-primary')}>
          <MessageSquareText className="size-[13px]" />
          <span className="hidden @[520px]:inline">{t('Margin')}</span>
          {notes ? <span className={cn('rounded-full px-1 text-[10px] tabular', margin ? 'bg-accent text-inverse' : 'bg-accent-soft text-accent')}>{notes}</span> : null}
        </button>
      </Tooltip>
    </div>
  );
}
