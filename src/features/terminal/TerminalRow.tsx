import { memo, useEffect, useState } from 'react';
import { Pencil, SplitSquareHorizontal, Trash2, PanelBottom, FolderOpen, Play, FolderCog, Copy, Terminal, SlidersHorizontal } from 'lucide-react';
import { ClaudeLogo } from '@/features/agent/BrandIcon';
import { AGENT_KINDS, AGENT_LABEL, type AgentKind } from '@/features/agent/agents';
import { toast } from '@/features/notifications/toast-store';
import { cn } from '@/lib/cn';
import { Swap } from '@/components/ui/Living';
import type { TerminalTab } from '@/types/workspace';
import { useTerminals } from '@/stores/terminals';
import { useUI, collectLeaves } from '@/stores/ui';
import { useEnvironment } from '@/stores/environment';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger, ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent } from '@/components/ui/ContextMenu';
import { useWorkspaceActions } from '@/features/sessions/useWorkspaceActions';
import { ShellIcon } from './ShellIcon';
import { AgentLogo } from '@/features/agent/BrandIcon';
import { revealInFileManager } from '@/native/system';
import { PixelGrid } from '@/components/ui/LoadingState';
import { useTerminalActivity } from './activity';
import { terminalName, useClaudeLive } from './claude-live';
import { useClaudeWorking } from './claude-watch';
import { refreshChanges, useTerminalChanges } from './claude-changes';
import { paneDragProps } from '@/features/sessions/pane-drag';
import { MoveToSub } from '@/features/projects/MoveToMenu';
import { t } from '@/i18n';
import { copyText } from '@/lib/clipboard';

/**
 * Sidebar row for a terminal: shell glyph, title, live dot when a PTY is
 * attached. With Claude Code running in it the row grows a second line, the
 * way a chat has one: the conversation's own title (the one Claude gives the
 * terminal), the branch, whether it is working, and the lines it changed.
 */
