import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, Reorder } from 'motion/react';
import { useShallow } from 'zustand/react/shallow';
import { ChevronRight, FolderPlus, GitBranch, Globe, LayoutDashboard, NotebookPen, Plus, Search, Settings, SlidersHorizontal, Sparkles, Terminal, Users, X } from 'lucide-react';
import { useAgents, agentList } from '@/stores/agents';
import { AgentRow, SubagentRow } from '@/features/agents/rows';
import { useAgentEditor, useRoomLauncher, useSubagentEditor } from '@/features/agents/editor';
import { useCapabilities, NO_ASSETS, type AssetInfo } from '@/stores/capabilities';
import { cn } from '@/lib/cn';
import { isMac } from '@/lib/platform';
import { useUI } from '@/stores/ui';
import { useProjects } from '@/stores/projects';
import { useSessions } from '@/stores/sessions';
import { useTerminals } from '@/stores/terminals';
import { useNotes, sortedNotes, noteTitle } from '@/stores/notes';
import { useEnvironment } from '@/stores/environment';
import { useSettings } from '@/stores/settings';
import { Mascot } from '@/features/mascot/MascotView';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { Tooltip } from '@/components/ui/Tooltip';
import { LivingBox, LivingGroup, LivingItem, LivingList, LivingReveal } from '@/components/ui/Living';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { ProjectGroup } from '@/features/projects/ProjectGroup';
import { TerminalRow } from '@/features/terminal/TerminalRow';
import { NoteRow } from '@/features/notes/NoteRow';
import { ShellIcon } from '@/features/terminal/ShellIcon';
import { useWorkspaceActions } from '@/features/sessions/useWorkspaceActions';
import { ClaudeLogo, CodexLogo, GeminiLogo, OpenCodeLogo } from '@/features/agent/BrandIcon';
import { easings, springs } from '@/lib/motion';
import { SidebarControls } from './TitleBar';
import type { ShellInfo } from '@/types/workspace';
import { t } from '@/i18n';

const NO_SHELLS: ShellInfo[] = [];

/**
 * Sidebar — projects (with agent sessions), terminals and notes. Lives on the
 * window canvas like the reference: generous rows, quiet section headers.
 */
