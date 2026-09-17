import { memo, useState, type ReactNode } from 'react';
import { Users, X, SplitSquareHorizontal, SplitSquareVertical, Terminal as TerminalIcon, FileDiff, Search, MoreHorizontal, Plus, FolderOpen, Settings, Keyboard, Info, FolderTree, GitBranch, Pencil, Copy, StopCircle, FileText, Globe, NotebookPen, Maximize2, Minimize2, Swords } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { springs } from '@/lib/motion';
import { useUI, collectLeaves } from '@/stores/ui';
import { useSettings } from '@/stores/settings';
import { sessionTitle, useSessions } from '@/stores/sessions';
import { useTerminals } from '@/stores/terminals';
import { useProjects } from '@/stores/projects';
import type { PaneLeaf, PaneNode } from '@/types/workspace';
import { SplitPane } from './SplitPane';
import { SessionView } from '@/features/agent/SessionView';
import { TerminalView } from '@/features/terminal/TerminalView';
import { useTerminalFind } from '@/features/terminal/find-store';
import { DiffPane } from '@/features/files/DiffPane';
import { GitPaneView } from '@/features/git/GitPaneView';
import { ReviewPane } from '@/features/review/ReviewPane';
import { ArenaPane } from '@/features/arena/ArenaPane';
import { useArena } from '@/stores/arena';
import { useAgents } from '@/stores/agents';
import { RoomPane } from '@/features/agents/RoomPane';
import { PluginPane } from '@/features/plugins/PluginPane';
import { pluginPaneTitle } from '@/features/plugins/runtime';
import { InstalledPluginIcon } from '@/features/plugins/PluginIcon';
import { ChangesButton } from '@/features/review/ChangesButton';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { HomeScreen } from '@/features/projects/HomeScreen';
import { NotePane } from '@/features/notes/NotePane';
import { FilePane } from '@/features/files/FilePane';
import { BrowserPane } from '@/features/browser/BrowserPane';
import { useNotes } from '@/stores/notes';
import { basename } from '@/lib/format';
import { uid } from '@/lib/id';
import { IconButton } from '@/components/ui/IconButton';
import { Grip } from '@/components/ui/Grip';
import { AgentGlyph } from '@/features/agent/AgentGlyph';
import { LoadingState } from '@/components/ui/LoadingState';
import { useTerminalActivity } from '@/features/terminal/activity';
import { TerminalPanel } from '@/features/terminal/TerminalPanel';
import { Explorer } from '@/features/files/Explorer';
import { useWorkspaceActions } from '@/features/sessions/useWorkspaceActions';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { runtime } from '@/providers/runtime';
import { RenameDialog } from '@/features/sessions/RenameDialog';
import { PANE_DRAG_MIME, dropOnPane, usePaneDrag, zoneAt, type DropZone } from '@/features/sessions/pane-drag';
import { MascotCorner } from '@/features/mascot/MascotView';
import { t } from '@/i18n';

/**
 * Workspace — the white card floating on the canvas. It hosts the pane tree
 * (sessions, terminals, diffs), the optional explorer and the terminal drawer.
 */
export function Workspace() {
  const layout = useUI((s) => s.layout);
  const terminalPanelOpen = useUI((s) => s.terminalPanelOpen);
  const terminalPanelHeight = useUI((s) => s.terminalPanelHeight);
  const setTerminalPanelHeight = useUI((s) => s.setTerminalPanelHeight);
  const explorerOpen = useUI((s) => s.explorerOpen);
  const zoomedPaneId = useUI((s) => s.zoomedPaneId);
  // One pane can take the whole workspace; the others keep their state and come back on restore.
  const zoomed = zoomedPaneId ? collectLeaves(layout).find((l) => l.id === zoomedPaneId) : undefined;

  const panes = zoomed ? <Pane leaf={zoomed} /> : <PaneTree node={layout} />;

  return (
    <main className="flex min-h-0 min-w-0 flex-1 pb-(--card-gap) pr-(--card-gap)">
      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-[10px] bg-background shadow-card">
        {explorerOpen ? <Explorer /> : null}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {terminalPanelOpen ? (
            <SplitPane
              direction="vertical"
              ratio={1 - Math.min(0.8, terminalPanelHeight / Math.max(400, window.innerHeight - 64))}
              onRatioChange={(r) => setTerminalPanelHeight((1 - r) * Math.max(400, window.innerHeight - 64))}
              first={panes}
              second={<TerminalPanel />}
            />
          ) : (
            panes
          )}
        </div>
        <MascotCorner />
      </div>
    </main>
  );
}

