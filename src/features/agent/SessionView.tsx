import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { springs } from '@/lib/motion';
import { useSessions, selectEvents } from '@/stores/sessions';
import { useProjects } from '@/stores/projects';
import { VirtualList, type VirtualListHandle } from '@/components/ui/VirtualList';
import { deriveBlocks, type Block } from './blocks';
import { UserMessage } from './blocks/UserMessage';
import { AgentMessage } from './blocks/AgentMessage';
import { ToolGroup } from './blocks/ToolGroup';
import { FileChanges } from './blocks/FileChanges';
import { PermissionRequest } from './blocks/PermissionRequest';
import { CompletedStatus, LiveStatus } from './blocks/AgentStatus';
import { ErrorBlock, ImageBlock, ThinkingState } from './blocks/MiscBlocks';
import { Composer } from './Composer';
import { SessionFooter } from './SessionFooter';
import { runtime } from '@/providers/runtime';
import { AgentGlyph } from './AgentGlyph';
import { Shortcut } from '@/components/ui/Shortcut';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';

/** Vertical rhythm: one monospace line (≈21px) between blocks, like a transcript. */
const spacing: Record<Block['kind'], string> = {
  user: 'py-[11px]',
  assistant: 'py-[11px]',
  thinking: 'py-[5px]',
  tools: 'py-[11px]',
  files: 'py-[5px]',
  permission: 'py-[11px]',
  image: 'py-[5px]',
  error: 'py-[11px]',
  completed: 'py-[11px]',
};

/** When a block first appeared, from its (first) event. */
function blockTime(b: Block): number {
  if ('event' in b) return b.event.timestamp;
  if ('events' in b) return b.events[0]?.timestamp ?? 0;
  return 0;
}

export const SessionView = memo(function SessionView({ sessionId, focused, empty }: { sessionId: string; focused: boolean; empty?: ReactNode }) {
  const events = useSessions(selectEvents(sessionId));
  const session = useSessions((s) => s.sessions[sessionId]);
  const project = useProjects((s) => s.projects.find((p) => p.id === session?.projectId));
  const blocks = useMemo(() => deriveBlocks(events), [events]);
  const listRef = useRef<VirtualListHandle>(null);
  // Blocks created after this pane mounted animate in; history restored from the DB does not.
  const [mountedAt] = useState(() => Date.now());

  const busy = session?.status === 'running' || session?.status === 'waiting';
  const lastIsPermission = blocks[blocks.length - 1]?.kind === 'permission';

  const decide = useCallback(
    (eventId: string) => (decision: 'allow_once' | 'allow_always' | 'deny') => {
      void runtime.respondPermission(sessionId, eventId, decision);
    },
    [sessionId],
  );

  const resend = useCallback((text: string) => void runtime.send(sessionId, text), [sessionId]);

  useEffect(() => {
    listRef.current?.scrollToBottom();
  }, [sessionId]);

  const renderBlock = useCallback(
    (b: Block) => (
      <motion.div
        initial={blockTime(b) > mountedAt ? { opacity: 0, y: 10, filter: 'blur(3px)' } : false}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ default: springs.pop, opacity: { duration: 0.18 }, filter: { duration: 0.22 } }}
        className={cn('w-full', spacing[b.kind])}
      >
        {b.kind === 'user' ? <UserMessage event={b.event} onResend={resend} /> : null}
        {b.kind === 'assistant' ? <AgentMessage event={b.event} /> : null}
        {b.kind === 'thinking' ? <ThinkingState event={b.event} /> : null}
        {b.kind === 'tools' ? <ToolGroup events={b.events} summary={b.summary} running={b.running} /> : null}
        {b.kind === 'files' ? <FileChanges events={b.events} sessionId={sessionId} /> : null}
        {b.kind === 'permission' ? <PermissionRequest event={b.event} onDecide={decide(b.event.id)} /> : null}
        {b.kind === 'image' ? <ImageBlock event={b.event} /> : null}
        {b.kind === 'error' ? <ErrorBlock event={b.event} /> : null}
        {b.kind === 'completed' ? <CompletedStatus event={b.event} /> : null}
      </motion.div>
    ),
    [decide, resend, sessionId, mountedAt],
  );

  if (!session) return null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {blocks.length === 0 && empty ? (
        empty
      ) : blocks.length === 0 ? (
        <div className="flex flex-1 flex-col items-start justify-end gap-2 px-(--content-padding) pb-6 font-mono text-content">
          <div className="flex items-center gap-2 text-primary">
            <AgentGlyph className="size-[13px] text-secondary" />
            <span>{project ? t('New session in {name}', { name: project.name }) : t('New session')}</span>
          </div>
          <div className="max-w-[560px] pl-[26px] leading-[1.6] text-secondary">
            {t('Describe what you want done. Claude can read and edit files, run commands and search the project.')}
          </div>
          <div className="flex items-center gap-3 pl-[26px] text-[12.5px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Shortcut combo="@" /> {t('mention files')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Shortcut combo="/" /> {t('commands')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Shortcut combo="mod+k" /> {t('palette')}
            </span>
          </div>
        </div>
      ) : (
        <VirtualList
          handle={listRef}
          items={blocks}
          getKey={(b) => b.id}
          renderItem={renderBlock}
          estimateSize={(i) => (blocks[i]?.kind === 'user' ? 120 : blocks[i]?.kind === 'assistant' ? 96 : 44)}
          followOutput
          className="pt-[22px]"
          footer={
            <div className="w-full pb-4 pt-[6px]">
              {busy && !lastIsPermission ? <LiveStatus activity={session.activity} startedAt={session.runStartedAt} waiting={session.status === 'waiting'} /> : null}
            </div>
          }
        />
      )}
      <Composer sessionId={sessionId} focused={focused} />
      <SessionFooter session={session} />
    </div>
  );
});