export function Sidebar() {
  const open = useUI((s) => s.sidebarOpen);
  const width = useUI((s) => s.sidebarWidth);
  const setWidth = useUI((s) => s.setSidebarWidth);
  const openSettings = useUI((s) => s.openSettings);
  const sections = useUI((s) => s.sidebarSections);
  const toggleSection = useUI((s) => s.toggleSection);
  const allProjects = useProjects((s) => s.projects);
  const reorder = useProjects((s) => s.reorderProjects);
  const filterOpen = useUI((s) => s.sidebarFilterOpen);
  const filter = useUI((s) => s.sidebarFilter);
  const needle = filter.trim().toLowerCase();
  const matches = useCallback((text: string) => !needle || text.toLowerCase().includes(needle), [needle]);
  // Projects stay listed while filtering when the project itself or anything inside it matches.
  const projects = needle ? allProjects.filter((p) => matches(p.name) || projectHasMatch(p.id, needle)) : allProjects;
  // Terminals and notes that belong to a project are listed inside it; only orphans live here.
  const terminals = useTerminals(useShallow((s) => s.tabs.filter((t) => (!t.projectId || !allProjects.some((p) => p.id === t.projectId)) && matches(t.title))));
  const notes = useNotes(useShallow((s) => sortedNotes(s.notes).filter((n) => (!n.projectId || !allProjects.some((p) => p.id === n.projectId)) && matches(noteTitle(n)))));
  const agents = useAgents(useShallow((s) => agentList(s.agents).filter((a) => matches(a.name))));
  // Claude Code's own subagents, for the active project (user + project + plugins).
  const activeProjectPath = useProjects((s) => s.projects.find((p) => p.id === useUI.getState().activeProjectId)?.path);
  const loadAssets = useCapabilities((s) => s.loadAssets);
  const subagents = useCapabilities(useShallow((s) => (s.assets[activeProjectPath ?? '']?.data ?? NO_ASSETS).agents.filter((a) => matches(a.name))));
  useEffect(() => {
    void loadAssets(activeProjectPath);
  }, [loadAssets, activeProjectPath]);
  const hasProjects = allProjects.length > 0;
  const mascotInSidebar = useSettings((s) => s.mascot.enabled && s.mascot.placement === 'sidebar');
  const { openProject, openTerminalPane, openClaudeTerminal, newNote } = useWorkspaceActions();

  const onReorder = useCallback(
    (next: typeof allProjects) => {
      const ids = allProjects.map((p) => p.id);
      const nextIds = next.map((p) => p.id);
      for (let i = 0; i < nextIds.length; i++) {
        if (ids[i] !== nextIds[i]) {
          reorder(ids.indexOf(nextIds[i]), i);
          break;
        }
      }
    },
    [allProjects, reorder],
  );

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          key="sidebar"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{
            width: { duration: 0.22, ease: easings.out },
            opacity: { duration: 0.14 },
          }}
          className="relative z-10 flex h-full shrink-0 flex-col overflow-hidden bg-canvas"
          aria-label={t('Workspace')}
        >
          <div className="flex h-full flex-col" style={{ width }}>
            {isMac ? (
              <div data-tauri-drag-region className="flex h-[52px] shrink-0 items-center pl-[78px] pr-2">
                <SidebarControls />
              </div>
            ) : (
              <div className="h-1 shrink-0" />
            )}

            {filterOpen ? <SidebarFilter /> : null}

            <ScrollArea className="flex-1 px-2 pb-2">
              <LivingGroup id="sidebar">
                {/* Projects */}
                <Section
                  title={t('Projects')}
                  open={sections.projects}
                  onToggle={() => toggleSection('projects')}
                  action={
                    <Tooltip content={t('Add project')} side="right">
                      <SectionAction label={t('Add project')} onClick={() => void openProject()}>
                        <Plus />
                      </SectionAction>
                    </Tooltip>
                  }
                >
                  {projects.length === 0 && needle ? (
                    <Empty>{t('No project matches “{q}”.', { q: filter.trim() })}</Empty>
                  ) : projects.length === 0 ? (
                    <Empty>
                      {t('No projects yet.')}{' '}
                      <button type="button" className="font-medium text-secondary hover:text-primary" onClick={() => void openProject()}>
                        {t('Add one')}
                      </button>
                      .
                    </Empty>
                  ) : (
                    <Reorder.Group axis="y" values={projects} onReorder={onReorder} className="flex flex-col gap-[3px]">
                      {projects.map((p) => (
                        <ProjectGroup key={p.id} project={p} />
                      ))}
                    </Reorder.Group>
                  )}
                </Section>

                {/* Agents */}
              <Section
                title={t('Agents')}
                open={sections.agents !== false}
                onToggle={() => toggleSection('agents')}
                action={
                  <span className="inline-flex items-center">
                    <Tooltip content={t('Multi-agent room…')} side="right">
                      <SectionAction label={t('Multi-agent room…')} onClick={() => useRoomLauncher.getState().open()}>
                        <Users />
                      </SectionAction>
                    </Tooltip>
                    <DropdownMenu>
                      <Tooltip content={t('New agent')} side="right">
                        <DropdownMenuTrigger asChild>
                          <button type="button" aria-label={t('New agent')} className="inline-flex size-5 items-center justify-center rounded-[5px] text-muted transition-colors hover:bg-surface-active hover:text-primary data-[state=open]:bg-surface-active data-[state=open]:text-primary [&>svg]:size-[13px]">
                            <Plus />
                          </button>
                        </DropdownMenuTrigger>
                      </Tooltip>
                      <DropdownMenuContent side="right" align="start" className="min-w-[240px]">
                        <DropdownMenuItem icon={<Plus />} onSelect={() => useAgentEditor.getState().open()}>
                          {t('New agent…')}
                        </DropdownMenuItem>
                        <DropdownMenuItem icon={<ClaudeLogo size={13} />} onSelect={() => useSubagentEditor.getState().open({ scope: activeProjectPath ? 'project' : 'user' })}>
                          {t('New Claude Code subagent…')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </span>
                }
              >
                {agents.length === 0 && needle ? (
                  <Empty>{t('No agent matches.')}</Empty>
                ) : agents.length === 0 ? (
                  <Empty>
                    {t('Personas on top of Claude Code, with their own instructions, skills and servers.')}{' '}
                    <button type="button" className="font-medium text-secondary hover:text-primary" onClick={() => useAgentEditor.getState().open()}>
                      {t('Create one')}
                    </button>
                    .
                  </Empty>
                ) : (
                  <LivingList className="flex flex-col gap-[3px]">
                    {agents.map((a) => (
                      <LivingItem key={a.id}>
                        <AgentRow agent={a} />
                      </LivingItem>
                    ))}
                  </LivingList>
                )}
                {subagents.length ? <SubagentList items={subagents} /> : null}
              </Section>

              {/* Terminals */}
                <Section title={t('Terminals')} open={sections.terminals} onToggle={() => toggleSection('terminals')} action={<NewTerminalMenu />}>
                  {terminals.length === 0 && needle ? (
                    <Empty>{t('No terminal matches.')}</Empty>
                  ) : terminals.length === 0 ? (
                    <Empty>
                      {hasProjects ? t('Project terminals live inside their project.') + ' ' : null}
                      <button type="button" className="font-medium text-secondary hover:text-primary" onClick={() => openTerminalPane({ projectId: null })}>
                        {hasProjects ? t('Open one here') : t('Open a terminal')}
                      </button>
                      .
                    </Empty>
                  ) : (
                    <LivingList className="flex flex-col gap-[3px]">
                      {terminals.map((t) => (
                        <LivingItem key={t.id}>
                          <TerminalRow tab={t} />
                        </LivingItem>
                      ))}
                    </LivingList>
                  )}
                </Section>

                {/* Notes */}
                <Section
                  title={t('Notes')}
                  open={sections.notes}
                  onToggle={() => toggleSection('notes')}
                  action={
                    <Tooltip content={t('New note')} shortcut="mod+shift+n" side="right">
                      <SectionAction label={t('New note')} onClick={() => newNote({ projectId: null })}>
                        <Plus />
                      </SectionAction>
                    </Tooltip>
                  }
                >
                  {notes.length === 0 && needle ? (
                    <Empty>{t('No note matches.')}</Empty>
                  ) : notes.length === 0 ? (
                    <Empty>
                      {hasProjects ? t('Project notes live inside their project.') + ' ' : null}
                      <button type="button" className="font-medium text-secondary hover:text-primary" onClick={() => newNote({ projectId: null })}>
                        {hasProjects ? t('Write one here') : t('Write a note')}
                      </button>
                      .
                    </Empty>
                  ) : (
                    <LivingList className="flex flex-col gap-[3px]">
                      {notes.map((n) => (
                        <LivingItem key={n.id}>
                          <NoteRow note={n} />
                        </LivingItem>
                      ))}
                    </LivingList>
                  )}
                </Section>
              </LivingGroup>
            </ScrollArea>

            {/* footer: [+]                       [⚙] */}
            <div className="flex shrink-0 items-center justify-between px-3 pb-3 pt-2">
              <CreateMenu onClaude={() => void openClaudeTerminal()} />
              {mascotInSidebar ? <Mascot size={40} className="mx-1" /> : null}
              <Tooltip content={t('Settings')} shortcut="mod+comma" side="top">
                <button
                  type="button"
                  aria-label={t('Settings')}
                  onClick={() => openSettings()}
                  className={cn('inline-flex size-9 items-center justify-center rounded-[10px] bg-surface-inset text-primary/80 press', 'hover:bg-surface-active')}
                >
                  <Settings className="size-[17px]" strokeWidth={1.75} />
                </button>
              </Tooltip>
            </div>
          </div>

          <ResizeHandle onResize={(dx) => setWidth(width + dx)} />
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */

/** True when a session, terminal or note inside the project matches the filter. */
function projectHasMatch(projectId: string, needle: string): boolean {
  const n = needle.toLowerCase();
  if (Object.values(useSessions.getState().sessions).some((x) => x.projectId === projectId && !x.archived && x.title.toLowerCase().includes(n))) return true;
  if (useTerminals.getState().tabs.some((t) => t.projectId === projectId && t.title.toLowerCase().includes(n))) return true;
  return Object.values(useNotes.getState().notes).some((x) => x.projectId === projectId && noteTitle(x).toLowerCase().includes(n));
}

/** Filter field (Ctrl+Shift+S) — narrows every section by title. */
function SidebarFilter() {
  const filter = useUI((s) => s.sidebarFilter);
  const setFilter = useUI((s) => s.setSidebarFilter);
  const setOpen = useUI((s) => s.setSidebarFilterOpen);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="px-3 pb-1.5 pt-1">
      <div className="flex h-8 items-center gap-2 rounded-lg bg-surface-inset px-2.5 transition-[background-color,box-shadow] duration-(--motion-fast) focus-within:bg-surface focus-within:shadow-[inset_0_0_0_1px_var(--border)]">
        <Search className="size-[13px] shrink-0 text-muted" />
        <input
          ref={ref}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t('Filter sidebar')}
          spellCheck={false}
          aria-label={t('Filter sidebar')}
          className="min-w-0 flex-1 bg-transparent text-ui text-primary outline-none placeholder:text-muted"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              setOpen(false);
            }
          }}
        />
        <button type="button" aria-label={t('Close filter')} onClick={() => setOpen(false)} className="inline-flex size-5 items-center justify-center rounded-[4px] text-muted hover:bg-surface-hover hover:text-primary">
          <X className="size-[12px]" />
        </button>
      </div>
    </div>
  );
}