function PaneTree({ node }: { node: PaneNode }) {
  const setSplitRatio = useUI((s) => s.setSplitRatio);
  if (node.type === 'leaf') return <Pane leaf={node} />;
  return (
    <SplitPane
      direction={node.direction}
      ratio={node.ratio}
      onRatioChange={(r) => setSplitRatio(node.id, r)}
      first={<PaneTree node={node.children[0]} />}
      second={<PaneTree node={node.children[1]} />}
    />
  );
}

const Pane = memo(function Pane({ leaf }: { leaf: PaneLeaf }) {
  const activePaneId = useUI((s) => s.activePaneId);
  const language = useSettings((s) => s.language);
  const setActivePane = useUI((s) => s.setActivePane);
  const closePane = useUI((s) => s.closePane);
  const active = leaf.id === activePaneId;

  let body: ReactNode;
  switch (leaf.content.kind) {
    case 'session':
      body = <SessionView sessionId={leaf.content.sessionId} focused={active} />;
      break;
    case 'terminal':
      body = <TerminalView terminalId={leaf.content.terminalId} focused={active} onExit={() => closePane(leaf.id)} />;
      break;
    case 'note':
      body = <NotePane noteId={leaf.content.noteId} focused={active} />;
      break;
    case 'file':
      body = <FilePane key={leaf.content.path} path={leaf.content.path} projectId={leaf.content.projectId} line={leaf.content.line} focused={active} />;
      break;
    case 'browser':
      body = <BrowserPane browserId={leaf.content.browserId} url={leaf.content.url} projectId={leaf.content.projectId} focused={active} />;
      break;
    case 'diff':
      body = <DiffPane path={leaf.content.path} sessionId={leaf.content.sessionId} root={leaf.content.root} />;
      break;
    case 'git':
      body = <GitPaneView projectId={leaf.content.projectId} />;
      break;
    case 'review':
      body = <ReviewPane sessionId={leaf.content.sessionId} />;
      break;
    case 'arena':
      body = <ArenaPane arenaId={leaf.content.arenaId} />;
      break;
    case 'room':
      body = <RoomPane roomId={leaf.content.roomId} />;
      break;
    case 'plugin':
      body = <PluginPane pluginId={leaf.content.pluginId} paneId={leaf.content.paneId} />;
      break;
    default:
      body = <HomeScreen />;
  }

  return (
    <section
      aria-label={t('Pane')}
      data-active={active ? '' : undefined}
      onPointerDownCapture={() => {
        if (!active) setActivePane(leaf.id);
      }}
      onFocusCapture={() => {
        if (!active) setActivePane(leaf.id);
      }}
      className="relative flex h-full min-h-0 min-w-0 flex-col bg-background"
    >
      <PaneHeader key={language} leaf={leaf} active={active} />
      <div className="min-h-0 flex-1">
        <ErrorBoundary compact label={t('This pane')}>{body}</ErrorBoundary>
      </div>
      <PaneDropZones paneId={leaf.id} />
    </section>
  );
});

/**
 * While a sidebar item is being dragged, every pane shows where it would land:
 * an edge band splits the pane on that side, the middle replaces its content.
 */
