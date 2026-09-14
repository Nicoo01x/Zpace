import { memo, useState } from 'react';
import { Reorder, useDragControls } from 'motion/react';
import { useShallow } from 'zustand/react/shallow';
import { Folder, FolderOpen, Plus, Terminal, Pencil, Settings2, X, ExternalLink, MoreHorizontal, Sparkles, NotebookPen, GitBranch, SlidersHorizontal, Eye, LayoutDashboard, FolderTree, Globe, Swords, Users } from 'lucide-react';
import { useBrowserMemory } from '@/stores/browser-memory';
import { cn } from '@/lib/cn';
import type { Project } from '@/types/workspace';
import { useProjects } from '@/stores/projects';
import { useSessions, sessionsForProject } from '@/stores/sessions';
import { useTerminals } from '@/stores/terminals';
import { useNotes, sortedNotes, noteTitle } from '@/stores/notes';
import { useUI } from '@/stores/ui';
import { LivingItem, LivingList, LivingReveal, Swap } from '@/components/ui/Living';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger, ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent } from '@/components/ui/ContextMenu';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from '@/components/ui/DropdownMenu';
import { ShellIcon } from '@/features/terminal/ShellIcon';
import { useSettings } from '@/stores/settings';
import { StatusDot } from '@/components/ui/StatusDot';
import { SessionRow } from '@/features/sessions/SessionRow';
import { ArenaRow } from '@/features/arena/ArenaRow';
import { useArena, arenasFor } from '@/stores/arena';
import { useArenaLauncher } from '@/features/arena/launcher';
import { useAgents, roomsFor, type CustomAgent } from '@/stores/agents';
import { RoomRow } from '@/features/agents/rows';
import { useRoomLauncher } from '@/features/agents/editor';
import { TerminalRow } from '@/features/terminal/TerminalRow';
import { NoteRow } from '@/features/notes/NoteRow';
import { useWorkspaceActions } from '@/features/sessions/useWorkspaceActions';
import { ClaudeLogo, CodexLogo, GeminiLogo, OpenCodeLogo } from '@/features/agent/BrandIcon';
import { useEnvironment } from '@/stores/environment';
import { openPath, revealInFileManager } from '@/native/system';
import { springs } from '@/lib/motion';
import { isWindows } from '@/lib/platform';
import { t } from '@/i18n';
import { PROJECT_COLORS } from './colors';
import { MacFolder } from '@/components/ui/MacFolder';
import { askText } from '@/stores/prompt';
import { ColorDot } from '@/components/ui/ColorDot';
import { Tooltip } from '@/components/ui/Tooltip';

/** The menu components of one family (context or dropdown), so one JSX tree serves both. */
interface MenuKit {
  Item: typeof ContextMenuItem;
  Sep: typeof ContextMenuSeparator;
  Sub: typeof ContextMenuSub;
  SubTrigger: typeof ContextMenuSubTrigger;
  SubContent: typeof ContextMenuSubContent;
}
const CONTEXT_KIT: MenuKit = { Item: ContextMenuItem, Sep: ContextMenuSeparator, Sub: ContextMenuSub, SubTrigger: ContextMenuSubTrigger, SubContent: ContextMenuSubContent };
const DROPDOWN_KIT = { Item: DropdownMenuItem, Sep: DropdownMenuSeparator, Sub: DropdownMenuSub, SubTrigger: DropdownMenuSubTrigger, SubContent: DropdownMenuSubContent } as unknown as MenuKit;

/**
 * Project group row:  [folder]  name                       ·
 * click → last session · double-click / chevron-less: the folder glyph opens.
 */