export const TerminalRow = memo(function TerminalRow({ tab }: { tab: TerminalTab }) {
  const renameTab = useTerminals((s) => s.renameTab);
  const closeTab = useTerminals((s) => s.closeTab);
  const shells = useEnvironment((s) => s.report?.shells);
  const activePaneContent = useUI((s) => collectLeaves(s.layout).find((l) => l.id === s.activePaneId)?.content);
  const toggleTerminalPanel = useUI((s) => s.toggleTerminalPanel);
  const { focusTerminal, splitActive, openTerminalPane, openClaudeTerminal, openAgentTerminal } = useWorkspaceActions();
  const env = useEnvironment((st) => st.report);
  const installed = (a: AgentKind) => (a === 'claude' ? true : !!env?.[a]?.found);
  const others = AGENT_KINDS.filter((a) => a !== 'claude' && installed(a)) as Exclude<AgentKind, 'claude'>[];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tab.title);

  const active = activePaneContent?.kind === 'terminal' && activePaneContent.terminalId === tab.id;
  const busy = useTerminalActivity((s) => !!s.busy[tab.id]);
  const live = useClaudeLive((s) => s.byTab[tab.id]);
  const claudeTitle = useClaudeLive((s) => s.titles[tab.id]);
  const working = useClaudeWorking((s) => !!s.byTab[tab.id]);
  const adds = useTerminalChanges((s) => s.byTab[tab.id]?.session.reduce((n, f) => n + f.additions, 0) ?? 0);
  const dels = useTerminalChanges((s) => s.byTab[tab.id]?.session.reduce((n, f) => n + f.deletions, 0) ?? 0);
  const branch = useTerminalChanges((s) => s.byTab[tab.id]?.branch ?? null);
  const known = useTerminalChanges((s) => !!s.byTab[tab.id]);
  const isClaude = !!tab.program || !!live;
  const claudeRow = tab.program?.agent === 'claude' || !!live;
  const named = claudeRow ? terminalName(tab, claudeTitle) : tab.title;
  const label = named === tab.shellId ? (shells?.find((s) => s.id === tab.shellId)?.label ?? named) : named;
  // One look at the tree for a row whose terminal has not been shown yet in this run.
  useEffect(() => {
    if (live && tab.cwd && !known) void refreshChanges(tab.id, tab.cwd, live.since);
  }, [live, tab.cwd, tab.id, known]);

  const commit = () => {
    setEditing(false);
    const v = draft.trim();
    if (v && v !== tab.title) renameTab(tab.id, v);
    else setDraft(tab.title);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="treeitem"
          aria-selected={active}
          tabIndex={0}
          {...paneDragProps({ kind: 'terminal', terminalId: tab.id }, label)}
          onClick={() => focusTerminal(tab.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') focusTerminal(tab.id);
            if (e.key === 'F2') {
              setDraft(tab.title);
              setEditing(true);
            }
            if (e.key === 'Delete') closeTab(tab.id);
          }}
          className={cn(
            'group/row relative flex select-none items-center gap-2 rounded-lg pl-2.5 pr-2.5 text-ui outline-none transition-colors duration-(--motion-fast)',
            live ? 'min-h-(--row-height) py-1.5' : 'h-(--row-height)',
            active ? 'bg-surface-active text-primary' : 'text-secondary hover:bg-surface-hover hover:text-primary focus-visible:bg-surface-hover',
          )}
        >
          <span className={cn('inline-flex w-5 shrink-0 items-center justify-center', busy || working ? 'text-primary' : tab.ptyId ? 'text-success' : 'text-muted')} title={busy || working ? t('Working') : tab.ptyId ? t('Running') : t('Not started')}>
            <PixelGrid rows={2} active={busy || working} />
          </span>
          {isClaude ? (
            <span className={cn('inline-flex shrink-0 items-center', active ? 'text-primary' : 'text-secondary')}>
              <AgentLogo agent={tab.program?.agent ?? 'claude'} size={14} />
            </span>
          ) : (
            <ShellIcon shellId={tab.shellId} className="size-[14px] shrink-0 text-muted" />
          )}
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
                    setDraft(tab.title);
                    setEditing(false);
                  }
                }}
                className="h-6 min-w-0 flex-1 rounded-[4px] bg-surface px-1 text-ui text-primary shadow-[inset_0_0_0_1px_var(--accent)] outline-none"
              />
            ) : live ? (
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className={cn('min-w-0 flex-1 truncate', active && 'font-medium')}>{label}</span>
                  {adds || dels ? (
                    <span className="shrink-0 rounded-[5px] bg-surface-inset px-1 font-mono text-[10.5px] leading-[16px] tabular">
                      {adds ? <span className="text-success">+{adds}</span> : null}
                      {adds && dels ? ' ' : ''}
                      {dels ? <span className="text-danger">−{dels}</span> : null}
                    </span>
                  ) : null}
                </span>
                <span className="truncate text-[11.5px] text-muted">
                  {branch ? `${branch} · ` : ''}
                  {working ? t('Working') : t('Waiting for you')}
                </span>
              </span>
            ) : (
              <span className={cn('min-w-0 flex-1 truncate', active && 'font-medium')}>{label}</span>
            )}
          </Swap>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-[220px]">
        <ContextMenuItem icon={<SplitSquareHorizontal />} onSelect={() => splitActive('horizontal', { kind: 'terminal', terminalId: tab.id })}>
          {t('Open to the side')}
        </ContextMenuItem>
        <ContextMenuItem
          icon={<PanelBottom />}
          onSelect={() => {
            if (!useUI.getState().terminalPanelOpen) toggleTerminalPanel();
            focusTerminal(tab.id);
          }}
        >
          {t('Show in drawer')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger icon={<Play />}>{t('Run here')}</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem icon={<Terminal />} onSelect={() => openTerminalPane({ shellId: tab.shellId, cwd: tab.cwd, projectId: tab.projectId ?? null })}>
              {t('Another terminal in this folder')}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem icon={<ClaudeLogo />} onSelect={() => void openClaudeTerminal(tab.projectId ? { projectId: tab.projectId } : { folder: tab.cwd })}>
              {t('Claude Code here')}
            </ContextMenuItem>
            <ContextMenuItem icon={<SlidersHorizontal />} onSelect={() => void openClaudeTerminal(tab.projectId ? { projectId: tab.projectId, ask: true } : { folder: tab.cwd, ask: true })}>
              {t('Claude Code with arguments…')}
            </ContextMenuItem>
            {others.map((a) => (
              <ContextMenuItem key={a} icon={<AgentLogo agent={a} />} onSelect={() => void openAgentTerminal(a, tab.projectId ? { projectId: tab.projectId } : { folder: tab.cwd })}>
                {t('{agent} here', { agent: AGENT_LABEL[a] })}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSub>
          <ContextMenuSubTrigger icon={<FolderCog />}>{t('Organize')}</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem
              icon={<Pencil />}
              onSelect={() => {
                setDraft(tab.title);
                setEditing(true);
              }}
            >
              {t('Rename')}
            </ContextMenuItem>
            {tab.projectId ? <MoveToSub item={{ kind: 'terminal', id: tab.id }} projectId={tab.projectId} current={tab.folderId} /> : null}
            {tab.cwd ? (
              <>
                <ContextMenuItem icon={<FolderOpen />} onSelect={() => void revealInFileManager(tab.cwd)}>
                  {t('Reveal folder')}
                </ContextMenuItem>
                <ContextMenuItem
                  icon={<Copy />}
                  onSelect={() => {
                    void copyText(tab.cwd);
                    toast.neutral(t('Path copied'));
                  }}
                >
                  {t('Copy folder path')}
                </ContextMenuItem>
              </>
            ) : null}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem icon={<Trash2 />} danger onSelect={() => closeTab(tab.id)}>
          {t('Kill terminal')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});
