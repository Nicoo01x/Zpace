import { Swords, GitMerge } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/cn';
import { useSessions } from '@/stores/sessions';
import { useUI, collectLeaves } from '@/stores/ui';
import type { Arena } from '@/stores/arena';
import { AgentGlyph } from '@/features/agent/AgentGlyph';
import { openArena } from './launch';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/ContextMenu';
import { paneDragProps } from '@/features/sessions/pane-drag';
import { MoveToSub } from '@/features/projects/MoveToMenu';
import { t } from '@/i18n';

/** An arena under its project in the sidebar: the title, how many are still working, the verdict when there is one. */
export function ArenaRow({ arena }: { arena: Arena }) {
  const busy = useSessions(useShallow((s) => arena.variants.filter((v) => v.verdict === 'open' && ['running', 'waiting'].includes(s.sessions[v.sessionId]?.status ?? '')).length));
  const shown = useUI((s) => collectLeaves(s.layout).some((l) => l.content.kind === 'arena' && l.content.arenaId === arena.id && l.id === s.activePaneId));
  const open = arena.variants.filter((v) => v.verdict === 'open').length;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          onClick={() => openArena(arena.id)}
          title={arena.prompt}
          {...paneDragProps({ kind: 'arena', arenaId: arena.id }, arena.title)}
          className={cn('flex h-(--row-height) w-full items-center gap-2 rounded-lg pl-2.5 pr-2 text-left text-ui transition-colors duration-(--motion-fast) hover:bg-surface-hover', shown ? 'bg-surface-active text-primary' : 'text-secondary hover:text-primary')}
        >
          <span className="inline-flex w-5 shrink-0 items-center justify-center">
            <Swords className="size-[14px] text-accent" />
          </span>
          <span className="min-w-0 flex-1 truncate">{arena.title}</span>
          {arena.mergedAt ? (
            <GitMerge className="size-3 shrink-0 text-success" />
          ) : busy ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-accent-warm">
              <AgentGlyph active className="size-[11px]" /> {busy}
            </span>
          ) : (
            <span className="shrink-0 text-[11px] text-muted">{t('{n} ready', { n: open })}</span>
          )}
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-[180px]">
        <MoveToSub item={{ kind: 'arena', id: arena.id }} projectId={arena.projectId} current={arena.folderId} />
      </ContextMenuContent>
    </ContextMenu>
  );
}