export const ProjectGroup = memo(function ProjectGroup({ project }: { project: Project }) {
  const toggleExpanded = useProjects((s) => s.toggleExpanded);
  const rename = useProjects((s) => s.renameProject);
  const setColor = useProjects((s) => s.setColor);
  const needle = useUI((s) => s.sidebarFilter.trim().toLowerCase());
  const nameMatches = !needle || project.name.toLowerCase().includes(needle);
  // While filtering, a project whose own name matches shows everything; otherwise only matching children.
  const keep = (title: string) => nameMatches || title.toLowerCase().includes(needle);
  const sessions = useSessions(useShallow((s) => sessionsForProject(s.sessions, project.id).filter((x) => keep(x.title))));
  const terminals = useTerminals(useShallow((s) => s.tabs.filter((t) => t.projectId === project.id && keep(t.title))));
  const notes = useNotes(useShallow((s) => sortedNotes(s.notes).filter((n) => n.projectId === project.id && keep(noteTitle(n)))));
  const activeSessionId = useUI((s) => s.activeSessionId);
  const activeProjectId = useUI((s) => s.activeProjectId);
  const setActiveProject = useUI((s) => s.setActiveProject);
  const openSettings = useUI((s) => s.openSettings);
  const { newSession, newWorktreeSession, openTerminalPane, openClaudeTerminal, openAgentTerminal, newNote, newBoard, openProjectBoard, closeProject, openBrowser } = useWorkspaceActions();
  /** Branch name → a session on its own worktree. */
  const askBranch = async (pid: string) => {
    const branch = await askText({ title: t('New session in a worktree…'), description: t('A checkout of its own beside the project folder; the branch is created if it does not exist — add "from main" to branch off something other than HEAD.'), placeholder: 'feature/… from main', confirm: t('Create') });
    if (branch) await newWorktreeSession(pid, branch);
  };
  const arenas = useArena(useShallow((s) => arenasFor(s.arenas, project.id).filter((a) => keep(a.title))));
  const openArenaLauncher = useArenaLauncher((s) => s.open);
  const rooms = useAgents(useShallow((s) => roomsFor(s.rooms, project.id).filter((r) => keep(r.name))));
  const allAgents = useAgents((s) => s.agents);
  const agentsOf = (r: (typeof rooms)[number]) => r.agentIds.map((id) => allAgents[id]).filter((a): a is CustomAgent => !!a);
  const openRoomLauncher = useRoomLauncher((s) => s.open);
  const browsed = useBrowserMemory((s) => s.byProject[project.id]);
  const forgetBrowsed = useBrowserMemory((s) => s.forget);
  const codex = useEnvironment((s) => s.report?.codex?.found ?? false);
  const gemini = useEnvironment((s) => s.report?.gemini?.found ?? false);
  const opencode = useEnvironment((s) => s.report?.opencode?.found ?? false);
  const shells = useEnvironment(useShallow((s) => s.report?.shells ?? []));
  const preferredShell = useSettings((s) => s.terminal.shellId);
  const defaultShellId = preferredShell ?? shells[0]?.id;
  const toggleGitPanel = useUI((s) => s.toggleGitPanel);
  const controls = useDragControls();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.name);

  const running = sessions.filter((s) => s.status === 'running').length;
  const waiting = sessions.filter((s) => s.status === 'waiting').length;
  const errored = sessions.some((s) => s.status === 'error');
  const isActiveProject = sessions.some((s) => s.id === activeSessionId);
  const childCount = rooms.length + sessions.length + terminals.length + notes.length + (browsed ? 1 : 0);
  // A filter that hits something inside the project unfolds it so the match is visible.
  const expanded = (project.expanded || (!!needle && !nameMatches)) && childCount > 0;

  /** Click selects the project as context and toggles its sessions; it never creates anything. */
  const activate = () => {
    setActiveProject(project.id);
    useProjects.getState().touch(project.id);
    toggleExpanded(project.id);
  };

  const commitRename = () => {
    setEditing(false);
    const v = draft.trim();
    if (v && v !== project.name) rename(project.id, v);
    else setDraft(project.name);
  };

  /** One entry per detected shell (the default first, marked), each opening a terminal in the project. */
  const shellItems = (M: MenuKit) =>
    [...shells].sort((a, b) => (a.id === defaultShellId ? -1 : b.id === defaultShellId ? 1 : 0)).map((sh) => (
      <M.Item key={sh.id} icon={<ShellIcon shellId={sh.id} />} onSelect={() => openTerminalPane({ projectId: project.id, shellId: sh.id })}>
        {sh.label}
        {sh.id === defaultShellId ? <span className="ml-auto pl-3 text-[11px] text-muted">{t('default')}</span> : null}
      </M.Item>
    ));

  /** The project's menu, grouped: Agents ▸, New ▸, then the project itself, then System ▸. Same items in the ⋯ and the right-click. */
  const menuItems = (M: MenuKit) => (
    <>
      <M.Sub>
        <M.SubTrigger icon={<ClaudeLogo />}>{t('Agents')}</M.SubTrigger>
        <M.SubContent>
          <M.Item icon={<ClaudeLogo />} onSelect={() => void openClaudeTerminal({ projectId: project.id })}>
            {t('Claude Code here')}
          </M.Item>
          <M.Item icon={<SlidersHorizontal />} onSelect={() => void openClaudeTerminal({ projectId: project.id, ask: true })}>
            {t('Claude Code with arguments…')}
          </M.Item>
          <M.Item icon={<Sparkles />} onSelect={() => newSession(project.id)}>
            {t('Structured session (chat view)')}
          </M.Item>
          {project.git?.isRepo ? (
            <M.Item icon={<GitBranch />} onSelect={() => void askBranch(project.id)}>
              {t('New session in a worktree…')}
            </M.Item>
          ) : null}
          {codex || gemini || opencode ? <M.Sep /> : null}
          {codex ? (
            <M.Item icon={<CodexLogo />} onSelect={() => void openAgentTerminal('codex', { projectId: project.id })}>
              {t('Codex here')}
            </M.Item>
          ) : null}
          {gemini ? (
            <M.Item icon={<GeminiLogo />} onSelect={() => void openAgentTerminal('gemini', { projectId: project.id })}>
              {t('Gemini CLI here')}
            </M.Item>
          ) : null}
          {opencode ? (
            <M.Item icon={<OpenCodeLogo />} onSelect={() => void openAgentTerminal('opencode', { projectId: project.id })}>
              {t('OpenCode here')}
            </M.Item>
          ) : null}
        </M.SubContent>
      </M.Sub>
      <M.Sub>
        <M.SubTrigger icon={<Plus />}>{t('New')}</M.SubTrigger>
        <M.SubContent>
          {shells.length > 1 ? (
            <M.Sub>
              <M.SubTrigger icon={<Terminal />}>{t('Terminal here')}</M.SubTrigger>
              <M.SubContent>{shellItems(M)}</M.SubContent>
            </M.Sub>
          ) : (
            <M.Item icon={<Terminal />} onSelect={() => openTerminalPane({ projectId: project.id })}>
              {t('Terminal here')}
            </M.Item>
          )}
          <M.Item icon={<NotebookPen />} onSelect={() => newNote({ projectId: project.id })}>
            {t('Note')}
          </M.Item>
          <M.Item icon={<LayoutDashboard />} onSelect={() => newBoard({ projectId: project.id })}>
            {t('Board')}
          </M.Item>
          {project.git?.isRepo ? (
            <M.Item icon={<Swords />} onSelect={() => openArenaLauncher(project.id)}>
              {t('Agent arena…')}
            </M.Item>
          ) : null}
          <M.Item icon={<Users />} onSelect={() => openRoomLauncher(project.id)}>
            {t('Multi-agent room…')}
          </M.Item>
          <M.Item icon={<Globe />} onSelect={() => openBrowser(undefined, 'pane', project.id)}>
            {t('Browser here')}
          </M.Item>
        </M.SubContent>
      </M.Sub>
      <M.Sep />
      <M.Item icon={<Eye />} onSelect={() => openProjectBoard(project.id)}>
        {t('Project board')}
      </M.Item>
      <M.Item
        icon={<FolderTree />}
        onSelect={() => {
          setActiveProject(project.id);
          if (!useUI.getState().explorerOpen) useUI.getState().toggleExplorer();
        }}
      >
        {t('Browse files')}
      </M.Item>
      <M.Item icon={<GitBranch />} onSelect={() => { setActiveProject(project.id); toggleGitPanel(); }}>
        {t('Git panel')}
      </M.Item>
      <M.Sep />
      <M.Item
        icon={<Pencil />}
        onSelect={() => {
          setDraft(project.name);
          setEditing(true);
        }}
      >
        {t('Rename')}
      </M.Item>
      <div className="px-2 pb-1.5 pt-1">
        <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-muted">{t('Folder colour')}</div>
        <div role="group" aria-label={t('Folder colour')} className="flex items-center gap-1.5">
          <Tooltip content={t('None')} side="bottom">
            <button
              type="button"
              aria-pressed={!project.color}
              aria-label={t('None')}
              onClick={() => setColor(project.id, undefined)}
              className={cn('inline-flex size-[18px] items-center justify-center rounded-full text-muted transition-transform hover:scale-110', !project.color && 'ring-2 ring-[var(--text-primary)] ring-offset-1 ring-offset-[var(--surface-raised)]')}
            >
              <Folder className="size-[13px]" strokeWidth={1.75} />
            </button>
          </Tooltip>
          {PROJECT_COLORS.map((c) => (
            <Tooltip key={c.id} content={t(c.label)} side="bottom">
              <button
                type="button"
                aria-pressed={project.color === c.value}
                aria-label={t(c.label)}
                onClick={() => setColor(project.id, c.value)}
                style={{ backgroundColor: c.value }}
                className={cn('size-[18px] rounded-full transition-transform hover:scale-110', project.color === c.value && 'ring-2 ring-[var(--text-primary)] ring-offset-1 ring-offset-[var(--surface-raised)]')}
              />
            </Tooltip>
          ))}
          <ColorDot value={project.color} custom={!!project.color && !PROJECT_COLORS.some((c) => c.value === project.color)} onChange={(hex) => setColor(project.id, hex)} />
        </div>
      </div>
      <M.Sub>
        <M.SubTrigger icon={<ExternalLink />}>{t('System')}</M.SubTrigger>
        <M.SubContent>
          <M.Item icon={<FolderOpen />} onSelect={() => void openPath(project.path)}>
            {t('Open folder')}
          </M.Item>
          <M.Item icon={<ExternalLink />} onSelect={() => void revealInFileManager(project.path)}>
            {isWindows ? t('Reveal in Explorer') : t('Reveal in Finder')}
          </M.Item>
          <M.Item icon={<Settings2 />} onSelect={() => openSettings('claude')}>
            {t('Settings')}
          </M.Item>
        </M.SubContent>
      </M.Sub>
      <M.Sep />
      <M.Item icon={<X />} danger onSelect={() => closeProject(project.id)}>
        {t('Close project')}
      </M.Item>
    </>
  );


  return (
    <Reorder.Item
      value={project}
      dragListener={false}
      dragControls={controls}
      as="div"
      layout
      transition={springs.living}
      className="relative overflow-hidden"
      whileDrag={{ scale: 1.01, zIndex: 50, boxShadow: 'var(--shadow-popover)', borderRadius: 8, backgroundColor: 'var(--surface-raised)' }}
    >
      <LivingItem still>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            role="treeitem"
            aria-expanded={expanded}
            aria-selected={activeProjectId === project.id}
            tabIndex={0}
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest('button, input')) return;
              controls.start(e);
            }}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('button, input')) return;
              activate();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') activate();
              if (e.key === 'ArrowRight') toggleExpanded(project.id, true);
              if (e.key === 'ArrowLeft') toggleExpanded(project.id, false);
              if (e.key === 'F2') {
                setDraft(project.name);
                setEditing(true);
              }
            }}
            className={cn(
              'group/project flex h-(--row-height) select-none items-center gap-2.5 rounded-lg pl-2.5 pr-2 text-ui outline-none transition-colors duration-(--motion-fast)',
              'hover:bg-surface-hover focus-visible:bg-surface-hover',
              activeProjectId === project.id && !isActiveProject ? 'bg-surface-hover text-primary' : 'text-primary',
            )}
          >
            <button
              type="button"
              aria-label={expanded ? t('Collapse') : t('Expand')}
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                toggleExpanded(project.id);
              }}
              className="inline-flex size-5 shrink-0 items-center justify-center rounded-[4px] transition-[filter] duration-(--motion-fast) hover:brightness-110"
            >
              <MacFolder color={project.color || undefined} open={expanded} size={17} />
            </button>

            <Swap k={editing ? 'edit' : 'label'} className="flex min-w-0 flex-1 items-center">
              {editing ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') {
                      setDraft(project.name);
                      setEditing(false);
                    }
                  }}
                  className="h-6 min-w-0 flex-1 rounded-[4px] bg-surface px-1 text-ui text-primary shadow-[inset_0_0_0_1px_var(--accent)] outline-none"
                />
              ) : (
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
              )}
            </Swap>

            <div className="flex shrink-0 items-center gap-1.5">
              <span className="flex items-center gap-1 group-hover/project:hidden group-has-[[data-state=open]]/project:hidden">
                {waiting > 0 ? <StatusDot status="waiting" title={`${waiting} waiting for permission`} /> : null}
                {running > 0 ? <StatusDot status="running" title={`${running} running`} /> : null}
                {errored ? <StatusDot status="error" title={t('Error')} /> : null}
              </span>
              <span className="hidden items-center gap-0.5 group-hover/project:flex group-has-[[data-state=open]]/project:flex">
                <button
                  type="button"
                  aria-label={t('Project board')}
                  title={t('Project board — what the agents are working on')}
                  onClick={(e) => {
                    e.stopPropagation();
                    openProjectBoard(project.id);
                  }}
                  className="inline-flex size-6 items-center justify-center rounded-[5px] text-muted hover:bg-surface-active hover:text-primary"
                >
                  <Eye className="size-[14px]" />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={t('New in project')}
                      title={t('New session, terminal, note…')}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex size-6 items-center justify-center rounded-[5px] text-muted hover:bg-surface-active hover:text-primary data-[state=open]:bg-surface-active data-[state=open]:text-primary"
                    >
                      <Plus className="size-[14px]" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" sideOffset={4} className="min-w-[230px]">
                    <DropdownMenuLabel>{t('New in {name}', { name: project.name })}</DropdownMenuLabel>
                    <DropdownMenuItem icon={<Sparkles />} onSelect={() => newSession(project.id)}>
                      {t('Session (chat view)')}
                    </DropdownMenuItem>
                    <DropdownMenuItem icon={<ClaudeLogo />} onSelect={() => void openClaudeTerminal({ projectId: project.id })}>
                      {t('Claude Code here')}
                    </DropdownMenuItem>
                    {project.git?.isRepo ? (
                      <DropdownMenuItem icon={<GitBranch />} onSelect={() => void askBranch(project.id)}>
                        {t('New session in a worktree…')}
                      </DropdownMenuItem>
                    ) : null}
                    {project.git?.isRepo ? (
                      <DropdownMenuItem icon={<Swords />} onSelect={() => openArenaLauncher(project.id)}>
                        {t('Agent arena…')}
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem icon={<Users />} onSelect={() => openRoomLauncher(project.id)}>
                      {t('Multi-agent room…')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>{t('Terminal')}</DropdownMenuLabel>
                    {shells.length ? (
                      shellItems(DROPDOWN_KIT)
                    ) : (
                      <DropdownMenuItem icon={<Terminal />} onSelect={() => openTerminalPane({ projectId: project.id })}>
                        {t('Terminal here')}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem icon={<NotebookPen />} onSelect={() => newNote({ projectId: project.id })}>
                      {t('Note')}
                    </DropdownMenuItem>
                    <DropdownMenuItem icon={<LayoutDashboard />} onSelect={() => newBoard({ projectId: project.id })}>
                      {t('Board')}
                    </DropdownMenuItem>
                    <DropdownMenuItem icon={<Globe />} onSelect={() => openBrowser(undefined, 'pane', project.id)}>
                      {t('Browser here')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={t('Project menu')}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex size-6 items-center justify-center rounded-[5px] text-muted hover:bg-surface-active hover:text-primary data-[state=open]:bg-surface-active data-[state=open]:text-primary"
                    >
                      <MoreHorizontal className="size-[14px]" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" sideOffset={4}>
                    {menuItems(DROPDOWN_KIT)}
                  </DropdownMenuContent>
                </DropdownMenu>
              </span>
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-[220px]">{menuItems(CONTEXT_KIT)}</ContextMenuContent>
      </ContextMenu>
      </LivingItem>

      <LivingReveal open={expanded}>
        <LivingList role="group" className="flex flex-col gap-[3px] py-[3px] pl-3">
          {arenas.map((a) => (
            <LivingItem key={`arena:${a.id}`}>
              <ArenaRow arena={a} />
            </LivingItem>
          ))}
          {rooms.map((r) => (
            <LivingItem key={`room:${r.id}`}>
              <RoomRow room={r} agents={agentsOf(r)} />
            </LivingItem>
          ))}
          {sessions.map((s) => (
            <LivingItem key={`session:${s.id}`}>
              <SessionRow session={s} active={s.id === activeSessionId} />
            </LivingItem>
          ))}
          {terminals.map((t) => (
            <LivingItem key={`terminal:${t.id}`}>
              <TerminalRow tab={t} />
            </LivingItem>
          ))}
          {notes.map((n) => (
            <LivingItem key={`note:${n.id}`}>
              <NoteRow note={n} />
            </LivingItem>
          ))}
          {browsed && keep(browsed.title || browsed.url) ? (
            <LivingItem key="browser">
              <BrowserRow url={browsed.url} title={browsed.title} onOpen={() => openBrowser(browsed.url, 'pane', project.id)} onForget={() => forgetBrowsed(project.id)} />
            </LivingItem>
          ) : null}
        </LivingList>
      </LivingReveal>
    </Reorder.Item>
  );
});

/** The project's browser: where it was last, one click away; × forgets it. */
function BrowserRow({ url, title, onOpen, onForget }: { url: string; title?: string; onOpen: () => void; onForget: () => void }) {
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    /* keep raw */
  }
  return (
    <div className="group/browser flex h-(--row-height) items-center gap-2 rounded-lg pl-2.5 pr-2 text-ui text-secondary transition-colors duration-(--motion-fast) hover:bg-surface-hover hover:text-primary">
      <span className="inline-flex w-5 shrink-0 items-center justify-center">
        <img src={`https://www.google.com/s2/favicons?domain=${host}&sz=32`} alt="" width={14} height={14} className="rounded-[3px]" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
      </span>
      <button type="button" onClick={onOpen} title={url} className="min-w-0 flex-1 truncate text-left">
        {title || host}
        {title && title !== host ? <span className="ml-1.5 text-[11px] text-muted">{host}</span> : null}
      </button>
      <button type="button" aria-label={t('Forget')} onClick={onForget} className="hidden size-5 items-center justify-center rounded-[4px] text-muted hover:bg-surface-active hover:text-primary group-hover/browser:inline-flex">
        <X className="size-3" />
      </button>
    </div>
  );
}