function PaneDropZones({ paneId }: { paneId: string }) {
  const dragging = usePaneDrag((s) => s.content);
  const label = usePaneDrag((s) => s.label);
  const [zone, setZone] = useState<DropZone | null>(null);
  if (!dragging) return null;
  const box: Record<DropZone, string> = {
    left: 'inset-y-2 left-2 w-[calc(50%-12px)]',
    right: 'inset-y-2 right-2 w-[calc(50%-12px)]',
    top: 'inset-x-2 top-2 h-[calc(50%-12px)]',
    bottom: 'inset-x-2 bottom-2 h-[calc(50%-12px)]',
    center: 'inset-2',
  };
  return (
    <div
      className="absolute inset-0 z-20 bg-background/60"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(PANE_DRAG_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const next = zoneAt(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY);
        if (next !== zone) setZone(next);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setZone(null);
      }}
      onDrop={(e) => {
        e.preventDefault();
        const raw = e.dataTransfer.getData(PANE_DRAG_MIME);
        const content = raw ? (JSON.parse(raw) as typeof dragging) : dragging;
        const z = zoneAt(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY);
        setZone(null);
        usePaneDrag.getState().end();
        if (content) dropOnPane(paneId, z, content);
      }}
    >
      {zone ? (
        <div className={cn('pointer-events-none absolute rounded-lg bg-accent-soft shadow-[inset_0_0_0_1.5px_var(--accent)] transition-[inset,width,height] duration-(--motion-fast) ease-(--ease-out)', box[zone])}>
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md bg-surface-raised px-2 py-1 text-[12px] font-medium text-primary shadow-popover">
            {zone === 'center' ? `Open ${label} here` : `Split ${zone} · ${label}`}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** ⁝⁝ Title                                   [split] [search] [⋯] [×] */
function PaneHeader({ leaf, active }: { leaf: PaneLeaf; active: boolean }) {
  const content = leaf.content;
  const sessionId = content.kind === 'session' ? content.sessionId : null;
  const terminalId = content.kind === 'terminal' ? content.terminalId : null;
  const session = useSessions((s) => (sessionId ? s.sessions[sessionId] : undefined));
  const updateSession = useSessions((s) => s.updateSession);
  const duplicate = useSessions((s) => s.duplicateSession);
  const terminal = useTerminals((s) => (terminalId ? s.tabs.find((t) => t.id === terminalId) : undefined));
  const noteId = content.kind === 'note' ? content.noteId : null;
  const note = useNotes((s) => (noteId ? s.notes[noteId] : undefined));
  const projectId = session?.projectId ?? terminal?.projectId ?? note?.projectId;
  const project = useProjects((s) => s.projects.find((p) => p.id === projectId));
  const leafCount = useUI((s) => collectLeaves(s.layout).length);
  const setSearchOpen = useUI((s) => s.setSearchOpen);
  const openSettings = useUI((s) => s.openSettings);
  const toggleExplorer = useUI((s) => s.toggleExplorer);
  const toggleGitPanel = useUI((s) => s.toggleGitPanel);
  const toggleTerminalPanel = useUI((s) => s.toggleTerminalPanel);
  const setAboutOpen = useUI((s) => s.setAboutOpen);
  const splitPane = useUI((s) => s.splitPane);
  const closePane = useUI((s) => s.closePane);
  const toggleZoom = useUI((s) => s.toggleZoom);
  const zoomed = useUI((s) => s.zoomedPaneId === leaf.id);
  const setPaneContent = useUI((s) => s.setPaneContent);
  const { newSession, openProject, openTerminal, deleteSession } = useWorkspaceActions();
  const [renaming, setRenaming] = useState(false);

  const title =
    content.kind === 'session'
      ? (session ? sessionTitle(session.title) : 'Session')
      : content.kind === 'terminal'
        ? `${terminal?.title ?? 'Terminal'}${project ? ` · ${project.name}` : ''}`
        : content.kind === 'note'
          ? (note?.title ?? 'Note')
          : content.kind === 'file'
            ? basename(content.path)
            : content.kind === 'browser'
              ? t('Browser')
              : content.kind === 'diff'
                ? content.path
                : content.kind === 'git'
                  ? `Git · ${useProjects.getState().projects.find((p) => p.id === content.projectId)?.name ?? ''}`
                  : content.kind === 'review'
                    ? `${t('Review')} · ${useSessions.getState().sessions[content.sessionId]?.title ?? ''}`
                    : content.kind === 'arena'
                      ? `${t('Arena')} · ${useArena.getState().arenas[content.arenaId]?.title ?? ''}`
                      : content.kind === 'room'
                        ? `${t('Room')} · ${useAgents.getState().rooms[content.roomId]?.name ?? ''}`
                        : content.kind === 'plugin'
                          ? pluginPaneTitle(content.pluginId, content.paneId)
                          : (project?.name ?? 'Zpace');
  const busy = session?.status === 'running' || session?.status === 'waiting';
  const terminalBusySince = useTerminalActivity((s) => (terminalId ? s.busy[terminalId] : undefined));

  // Split opens a fresh sibling of the same kind (new terminal, new note, new browser tab);
  // sessions and files are shown twice, which is what you want for reading alongside.
  const split = (d: 'horizontal' | 'vertical') => {
    if (content.kind === 'terminal') return openTerminal({ split: d, projectId: terminal?.projectId ?? null });
    if (content.kind === 'note') {
      const fresh = useNotes.getState().createNote({ projectId: note?.projectId });
      return splitPane(leaf.id, d, { kind: 'note', noteId: fresh.id });
    }
    if (content.kind === 'browser') return splitPane(leaf.id, d, { kind: 'browser', browserId: uid('web'), url: content.url });
    splitPane(leaf.id, d, content);
  };
  const close = () => {
    if (leafCount > 1) closePane(leaf.id);
    else setPaneContent(leaf.id, { kind: 'empty' });
  };

  return (
    <div
      data-tauri-drag-region
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('button, input')) return;
        toggleZoom(leaf.id);
      }}
      className={cn('flex h-[42px] shrink-0 select-none items-center gap-2 pl-4 pr-2 hairline-b', active ? 'text-primary' : 'text-secondary')}
    >
      {content.kind === 'terminal' ? (
        <TerminalIcon className="size-[14px] shrink-0 text-muted" />
      ) : content.kind === 'diff' ? (
        <FileDiff className="size-[14px] shrink-0 text-muted" />
      ) : content.kind === 'git' ? (
        <GitBranch className="size-[14px] shrink-0 text-muted" />
      ) : content.kind === 'review' ? (
        <FileDiff className="size-[14px] shrink-0 text-accent" />
      ) : content.kind === 'arena' ? (
        <Swords className="size-[14px] shrink-0 text-accent" />
      ) : content.kind === 'room' ? (
        <Users className="size-[14px] shrink-0 text-accent" />
      ) : content.kind === 'plugin' ? (
        <InstalledPluginIcon pluginId={content.pluginId} />
      ) : content.kind === 'file' ? (
        <FileText className="size-[14px] shrink-0 text-muted" />
      ) : content.kind === 'browser' ? (
        <Globe className="size-[14px] shrink-0 text-muted" />
      ) : content.kind === 'note' ? (
        <NotebookPen className="size-[14px] shrink-0 text-muted" />
      ) : (
        <Grip className={cn(!active && 'opacity-60')} />
      )}
      <span data-tauri-drag-region className="min-w-0 flex-1 truncate text-ui font-medium tracking-[-0.005em]">
        {title}
      </span>
      {busy ? (
        <span className="mr-1 inline-flex items-center gap-1.5 text-[12px] text-accent-warm">
          <AgentGlyph active className="size-[12px]" />
        </span>
      ) : null}
      <AnimatePresence>
        {terminalBusySince ? (
          <motion.span key="term-busy" initial={{ opacity: 0, x: 4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 4 }} transition={springs.snappy} className="mr-1 inline-flex items-center">
            <LoadingState label={t('Running')} since={terminalBusySince} />
          </motion.span>
        ) : null}
      </AnimatePresence>
      <div className="flex items-center gap-0.5 no-drag">
        {session ? <ChangesButton sessionId={session.id} /> : null}
        <IconButton label={zoomed ? t('Restore layout') : t('Maximize pane')} shortcut="mod+shift+enter" size="md" onClick={() => toggleZoom(leaf.id)} active={zoomed}>
          {zoomed ? <Minimize2 /> : <Maximize2 />}
        </IconButton>
        <IconButton label={t('Split right')} size="md" onClick={() => split('horizontal')}>
          <SplitSquareHorizontal />
        </IconButton>
        {content.kind === 'terminal' ? (
          <IconButton label={t('Find in terminal')} shortcut="mod+f" size="md" onClick={() => useTerminalFind.getState().open(content.terminalId)}>
            <Search />
          </IconButton>
        ) : content.kind === 'file' ? (
          <IconButton label={t('Find in file')} shortcut="mod+f" size="md" onClick={() => window.dispatchEvent(new CustomEvent('conduit:file-find', { detail: { path: content.path } }))}>
            <Search />
          </IconButton>
        ) : (
          <IconButton label={t('Search')} shortcut="mod+shift+f" size="md" onClick={() => setSearchOpen(true)}>
            <Search />
          </IconButton>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton label={t('More')} tooltip={false} size="md">
              <MoreHorizontal />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={4} className="min-w-[300px]">
            {session ? (
              <>
                <DropdownMenuItem icon={<Pencil />} onSelect={() => setRenaming(true)}>
                  {t('Rename session')}
                </DropdownMenuItem>
                <DropdownMenuItem icon={<Copy />} onSelect={() => duplicate(session.id)}>
                  {t('Duplicate session')}
                </DropdownMenuItem>
                {busy ? (
                  <DropdownMenuItem icon={<StopCircle />} onSelect={() => void runtime.cancel(session.id)}>
                    {t('Stop agent')}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuItem icon={<Plus />} shortcut="mod+n" onSelect={() => newSession()}>
              {t('New session')}
            </DropdownMenuItem>
            <DropdownMenuItem icon={<FolderOpen />} shortcut="mod+o" onSelect={() => void openProject()}>
              {t('Open project…')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem icon={<SplitSquareHorizontal />} onSelect={() => split('horizontal')}>
              {t('Split right')}
            </DropdownMenuItem>
            <DropdownMenuItem icon={<SplitSquareVertical />} onSelect={() => split('vertical')}>
              {t('Split down')}
            </DropdownMenuItem>
            <DropdownMenuItem icon={<TerminalIcon />} shortcut="mod+`" onSelect={toggleTerminalPanel}>
              {t('Toggle terminal')}
            </DropdownMenuItem>
            <DropdownMenuItem icon={<FolderTree />} shortcut="mod+shift+e" onSelect={toggleExplorer}>
              {t('Toggle explorer')}
            </DropdownMenuItem>
            <DropdownMenuItem icon={<GitBranch />} shortcut="mod+shift+g" onSelect={toggleGitPanel}>
              {t('Git panel')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem icon={<Keyboard />} onSelect={() => openSettings('keyboard')}>
              {t('Keyboard shortcuts')}
            </DropdownMenuItem>
            <DropdownMenuItem icon={<Settings />} shortcut="mod+comma" onSelect={() => openSettings()}>
              {t('Settings')}
            </DropdownMenuItem>
            <DropdownMenuItem icon={<Info />} onSelect={() => setAboutOpen(true)}>
              {t('About Zpace')}
            </DropdownMenuItem>
            {session ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem icon={<X />} danger onSelect={() => deleteSession(session.id)}>
                  {t('Delete session')}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
        <IconButton label={leafCount > 1 ? t('Close pane') : t('Close')} shortcut="mod+w" size="md" onClick={close}>
          <X />
        </IconButton>
      </div>
      {session ? (
        <RenameDialog open={renaming} onOpenChange={setRenaming} value={session.title} onSubmit={(t) => updateSession(session.id, { title: t })} />
      ) : null}
    </div>
  );
}

