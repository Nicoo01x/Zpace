import { memo, useState } from 'react';
import { Pencil, Pin, PinOff, Archive, Copy, Trash2, SplitSquareHorizontal, StopCircle, Check, Terminal, Bot, FolderCog, ExternalLink, GitBranch } from 'lucide-react';
import { MODELS, useSettings } from '@/stores/settings';
import { useProjects } from '@/stores/projects';
import { git } from '@/native/git';
import { askText } from '@/stores/prompt';
import { toast } from '@/features/notifications/toast-store';
import { setSessionModel } from '@/features/agent/session-model';
import { ClaudeLogo } from '@/features/agent/BrandIcon';
import { claudeLaunchDefaults } from './useWorkspaceActions';
import { cn } from '@/lib/cn';
import { Swap } from '@/components/ui/Living';
import type { Session } from '@/types/workspace';
import { sessionTitle, useSessions } from '@/stores/sessions';
import { useAgents } from '@/stores/agents';
import { AgentAvatar } from '@/features/agents/AgentAvatar';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger, ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent } from '@/components/ui/ContextMenu';
import { useWorkspaceActions } from './useWorkspaceActions';
import { runtime } from '@/providers/runtime';
import { AgentGlyph } from '@/features/agent/AgentGlyph';
import { Grip } from '@/components/ui/Grip';
import { paneDragProps } from '@/features/sessions/pane-drag';
import { t } from '@/i18n';

/**
 * Session row:   ⁝⁝  Production deployment setup            ✱
 * The grip appears on the selected row (warm accent); the agent mark on the
 * right is muted when idle, dark when selected, warm + spinning when running,
 * amber when waiting for a permission.
 */
