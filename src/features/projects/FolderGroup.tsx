import { memo, useState, type ReactNode } from 'react';
import { Plus, Terminal, Pencil, X, MoreHorizontal, Sparkles, NotebookPen, LayoutDashboard, SlidersHorizontal, ExternalLink, FolderSymlink, Unlink } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Project, ProjectFolder } from '@/types/workspace';
import { useProjects } from '@/stores/projects';
import { useUI } from '@/stores/ui';
import { useEnvironment } from '@/stores/environment';
import { useSettings } from '@/stores/settings';
import { useShallow } from 'zustand/react/shallow';
import { LivingList, LivingReveal, Swap } from '@/components/ui/Living';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/ContextMenu';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { MacFolder } from '@/components/ui/MacFolder';
import { StatusDot } from '@/components/ui/StatusDot';
import { ShellIcon } from '@/features/terminal/ShellIcon';
import { ClaudeLogo } from '@/features/agent/BrandIcon';
import { useWorkspaceActions } from '@/features/sessions/useWorkspaceActions';
import { revealInFileManager } from '@/native/system';
import { isWindows } from '@/lib/platform';
import { FolderColourRow } from './FolderColourRow';
import { folderDropProps, locateItem } from './folder-items';
import { CONTEXT_KIT, DROPDOWN_KIT, type MenuKit } from './menu-kit';
import { t } from '@/i18n';

/** The folder's path as the project sees it (`apps\web`), for the hint beside the name. */
function relativePath(project: Project, path: string): string {
  const root = project.path.replace(/[\\/]+$/, '');
  return path.toLowerCase().startsWith(root.toLowerCase()) ? path.slice(root.length).replace(/^[\\/]+/, '') : path;
}

/**
 * A sub-folder inside a project in the sidebar — the project row's little
 * sibling: the same folder glyph one size down, the same + and ⋯ on hover.
 * Rows dragged onto it are filed in it; what is created from it starts in
 * its folder on disk when it has one.
 */