function Section({ title, open, onToggle, action, children }: { title: string; open: boolean; onToggle: () => void; action?: ReactNode; children: ReactNode }) {
  return (
    <LivingBox className="mb-1">
      <LivingItem still className="group/section flex h-7 items-center gap-1 pl-1.5 pr-1">
        <button type="button" aria-expanded={open} onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-1 rounded-md text-left text-[11px] font-medium uppercase tracking-[0.06em] text-muted outline-none transition-colors hover:text-secondary focus-visible:text-secondary">
          <motion.span animate={{ rotate: open ? 90 : 0 }} transition={springs.snappy} className="inline-flex opacity-0 transition-opacity group-hover/section:opacity-100">
            <ChevronRight className="size-[11px]" strokeWidth={2.2} />
          </motion.span>
          <span className="-ml-3 group-hover/section:ml-0 transition-[margin] duration-(--motion-fast)">{title}</span>
        </button>
        <span className="opacity-0 transition-opacity duration-(--motion-fast) group-hover/section:opacity-100 focus-within:opacity-100">{action}</span>
      </LivingItem>
      <LivingReveal open={open}>{children}</LivingReveal>
    </LivingBox>
  );
}

/** Claude Code's subagents under the agents: a folded group (open by default when there are few), the plugins' behind their own count. */
function SubagentList({ items }: { items: AssetInfo[] }) {
  const own = items.filter((a) => a.source === 'user' || a.source === 'project');
  const plugins = items.filter((a) => a.source.startsWith('plugin:'));
  // Folded when there are many; the list arrives after the first paint, so the default follows the count until it is toggled.
  const [toggled, setToggled] = useState<boolean | null>(null);
  const open = toggled ?? own.length <= 6;
  const setOpen = (fn: (v: boolean) => boolean) => setToggled(fn(open));
  const [showPlugins, setShowPlugins] = useState(false);
  return (
    <LivingBox className="mt-2">
      <LivingItem still>
        <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="group/sub flex h-6 w-full items-center gap-1.5 rounded-md pl-2.5 pr-1 text-left text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted hover:text-secondary">
          <ClaudeLogo size={11} />
          <span className="min-w-0 flex-1 truncate">{t('Claude Code subagents')}</span>
          <span className="tabular">{items.length}</span>
          <motion.span animate={{ rotate: open ? 90 : 0 }} transition={springs.snappy} className="inline-flex">
            <ChevronRight className="size-[11px]" strokeWidth={2.2} />
          </motion.span>
        </button>
      </LivingItem>
      <LivingReveal open={open}>
        <LivingBox clip={false}>
          <LivingItem still>
            <LivingList className="flex flex-col gap-[3px]">
              {own.map((a) => (
                <LivingItem key={a.path} still>
                  <SubagentRow info={a} />
                </LivingItem>
              ))}
            </LivingList>
            {plugins.length ? (
              <button type="button" aria-expanded={showPlugins} onClick={() => setShowPlugins((v) => !v)} className="flex h-(--row-height) w-full items-center gap-2 rounded-lg pl-2.5 pr-2 text-left text-[12px] text-muted transition-colors duration-(--motion-fast) hover:bg-surface-hover hover:text-primary">
                <span className="inline-flex w-5 shrink-0 items-center justify-center">
                  <motion.span animate={{ rotate: showPlugins ? 90 : 0 }} transition={springs.snappy} className="inline-flex">
                    <ChevronRight className="size-[11px]" strokeWidth={2.2} />
                  </motion.span>
                </span>
                {t('{n} from plugins', { n: plugins.length })}
              </button>
            ) : null}
          </LivingItem>
          <LivingReveal open={showPlugins}>
            <LivingList className="flex flex-col gap-[3px] pl-3">
              {plugins.map((a) => (
                <LivingItem key={a.path} still>
                  <SubagentRow info={a} />
                </LivingItem>
              ))}
            </LivingList>
          </LivingReveal>
        </LivingBox>
      </LivingReveal>
    </LivingBox>
  );
}

function SectionAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="inline-flex size-5 items-center justify-center rounded-[5px] text-muted transition-colors hover:bg-surface-active hover:text-primary [&>svg]:size-[13px]">
      {children}
    </button>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="px-3 py-1.5 text-[12.5px] text-muted">{children}</div>;
}

function NewTerminalMenu() {
  const shells = useEnvironment((s) => s.report?.shells ?? NO_SHELLS);
  const { openTerminalPane } = useWorkspaceActions();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={t('New terminal')} className="inline-flex size-5 items-center justify-center rounded-[5px] text-muted transition-colors hover:bg-surface-active hover:text-primary data-[state=open]:bg-surface-active data-[state=open]:text-primary [&>svg]:size-[13px]">
          <Plus />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="right" sideOffset={6}>
        <DropdownMenuLabel>{t('New terminal')}</DropdownMenuLabel>
        {shells.map((sh) => (
          <DropdownMenuItem key={sh.id} icon={<ShellIcon shellId={sh.id} />} onSelect={() => openTerminalPane({ shellId: sh.id, projectId: null })}>
            {sh.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The "+" button: everything you can create. */
function CreateMenu({ onClaude }: { onClaude: () => void }) {
  const shells = useEnvironment((s) => s.report?.shells ?? NO_SHELLS);
  const projects = useProjects((s) => s.projects);
  const setCloneOpen = useUI((s) => s.setCloneOpen);
  const { openTerminalPane, openProject, newNote, newBoard, newSession, openBrowser, openClaudeTerminal, openAgentTerminal, currentProject } = useWorkspaceActions();
  const project = currentProject();
  const codex = useEnvironment((s) => s.report?.codex?.found ?? false);
  const gemini = useEnvironment((s) => s.report?.gemini?.found ?? false);
  const opencode = useEnvironment((s) => s.report?.opencode?.found ?? false);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('New')}
          className={cn('group/new inline-flex size-9 items-center justify-center rounded-[10px] bg-surface-inset text-primary/80 press', 'hover:bg-surface-active data-[state=open]:bg-surface-active')}
        >
          {/* the + turns into an × while the menu is open */}
          <Plus className="size-[18px] transition-transform duration-(--motion-normal) ease-(--ease-spring-out) group-data-[state=open]/new:rotate-45" strokeWidth={1.75} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" sideOffset={8} className="min-w-[230px]">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger icon={<Terminal />}>{t('New terminal')}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {shells.length === 0 ? <DropdownMenuItem disabled>{t('Detecting shells…')}</DropdownMenuItem> : null}
            {shells.map((sh) => (
              <DropdownMenuItem key={sh.id} icon={<ShellIcon shellId={sh.id} />} onSelect={() => openTerminalPane({ shellId: sh.id })}>
                {sh.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger icon={<ClaudeLogo />}>{t('Claude Code')}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {project ? (
              <DropdownMenuItem icon={<ClaudeLogo />} onSelect={() => void openClaudeTerminal({ projectId: project.id })}>
                {t('In {name}', { name: project.name })}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem icon={<FolderPlus />} onSelect={onClaude}>
              {t('In folder…')}
            </DropdownMenuItem>
            <DropdownMenuItem icon={<SlidersHorizontal />} onSelect={() => void openClaudeTerminal({ projectId: project?.id, ask: true })}>
              {t('With arguments…')}
            </DropdownMenuItem>
            {projects.length > 1 ? <DropdownMenuSeparator /> : null}
            {projects
              .filter((p) => p.id !== project?.id)
              .slice(0, 8)
              .map((p) => (
                <DropdownMenuItem key={p.id} icon={<Terminal />} onSelect={() => void openClaudeTerminal({ projectId: p.id })}>
                  {p.name}
                </DropdownMenuItem>
              ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem icon={<Sparkles />} shortcut="mod+n" onSelect={() => newSession()}>
              {t('Structured session (chat view)')}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem icon={<CodexLogo />} disabled={!codex} onSelect={() => void openAgentTerminal('codex', { projectId: project?.id })}>
          {project ? t('{agent} in {name}', { agent: 'Codex', name: project.name }) : 'Codex'}
          {!codex ? <span className="ml-auto pl-3 text-meta text-muted">{t('not installed')}</span> : null}
        </DropdownMenuItem>
        <DropdownMenuItem icon={<GeminiLogo />} disabled={!gemini} onSelect={() => void openAgentTerminal('gemini', { projectId: project?.id })}>
          {project
            ? t('{agent} in {name}', {
                agent: 'Gemini CLI',
                name: project.name,
              })
            : 'Gemini CLI'}
          {!gemini ? <span className="ml-auto pl-3 text-meta text-muted">{t('not installed')}</span> : null}
        </DropdownMenuItem>
        <DropdownMenuItem icon={<OpenCodeLogo />} disabled={!opencode} onSelect={() => void openAgentTerminal('opencode', { projectId: project?.id })}>
          {project ? t('{agent} in {name}', { agent: 'OpenCode', name: project.name }) : 'OpenCode'}
          {!opencode ? <span className="ml-auto pl-3 text-meta text-muted">{t('not installed')}</span> : null}
        </DropdownMenuItem>
        <DropdownMenuItem icon={<NotebookPen />} shortcut="mod+shift+n" onSelect={() => newNote()}>
          {t('New note')}
        </DropdownMenuItem>
        <DropdownMenuItem icon={<LayoutDashboard />} onSelect={() => newBoard()}>
          {t('New board')}
        </DropdownMenuItem>
        <DropdownMenuItem icon={<Globe />} onSelect={() => openBrowser()}>
          {t('Browser')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<FolderPlus />} shortcut="mod+o" onSelect={() => void openProject()}>
          {t('Add project…')}
        </DropdownMenuItem>
        <DropdownMenuItem icon={<GitBranch />} onSelect={() => setCloneOpen(true)}>
          {t('Clone repository…')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ResizeHandle({ onResize }: { onResize: (dx: number) => void }) {
  const [active, setActive] = useState(false);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t('Resize sidebar')}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') onResize(-16);
        if (e.key === 'ArrowRight') onResize(16);
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        setActive(true);
        let last = e.clientX;
        const move = (ev: PointerEvent) => {
          onResize(ev.clientX - last);
          last = ev.clientX;
        };
        const up = () => {
          setActive(false);
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }}
      className={cn(
        'absolute inset-y-0 right-0 z-20 w-[5px] cursor-col-resize outline-none',
        'after:absolute after:inset-y-2 after:right-[1px] after:w-px after:rounded-full after:bg-accent-warm after:opacity-0 after:transition-opacity after:duration-(--motion-normal) hover:after:opacity-100 focus-visible:after:opacity-100',
        active && 'after:opacity-100',
      )}
    />
  );
}
