import { memo, useState } from 'react';
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
import { paneDragProps } from '@/features/sessions/pane-drag';
import { t } from '@/i18n';

/** Sidebar row for a terminal: shell glyph, title, live dot when a PTY is attached. */
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
  const isClaude = !!tab.program;
  const label = tab.title === tab.shellId ? (shells?.find((s) => s.id === tab.shellId)?.label ?? tab.title) : tab.title;

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
            'group/row relative flex h-(--row-height) select-none items-center gap-2 rounded-lg pl-2.5 pr-2.5 text-ui outline-none transition-colors duration-(--motion-fast)',
            active ? 'bg-surface-active text-primary' : 'text-secondary hover:bg-surface-hover hover:text-primary focus-visible:bg-surface-hover',
          )}
        >
          <span className={cn('inline-flex w-5 shrink-0 items-center justify-center', busy ? 'text-primary' : tab.ptyId ? 'text-success' : 'text-muted')} title={busy ? t('Working') : tab.ptyId ? t('Running') : t('Not started')}>
            <PixelGrid rows={2} active={busy} />
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
            {tab.cwd ? (
              <>
                <ContextMenuItem icon={<FolderOpen />} onSelect={() => void revealInFileManager(tab.cwd)}>
                  {t('Reveal folder')}
                </ContextMenuItem>
                <ContextMenuItem
                  icon={<Copy />}
                  onSelect={() => {
                    void navigator.clipboard.writeText(tab.cwd);
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