export const FolderGroup = memo(function FolderGroup({ project, folder, children, count, running, waiting, errored }: { project: Project; folder: ProjectFolder; children: ReactNode; count: number; running: number; waiting: number; errored: boolean }) {
  const toggleFolder = useProjects((s) => s.toggleFolder);
  const updateFolder = useProjects((s) => s.updateFolder);
  const setActiveProject = useUI((s) => s.setActiveProject);
  const shells = useEnvironment(useShallow((s) => s.report?.shells ?? []));
  const preferredShell = useSettings((s) => s.terminal.shellId);
  const defaultShellId = preferredShell ?? shells[0]?.id;
  const { newSession, openTerminalPane, openClaudeTerminal, newNote, newBoard, removeFolder, moveToFolder, pickProjectSubfolder } = useWorkspaceActions();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(folder.name);
  const [over, setOver] = useState(false);

  const expanded = folder.expanded;
  const linked = folder.path;
  const hint = linked ? relativePath(project, linked) : '';
  const showHint = !!hint && hint.toLowerCase() !== folder.name.toLowerCase();

  const commitRename = () => {
    setEditing(false);
    const v = draft.trim();
    if (v && v !== folder.name) updateFolder(project.id, folder.id, { name: v });
    else setDraft(folder.name);
  };

  const link = async () => {
    const path = await pickProjectSubfolder(project);
    if (path) updateFolder(project.id, folder.id, { path });
  };

  const drop = folderDropProps(
    (item) => {
      const at = locateItem(item);
      return !!at && at.projectId === project.id && at.folderId !== folder.id;
    },
    (item) => moveToFolder(item, folder.id),
    setOver,
  );

  /** One entry per detected shell (the default first, marked), each opening a terminal in this folder. */
  const shellItems = () =>
    [...shells].sort((a, b) => (a.id === defaultShellId ? -1 : b.id === defaultShellId ? 1 : 0)).map((sh) => (
      <DropdownMenuItem key={sh.id} icon={<ShellIcon shellId={sh.id} />} onSelect={() => openTerminalPane({ projectId: project.id, folderId: folder.id, shellId: sh.id })}>
        {sh.label}
        {sh.id === defaultShellId ? <span className="ml-auto pl-3 text-[11px] text-muted">{t('default')}</span> : null}
      </DropdownMenuItem>
    ));

  /** The folder's menu: New ▸, then the folder itself, then its colour. Same items in the ⋯ and the right-click. */
  const menuItems = (M: MenuKit) => (
    <>
      <M.Sub>
        <M.SubTrigger icon={<Plus />}>{t('New')}</M.SubTrigger>
        <M.SubContent>
          <M.Item icon={<Terminal />} onSelect={() => openTerminalPane({ projectId: project.id, folderId: folder.id })}>
            {t('Terminal here')}
          </M.Item>
          <M.Item icon={<ClaudeLogo />} onSelect={() => void openClaudeTerminal({ projectId: project.id, folderId: folder.id })}>
            {t('Claude Code here')}
          </M.Item>
          <M.Item icon={<SlidersHorizontal />} onSelect={() => void openClaudeTerminal({ projectId: project.id, folderId: folder.id, ask: true })}>
            {t('Claude Code with arguments…')}
          </M.Item>
          <M.Item icon={<Sparkles />} onSelect={() => newSession(project.id, { folderId: folder.id })}>
            {t('Session (chat view)')}
          </M.Item>
          <M.Sep />
          <M.Item icon={<NotebookPen />} onSelect={() => newNote({ projectId: project.id, folderId: folder.id })}>
            {t('Note')}
          </M.Item>
          <M.Item icon={<LayoutDashboard />} onSelect={() => newBoard({ projectId: project.id, folderId: folder.id })}>
            {t('Board')}
          </M.Item>
        </M.SubContent>
      </M.Sub>
      <M.Sep />
      <M.Item
        icon={<Pencil />}
        onSelect={() => {
          setDraft(folder.name);
          setEditing(true);
        }}
      >
        {t('Rename')}
      </M.Item>
      <M.Item icon={<FolderSymlink />} onSelect={() => void link()}>
        {linked ? t('Change linked folder…') : t('Link to a folder on disk…')}
      </M.Item>
      {linked ? (
        <>
          <M.Item icon={<ExternalLink />} onSelect={() => void revealInFileManager(linked)}>
            {isWindows ? t('Reveal in Explorer') : t('Reveal in Finder')}
          </M.Item>
          <M.Item icon={<Unlink />} onSelect={() => updateFolder(project.id, folder.id, { path: undefined })}>
            {t('Unlink folder')}
          </M.Item>
        </>
      ) : null}
      <FolderColourRow value={folder.color} onChange={(color) => updateFolder(project.id, folder.id, { color })} noneLabel={t('Same as the project')} />
      <M.Sep />
      <M.Item icon={<X />} danger onSelect={() => removeFolder(project.id, folder.id)}>
        {t('Remove folder')}
      </M.Item>
    </>
  );

  return (
    <div className="relative">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            role="treeitem"
            aria-expanded={expanded}
            tabIndex={0}
            title={linked}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('button, input')) return;
              setActiveProject(project.id);
              toggleFolder(project.id, folder.id);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') toggleFolder(project.id, folder.id);
              if (e.key === 'ArrowRight') toggleFolder(project.id, folder.id, true);
              if (e.key === 'ArrowLeft') toggleFolder(project.id, folder.id, false);
              if (e.key === 'F2') {
                setDraft(folder.name);
                setEditing(true);
              }
            }}
            {...drop}
            className={cn(
              'group/folder flex h-(--row-height) select-none items-center gap-2.5 rounded-lg pl-2.5 pr-2 text-ui text-primary outline-none transition-colors duration-(--motion-fast)',
              'hover:bg-surface-hover focus-visible:bg-surface-hover',
              over && 'bg-accent-soft shadow-[inset_0_0_0_1px_var(--accent)]',
            )}
          >
            <button
              type="button"
              aria-label={expanded ? t('Collapse') : t('Expand')}
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                toggleFolder(project.id, folder.id);
              }}
              className="inline-flex size-5 shrink-0 items-center justify-center rounded-[4px] transition-[filter] duration-(--motion-fast) hover:brightness-110"
            >
              <MacFolder color={folder.color || project.color || undefined} open={expanded || over} size={15} />
            </button>

            <Swap k={editing ? 'edit' : 'label'} className="flex min-w-0 flex-1 items-center gap-2">
              {editing ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') {
                      setDraft(folder.name);
                      setEditing(false);
                    }
                  }}
                  className="h-6 min-w-0 flex-1 rounded-[4px] bg-surface px-1 text-ui text-primary shadow-[inset_0_0_0_1px_var(--accent)] outline-none"
                />
              ) : (
                <>
                  <span className="min-w-0 truncate">{folder.name}</span>
                  {showHint ? <span className="min-w-0 truncate text-[11px] text-muted group-hover/folder:hidden group-has-[[data-state=open]]/folder:hidden">{hint}</span> : null}
                </>
              )}
            </Swap>

            <div className="flex shrink-0 items-center gap-1.5">
              <span className="flex items-center gap-1 group-hover/folder:hidden group-has-[[data-state=open]]/folder:hidden">
                {waiting > 0 ? <StatusDot status="waiting" title={`${waiting} waiting for permission`} /> : null}
                {running > 0 ? <StatusDot status="running" title={`${running} running`} /> : null}
                {errored ? <StatusDot status="error" title={t('Error')} /> : null}
              </span>
              <span className="hidden items-center gap-0.5 group-hover/folder:flex group-has-[[data-state=open]]/folder:flex">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={t('New in folder')}
                      title={t('New session, terminal, note…')}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex size-6 items-center justify-center rounded-[5px] text-muted hover:bg-surface-active hover:text-primary data-[state=open]:bg-surface-active data-[state=open]:text-primary"
                    >
                      <Plus className="size-[14px]" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" sideOffset={4} className="min-w-[230px]">
                    <DropdownMenuLabel>{t('New in {name}', { name: folder.name })}</DropdownMenuLabel>
                    <DropdownMenuItem icon={<Sparkles />} onSelect={() => newSession(project.id, { folderId: folder.id })}>
                      {t('Session (chat view)')}
                    </DropdownMenuItem>
                    <DropdownMenuItem icon={<ClaudeLogo />} onSelect={() => void openClaudeTerminal({ projectId: project.id, folderId: folder.id })}>
                      {t('Claude Code here')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>{t('Terminal')}</DropdownMenuLabel>
                    {shells.length ? (
                      shellItems()
                    ) : (
                      <DropdownMenuItem icon={<Terminal />} onSelect={() => openTerminalPane({ projectId: project.id, folderId: folder.id })}>
                        {t('Terminal here')}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem icon={<NotebookPen />} onSelect={() => newNote({ projectId: project.id, folderId: folder.id })}>
                      {t('Note')}
                    </DropdownMenuItem>
                    <DropdownMenuItem icon={<LayoutDashboard />} onSelect={() => newBoard({ projectId: project.id, folderId: folder.id })}>
                      {t('Board')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={t('Folder menu')}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex size-6 items-center justify-center rounded-[5px] text-muted hover:bg-surface-active hover:text-primary data-[state=open]:bg-surface-active data-[state=open]:text-primary"
                    >
                      <MoreHorizontal className="size-[14px]" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" sideOffset={4} className="min-w-[220px]">
                    {menuItems(DROPDOWN_KIT)}
                  </DropdownMenuContent>
                </DropdownMenu>
              </span>
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-[220px]">{menuItems(CONTEXT_KIT)}</ContextMenuContent>
      </ContextMenu>

      <LivingReveal open={expanded}>
        {count > 0 ? (
          <LivingList role="group" className="flex flex-col gap-[3px] py-[3px] pl-3">
            {children}
          </LivingList>
        ) : (
          <div className="py-1.5 pl-3 pr-2 text-center text-[12px] text-muted">{t('Empty — drop items here, or press + to start one.')}</div>
        )}
      </LivingReveal>
    </div>
  );
});