export const SessionRow = memo(function SessionRow({ session, active }: { session: Session; active: boolean }) {
  const update = useSessions((s) => s.updateSession);
  const duplicate = useSessions((s) => s.duplicateSession);
  const { openSession, deleteSession, splitActive, launchClaude } = useWorkspaceActions();
  const project = useProjects((st) => st.projects.find((x) => x.id === session.projectId));
  // The same conversation in Claude's own terminal (needs the provider's session id, known after the first turn).
  const resumeInTerminal = () => {
    if (!project || !session.providerSessionId) return;
    void runtime.dispose(session.id).catch(() => void 0);
    const d = claudeLaunchDefaults(useSettings.getState().claude);
    void launchClaude(project.id, { ...d, continueLast: false, extraArgs: `${d.extraArgs} --resume ${session.providerSessionId}`.trim() });
  };
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.title);
  const agent = useAgents((s) => (session.agentId ? s.agents[session.agentId] : undefined));

  const commit = () => {
    setEditing(false);
    const v = draft.trim();
    if (v && v !== session.title) update(session.id, { title: v });
    else setDraft(session.title);
  };

  const busy = session.status === 'running' || session.status === 'waiting';

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="treeitem"
          aria-selected={active}
          tabIndex={0}
          data-session-id={session.id}
          {...paneDragProps({ kind: 'session', sessionId: session.id }, session.title)}
          onClick={() => openSession(session.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') openSession(session.id);
            if (e.key === 'F2') {
              setDraft(session.title);
              setEditing(true);
            }
            if (e.key === 'Delete') deleteSession(session.id);
          }}
          className={cn(
            'group/session relative flex h-(--row-height) select-none items-center gap-2 rounded-lg pl-2.5 pr-2.5 text-ui outline-none transition-colors duration-(--motion-fast)',
            active ? 'bg-surface-active text-primary' : 'text-secondary hover:bg-surface-hover hover:text-primary focus-visible:bg-surface-hover',
          )}
        >
          <span className="inline-flex w-5 shrink-0 items-center justify-center">
            {agent ? <AgentAvatar agent={agent} size={16} /> : <Grip className={cn('transition-opacity duration-(--motion-fast)', active ? 'opacity-100' : 'opacity-0 group-hover/session:opacity-40')} />}
          </span>
          <Swap k={editing ? 'edit' : 'label'} className="flex min-w-0 flex-1 items-center">
            {editing ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') commit();
                  if (e.key === 'Escape') {
                    setDraft(session.title);
                    setEditing(false);
                  }
                }}
                className="h-6 min-w-0 flex-1 rounded-[4px] bg-surface px-1 text-ui text-primary shadow-[inset_0_0_0_1px_var(--accent)] outline-none"
              />
            ) : (
              <span className={cn('min-w-0 flex-1 truncate', active && 'font-medium')}>{sessionTitle(session.title)}</span>
            )}
          </Swap>
          <span className="flex shrink-0 items-center gap-1.5">
            {session.pinned ? <Pin className="size-[10px] text-muted" /> : null}
            <AgentGlyph
              active={session.status === 'running'}
              className={cn(
                'size-[13px]',
                session.status === 'running' && 'text-accent-warm',
                session.status === 'waiting' && 'text-warning',
                session.status === 'error' && 'text-danger',
                !busy && session.status !== 'error' && (active ? 'text-primary' : 'text-muted/70'),
              )}
            />
          </span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-[220px]">
        <ContextMenuItem icon={<AgentGlyph className="size-[13px]" />} onSelect={() => openSession(session.id)}>
          {t('Open')}
        </ContextMenuItem>
        <ContextMenuItem icon={<SplitSquareHorizontal />} onSelect={() => splitActive('horizontal', { kind: 'session', sessionId: session.id })}>
          {t('Open to the side')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger icon={<Bot />}>{t('Agent')}</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {busy ? (
              <ContextMenuItem icon={<StopCircle />} onSelect={() => void runtime.cancel(session.id)}>
                {t('Stop agent')}
              </ContextMenuItem>
            ) : null}
            <ContextMenuItem icon={<Terminal />} disabled={!session.providerSessionId || !project} onSelect={resumeInTerminal}>
              {t('Continue in Claude Code (terminal)')}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuSub>
              <ContextMenuSubTrigger icon={<ClaudeLogo />}>{t('Model')}<span className="ml-2 truncate text-[11px] text-muted">{session.modelLabel}</span></ContextMenuSubTrigger>
              <ContextMenuSubContent>
                {MODELS.map((m) => (
                  <ContextMenuItem key={m.id} icon={m.id === session.model ? <Check /> : <span className="inline-block size-[13px]" />} onSelect={() => setSessionModel(session, m.id)}>
                    {m.label}
                    <span className="ml-auto pl-3 text-[11px] text-muted">{m.hint}</span>
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSub>
          <ContextMenuSubTrigger icon={<FolderCog />}>{t('Organize')}</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem
              icon={<Pencil />}
              onSelect={() => {
                setDraft(session.title);
                setEditing(true);
              }}
            >
              {t('Rename')}
            </ContextMenuItem>
            <ContextMenuItem icon={session.pinned ? <PinOff /> : <Pin />} onSelect={() => update(session.id, { pinned: !session.pinned })}>
              {session.pinned ? t('Unpin') : t('Pin')}
            </ContextMenuItem>
            <ContextMenuItem icon={<Copy />} onSelect={() => duplicate(session.id)}>
              {t('Duplicate')}
            </ContextMenuItem>
            <ContextMenuItem icon={<Archive />} onSelect={() => update(session.id, { archived: true })}>
              {t('Archive')}
            </ContextMenuItem>
            {session.worktree ? (
              <ContextMenuItem
                icon={<GitBranch />}
                onSelect={() => {
                  const wt = session.worktree!;
                  if (!project) return;
                  void runtime.dispose(session.id).catch(() => void 0);
                  void askText({ title: t('Remove worktree'), description: t('Type the branch name to delete the branch as well, or leave it to keep the branch and only drop the checkout.'), placeholder: wt.branch, initial: '', confirm: t('Remove'), allowEmpty: true })
                    .then((answer) => {
                      if (answer === null) return null;
                      return git.worktreeRemove(project.path, wt.path, true, answer.trim() === wt.branch ? wt.branch : undefined).then(() => true);
                    })
                    .then((done) => {
                      if (!done) return;
                      update(session.id, { worktree: undefined });
                      toast.success(t('Worktree removed'), { description: wt.path, mark: 'commit' });
                    })
                    .catch((e: unknown) => toast.error(t('Could not remove the worktree'), { description: String(e) }));
                }}
              >
                {t('Remove worktree')}
              </ContextMenuItem>
            ) : null}
            <ContextMenuItem
              icon={<ExternalLink />}
              disabled={!session.providerSessionId}
              onSelect={() => {
                void navigator.clipboard.writeText(session.providerSessionId ?? '');
              }}
            >
              {t('Copy session id')}
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem icon={<Trash2 />} danger onSelect={() => deleteSession(session.id)}>
          {t('Delete')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});
