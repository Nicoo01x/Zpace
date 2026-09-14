import { Users, Pencil } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import { useSessions } from '@/stores/sessions';
import { useUI, collectLeaves } from '@/stores/ui';
import type { CustomAgent, Room } from '@/stores/agents';
import { AgentGlyph } from '@/features/agent/AgentGlyph';
import { AgentAvatar } from './AgentAvatar';
import { useAgentEditor } from './editor';
import { chatWithAgent, openRoom } from './room-runtime';
import { useSubagentEditor } from './editor';
import { ClaudeLogo } from '@/features/agent/BrandIcon';
import type { AssetInfo } from '@/stores/capabilities';

/** An agent in the sidebar: click chats with it in the current project, the pencil edits it. */
export function AgentRow({ agent }: { agent: CustomAgent }) {
  const active = useUI((s) => {
    const sid = s.activeSessionId;
    return !!sid && useSessions.getState().sessions[sid]?.agentId === agent.id;
  });
  return (
    <div className={cn('group/agent flex h-(--row-height) items-center gap-2 rounded-lg pl-2.5 pr-2 text-ui transition-colors duration-(--motion-fast)', active ? 'bg-surface-active text-primary' : 'text-secondary hover:bg-surface-hover hover:text-primary')}>
      <button type="button" onClick={() => void chatWithAgent(agent.id)} title={agent.instructions.split('\n')[0] || agent.name} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <AgentAvatar agent={agent} size={18} />
        <span className={cn('min-w-0 flex-1 truncate', active && 'font-medium')}>{agent.name}</span>
      </button>
      <button type="button" aria-label={t('Edit agent')} onClick={() => useAgentEditor.getState().open(agent.id)} className="hidden size-5 items-center justify-center rounded-[4px] text-muted press hover:bg-surface-active hover:text-primary group-hover/agent:inline-flex">
        <Pencil className="size-3" />
      </button>
    </div>
  );
}

/** One of Claude Code's own subagents (a Markdown file): click edits it. */
export function SubagentRow({ info }: { info: AssetInfo }) {
  const tag = info.source === 'user' ? t('user') : info.source === 'project' ? t('project') : info.source.replace(/^plugin:/, '');
  return (
    <button type="button" onClick={() => useSubagentEditor.getState().open({ path: info.path })} title={info.description} className="flex h-(--row-height) w-full items-center gap-2 rounded-lg pl-2.5 pr-2 text-left text-ui text-secondary transition-colors duration-(--motion-fast) hover:bg-surface-hover hover:text-primary">
      <span className="inline-flex w-5 shrink-0 items-center justify-center">
        <ClaudeLogo size={13} />
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{info.name}</span>
      <span className="shrink-0 rounded-[4px] bg-surface-active px-1 text-[10px] text-muted">{tag}</span>
    </button>
  );
}

/** A room under its project: the name, who is in it, how many are working. */
export function RoomRow({ room, agents }: { room: Room; agents: CustomAgent[] }) {
  const busy = useSessions(useShallow((s) => Object.values(room.sessions).filter((sid) => ['running', 'waiting'].includes(s.sessions[sid]?.status ?? '')).length));
  const shown = useUI((s) => collectLeaves(s.layout).some((l) => l.content.kind === 'room' && l.content.roomId === room.id && l.id === s.activePaneId));
  return (
    <button type="button" onClick={() => openRoom(room.id)} title={agents.map((a) => a.name).join(', ')} className={cn('flex h-(--row-height) w-full items-center gap-2 rounded-lg pl-2.5 pr-2 text-left text-ui transition-colors duration-(--motion-fast) hover:bg-surface-hover', shown ? 'bg-surface-active text-primary' : 'text-secondary hover:text-primary')}>
      <span className="inline-flex w-5 shrink-0 items-center justify-center">
        <Users className="size-[14px] text-accent" />
      </span>
      <span className="min-w-0 flex-1 truncate">{room.name}</span>
      {busy ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-accent-warm">
          <AgentGlyph active className="size-[11px]" /> {busy}
        </span>
      ) : (
        <span className="flex shrink-0 -space-x-1">
          {agents.slice(0, 4).map((a) => (
            <AgentAvatar key={a.id} agent={a} size={14} ring />
          ))}
        </span>
      )}
    </button>
  );
}
