import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ChevronRight, File, FolderOpen, RefreshCw, X, FileDiff, ExternalLink, Copy, SplitSquareHorizontal, Eraser, FilePlus, FolderPlus, Pencil, Trash2, ArrowDownAZ, ArrowDownWideNarrow, Plus } from 'lucide-react';
import { useExplorer, sortNodes, type Naming } from './explorer-store';
import { createFile, createDir, renamePath, trashPath } from '@/native/system';
import { dirname } from '@/lib/format';
import { AgentLogo } from '@/features/agent/BrandIcon';
import { AGENT_LABEL } from '@/features/agent/agents';
import { Tooltip } from '@/components/ui/Tooltip';
import { useTouched, touchKey, type TouchedFile } from '@/stores/touched';
import { formatRelative } from '@/lib/format';
import { FileIcon } from './FileIcon';
import { AgentFileItems } from '@/features/agent/AgentFileMenu';
import { cn } from '@/lib/cn';
import { useUI, collectLeaves } from '@/stores/ui';
import { useProjects } from '@/stores/projects';
import { useSettings } from '@/stores/settings';
import { IconButton } from '@/components/ui/IconButton';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { LivingBox, LivingField, LivingGroup, LivingItem, LivingReveal } from '@/components/ui/Living';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger, ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent } from '@/components/ui/ContextMenu';
import { listDir, joinPath, openPath, revealInFileManager } from '@/native/system';

import { git } from '@/native/git';
import { isTauri } from '@/lib/platform';
import { springs } from '@/lib/motion';
import { toast } from '@/features/notifications/toast-store';
import { useWorkspaceActions } from '@/features/sessions/useWorkspaceActions';
import type { GitFileStatus } from '@/types/workspace';
import { t } from '@/i18n';
import { copyText } from '@/lib/clipboard';

interface Node {
  name: string;
  path: string; // absolute
  rel: string; // relative to project root, forward slashes
  isDir: boolean;
}

const HIDDEN = new Set(['.git', 'node_modules', '.DS_Store']);
const EMPTY_STATUS: Map<string, GitFileStatus['status']> = new Map();

interface Decorations {
  files: Map<string, string>;
  dirs: Set<string>;
  /** Files an agent wrote this run, by lower-cased relative path. */
  touched: Map<string, TouchedFile>;
  touchedDirs: Set<string>;
  /** The project's folder colour, worn by every folder of the tree. */
  color?: string;
}

/**
 * File explorer (Ctrl+Shift+E). Directories load lazily from disk; git
 * decorations come from `git status`. Click opens the file in a pane.
 */
export function Explorer() {
  const toggleExplorer = useUI((s) => s.toggleExplorer);
  const showDecorations = useSettings((s) => s.git.showDecorations);
  const { currentProject, currentRoot } = useWorkspaceActions();
  const projects = useProjects((s) => s.projects);
  const projectRaw = currentProject();
  // A session in a worktree browses the worktree, not the project folder.
  const root = currentRoot();
  const project = useMemo(() => (projectRaw && root && root !== projectRaw.path ? { ...projectRaw, path: root } : projectRaw), [projectRaw, root]);
  const touchedFiles = useTouched((s) => s.files);
  const clearTouched = useTouched((s) => s.clear);
  const sort = useExplorer((s) => s.sort);
  const setSort = useExplorer((s) => s.setSort);
  const setNaming = useExplorer((s) => s.setNaming);
  const rootVersion = useExplorer((s) => (project ? (s.versions[touchKey(project.path)] ?? 0) : 0));
  const [rawStatus, setStatus] = useState<Map<string, GitFileStatus['status']>>(() => new Map());
  const [refreshKey, setRefreshKey] = useState(0);
  const decorate = isTauri && !!project && showDecorations;
  const status = decorate ? rawStatus : EMPTY_STATUS;
  // The tree is revealed once, when the root listing AND the git status are both in —
  // otherwise it repaints for every arriving piece while the panel is still sliding open.
  const [loaded, setLoaded] = useState<{ key: string; nodes: Node[]; statusReady: boolean }>({ key: '', nodes: [], statusReady: false });
  const loadKey = project ? `${project.id}-${refreshKey}-${rootVersion}` : '';
  const ready = !!project && loaded.key === loadKey && (loaded.statusReady || !decorate);

  const decorations = useMemo<Decorations>(() => {
    // Propagate a marker up to parent folders so collapsed dirs show a dot.
    const dirs = new Set<string>();
    for (const rel of status.keys()) {
      const parts = rel.split('/');
      for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
    }
    const touched = new Map<string, TouchedFile>();
    const touchedDirs = new Set<string>();
    if (project) {
      const rootKey = touchKey(project.path) + '/';
      for (const f of Object.values(touchedFiles)) {
        const key = touchKey(f.path);
        if (!key.startsWith(rootKey)) continue;
        const rel = key.slice(rootKey.length);
        touched.set(rel, f);
        const parts = rel.split('/');
        for (let i = 1; i < parts.length; i++) touchedDirs.add(parts.slice(0, i).join('/'));
      }
    }
    return { files: status, dirs, touched, touchedDirs, color: project?.color };
  }, [status, touchedFiles, project]);
  const anyTouched = decorations.touched.size > 0;

  useEffect(() => {
    if (!project || !isTauri) return;
    let cancelled = false;
    const key = `${project.id}-${refreshKey}-${rootVersion}`;
    const listing = listDir(project.path)
      .then((entries) => entries.filter((e) => !HIDDEN.has(e.name)).map((e) => ({ name: e.name, path: joinPath(project.path, e.name), rel: e.name, isDir: e.isDir })))
      .catch(() => [] as Node[]);
    const statusReq = decorate
      ? git
          .status(project.path)
          .then((list) => {
            const m = new Map<string, GitFileStatus['status']>();
            for (const f of list) if (!m.has(f.path)) m.set(f.path, f.status);
            return m;
          })
          .catch(() => new Map<string, GitFileStatus['status']>())
      : Promise.resolve(null);
    void Promise.all([listing, statusReq]).then(([nodes, st]) => {
      if (cancelled) return;
      if (st) setStatus(st);
      setLoaded({ key, nodes, statusReady: true });
    });
    return () => {
      cancelled = true;
    };
  }, [decorate, project, refreshKey, rootVersion]);

  return (
    <motion.aside
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 248, opacity: 1 }}
      transition={{ width: { duration: 0.2 }, opacity: { duration: 0.14 } }}
      className="flex h-full shrink-0 flex-col overflow-hidden bg-sidebar hairline-r"
      aria-label={t('Explorer')}
    >
      <div className="flex h-9 shrink-0 items-center gap-1 pl-3 pr-1">
        {project?.color ? <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: project.color }} /> : null}
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium uppercase tracking-[0.05em] text-muted">{project?.name ?? 'Explorer'}</span>
        {project ? (
          <>
            <IconButton label={t('New file')} size="xs" onClick={() => setNaming({ mode: 'new-file', dir: project.path, initial: '' })}>
              <FilePlus />
            </IconButton>
            <IconButton label={t('New folder')} size="xs" onClick={() => setNaming({ mode: 'new-dir', dir: project.path, initial: '' })}>
              <FolderPlus />
            </IconButton>
            <IconButton label={sort === 'name' ? t('Sorted by name — click for type') : t('Sorted by type — click for name')} size="xs" onClick={() => setSort(sort === 'name' ? 'type' : 'name')}>
              {sort === 'name' ? <ArrowDownAZ /> : <ArrowDownWideNarrow />}
            </IconButton>
          </>
        ) : null}
        {anyTouched ? (
          <IconButton label={t('Clear agent marks')} size="xs" onClick={() => clearTouched()}>
            <Eraser />
          </IconButton>
        ) : null}
        <IconButton label={t('Refresh')} size="xs" onClick={() => setRefreshKey((k) => k + 1)}>
          <RefreshCw />
        </IconButton>
        <IconButton label={t('Close explorer')} size="xs" shortcut="mod+shift+e" onClick={toggleExplorer}>
          <X />
        </IconButton>
      </div>
      <ScrollArea className="flex-1 px-1.5 pb-2">
        {!project ? (
          <div className="px-2 py-4 text-[12.5px] text-muted">{projects.length ? t('Select a project.') : t('Add a project to browse its files.')}</div>
        ) : !isTauri ? (
          <div className="px-2 py-4 text-[12.5px] text-muted">{t('The explorer reads the disk in the desktop app.')}</div>
        ) : !ready ? (
          <TreeSkeleton />
        ) : (
          <motion.div key={`${project.id}-${refreshKey}`} initial={{ opacity: 0, y: 2 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: 'easeOut' }}>
            <LivingGroup id="explorer">
            <NamingRow dir={project.path} depth={0} projectId={project.id} />
            {loaded.nodes.length === 0 ? (
              <div className="px-2 py-4 text-[12.5px] text-muted">{t('Empty folder.')}</div>
            ) : (
              sortNodes(loaded.nodes, sort).map((n) => <TreeNode key={n.path} node={n} depth={0} root={project.path} decorations={decorations} projectId={project.id} />)
            )}
            </LivingGroup>
          </motion.div>
        )}
      </ScrollArea>
    </motion.aside>
  );
}

/** Placeholder rows while the listing and git status load — the shape of a tree, no content. */
function TreeSkeleton() {
  const rows = [0, 1, 1, 2, 1, 0, 1, 0, 1, 2, 1, 0];
  return (
    <div className="animate-pulse pt-1" aria-hidden="true">
      {rows.map((depth, i) => (
        <div key={i} className="flex h-[calc(var(--row-height)-10px)] items-center gap-2 pr-3" style={{ paddingLeft: 12 + depth * 12 }}>
          <span className="size-3 shrink-0 rounded-[3px] bg-surface-active" />
          <span className="h-2.5 rounded-full bg-surface-active" style={{ width: `${38 + ((i * 29) % 45)}%` }} />
        </div>
      ))}
    </div>
  );
}

function DirChildren({ root, dir, rel, depth, decorations, projectId }: { root: string; dir: string; rel: string; depth: number; decorations: Decorations; projectId: string }) {
  const [nodes, setNodes] = useState<Node[] | null>(null);
  const version = useExplorer((s) => s.versions[touchKey(dir)] ?? 0);
  const sort = useExplorer((s) => s.sort);
  useEffect(() => {
    let cancelled = false;
    listDir(dir)
      .then((entries) => {
        if (cancelled) return;
        setNodes(
          entries
            .filter((e) => !HIDDEN.has(e.name))
            .map((e) => ({ name: e.name, path: joinPath(dir, e.name), rel: rel ? `${rel}/${e.name}` : e.name, isDir: e.isDir })),
        );
      })
      .catch(() => !cancelled && setNodes([]));
    return () => {
      cancelled = true;
    };
  }, [dir, rel, version]);
  if (!nodes) return <div className="px-2 py-1 text-[11.5px] text-muted" style={{ paddingLeft: 12 + depth * 12 }}>…</div>;
  return (
    <>
      <NamingRow dir={dir} depth={depth} projectId={projectId} />
      {sortNodes(nodes, sort).map((n) => (
        <TreeNode key={n.path} node={n} depth={depth} root={root} decorations={decorations} projectId={projectId} />
      ))}
    </>
  );
}

/** The input row for a new file / folder inside `dir` (only when that is where the naming happens). */
function NamingRow({ dir, depth, projectId }: { dir: string; depth: number; projectId: string }) {
  const naming = useExplorer((s) => s.naming);
  if (!naming || naming.mode === 'rename' || touchKey(naming.dir) !== touchKey(dir)) return null;
  return <NameInput naming={naming} depth={depth} projectId={projectId} />;
}

/** One inline text field: Enter commits (create / rename), Escape cancels; errors surface as toasts. */
function NameInput({ naming, depth, projectId }: { naming: Naming; depth: number; projectId: string }) {
  const [value, setValue] = useState(naming.initial);
  const setNaming = useExplorer((s) => s.setNaming);
  const bump = useExplorer((s) => s.bump);
  const { openFile } = useWorkspaceActions();
  const commit = async () => {
    const name = value.trim();
    setNaming(null);
    if (!name || name === naming.initial) return;
    if (/[\\/:*?"<>|]/.test(name)) {
      toast.error(t('That name is not allowed'), { description: name, origin: null });
      return;
    }
    const sep = naming.dir.includes('\\') ? '\\' : '/';
    const target = `${naming.dir.replace(/[\\/]+$/, '')}${sep}${name}`;
    try {
      if (naming.mode === 'new-file') {
        await createFile(target);
        bump(naming.dir);
        openFile(target, projectId);
      } else if (naming.mode === 'new-dir') {
        await createDir(target);
        bump(naming.dir);
      } else if (naming.path) {
        await renamePath(naming.path, target);
        bump(naming.dir);
        // A renamed file that is open in a pane follows its new path.
        const ui = useUI.getState();
        for (const l of collectLeaves(ui.layout)) {
          if (l.content.kind === 'file' && touchKey(l.content.path) === touchKey(naming.path)) ui.setPaneContent(l.id, { ...l.content, path: target });
        }
      }
    } catch (e) {
      toast.error(naming.mode === 'rename' ? t('Rename failed') : t('Could not create'), { description: e instanceof Error ? e.message : String(e), origin: null });
    }
  };
  return (
    <LivingField className="flex h-[calc(var(--row-height)-10px)] items-center gap-1.5 pr-2" style={{ paddingLeft: 6 + depth * 12 + 20 }}>
      <FileIcon name={naming.mode === 'new-dir' ? '' : value || 'file'} isDir={naming.mode === 'new-dir'} size={15} />
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => {
          const v = e.currentTarget.value;
          const dot = v.lastIndexOf('.');
          e.currentTarget.setSelectionRange(0, dot > 0 ? dot : v.length);
        }}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            void commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setNaming(null);
          }
        }}
        placeholder={naming.mode === 'new-dir' ? t('folder name') : t('file name')}
        spellCheck={false}
        className="h-6 min-w-0 flex-1 rounded-[4px] bg-surface px-1.5 font-mono text-[12px] text-primary shadow-[inset_0_0_0_1px_var(--accent)] outline-none"
      />
    </LivingField>
  );
}

function TreeNode({ node, depth, root, decorations, projectId }: { node: Node; depth: number; root: string; decorations: Decorations; projectId: string }) {
  const [openState, setOpenState] = useState(false);
  const [seenForce, setSeenForce] = useState(0);
  const openDiff = useUI((s) => s.openDiff);
  const { openFile } = useWorkspaceActions();
  const setNaming = useExplorer((s) => s.setNaming);
  const bump = useExplorer((s) => s.bump);
  const defaultAgent = useSettings((s) => s.defaultAgent);
  const naming = useExplorer((s) => (s.naming?.mode === 'rename' && s.naming.path && touchKey(s.naming.path) === touchKey(node.path) ? s.naming : null));
  const forced = useExplorer((s) => (node.isDir ? (s.forceOpen[touchKey(node.path)] ?? 0) : 0));
  const openDir = useExplorer((s) => s.open);
  // Open by the user, or forced open (a file is being created inside) since the last close.
  const open = openState || forced > seenForce;
  const toggleOpen = () => {
    if (open) {
      setSeenForce(forced);
      setOpenState(false);
    } else setOpenState(true);
  };
  const parentDir = dirname(node.path);
  const remove = async () => {
    try {
      await trashPath(node.path);
      bump(parentDir);
      toast.neutral(t('Sent to the Recycle Bin'), { description: node.name, origin: null });
      const ui = useUI.getState();
      for (const l of collectLeaves(ui.layout)) {
        if (l.content.kind === 'file' && touchKey(l.content.path).startsWith(touchKey(node.path))) ui.setPaneContent(l.id, { kind: 'empty' });
      }
    } catch (e) {
      toast.error(t('Delete failed'), { description: e instanceof Error ? e.message : String(e), origin: null });
    }
  };
  const startNew = (mode: 'new-file' | 'new-dir') => {
    if (node.isDir) {
      openDir(node.path);
      setNaming({ mode, dir: node.path, initial: '' });
    } else setNaming({ mode, dir: parentDir, initial: '' });
  };
  const status = decorations.files.get(node.rel);
  const dirDirty = node.isDir && decorations.dirs.has(node.rel);
  const touched = node.isDir ? undefined : decorations.touched.get(node.rel.toLowerCase());
  const dirTouched = node.isDir && decorations.touchedDirs.has(node.rel.toLowerCase());

  const activate = () => {
    if (node.isDir) toggleOpen();
    else openFile(node.path, projectId);
  };

  if (naming) return <NameInput naming={naming} depth={depth} projectId={projectId} />;

  return (
    <LivingBox>
      <LivingItem still>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            type="button"
            onClick={activate}
            onKeyDown={(e) => {
              if (e.key === 'F2') {
                e.preventDefault();
                setNaming({ mode: 'rename', dir: parentDir, path: node.path, initial: node.name });
              } else if (e.key === 'Delete') {
                e.preventDefault();
                void remove();
              }
            }}
            style={{ paddingLeft: 6 + depth * 12 }}
            className="flex h-[calc(var(--row-height)-10px)] w-full items-center gap-1.5 rounded-md pr-2 text-left text-[12.5px] text-secondary outline-none transition-colors duration-(--motion-fast) hover:bg-surface-hover hover:text-primary focus-visible:bg-surface-hover"
          >
            <span className="inline-flex size-[14px] shrink-0 items-center justify-center text-muted">
              {node.isDir ? (
                <motion.span animate={{ rotate: open ? 90 : 0 }} transition={springs.snappy} className="inline-flex">
                  <ChevronRight className="size-[12px]" />
                </motion.span>
              ) : null}
            </span>
            <FileIcon name={node.name} isDir={node.isDir} open={open} size={15} color={node.isDir ? decorations.color : undefined} />
            <span className={cn('min-w-0 flex-1 truncate', touched || dirTouched ? 'text-success' : status === 'M' ? 'text-warning' : status === 'A' || status === 'U' ? 'text-success' : status === 'D' && 'text-danger line-through')}>{node.name}</span>
            {touched ? (
              <Tooltip content={`${AGENT_LABEL[touched.agent]} · ${formatRelative(touched.at)} · +${touched.additions} −${touched.deletions}`} side="right">
                <motion.span key={touched.version} initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={springs.pop} className="inline-flex items-center gap-1">
                  <AgentLogo agent={touched.agent} size={11} />
                  {status ? <span className="font-mono text-[10.5px] font-semibold text-success">{status}</span> : null}
                </motion.span>
              </Tooltip>
            ) : status ? (
              <span className="font-mono text-[10.5px] font-semibold text-muted">{status}</span>
            ) : dirTouched ? (
              <span className="size-1.5 rounded-full bg-success/80" />
            ) : dirDirty ? (
              <span className="size-1.5 rounded-full bg-warning/70" />
            ) : null}
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-[220px]">
          {!node.isDir ? (
            <>
              <ContextMenuItem icon={<File />} onSelect={() => openFile(node.path, projectId)}>
                {t('Open')}
              </ContextMenuItem>
              <ContextMenuItem icon={<SplitSquareHorizontal />} onSelect={() => openFile(node.path, projectId, 'split')}>
                {t('Open to the side')}
              </ContextMenuItem>
              {status ? (
                <ContextMenuItem icon={<FileDiff />} onSelect={() => openDiff(node.rel, undefined, root)}>
                  {t('Open diff')}
                </ContextMenuItem>
              ) : null}
              <ContextMenuSub>
                <ContextMenuSubTrigger icon={<AgentLogo agent={defaultAgent} />}>{t('Ask an agent')}</ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  <AgentFileItems Item={ContextMenuItem} path={node.path} projectId={projectId} />
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuSeparator />
            </>
          ) : null}
          <ContextMenuSub>
            <ContextMenuSubTrigger icon={<Plus />}>{t('New')}</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem icon={<FilePlus />} onSelect={() => startNew('new-file')}>
                {node.isDir ? t('File here') : t('File')}
              </ContextMenuItem>
              <ContextMenuItem icon={<FolderPlus />} onSelect={() => startNew('new-dir')}>
                {node.isDir ? t('Folder here') : t('Folder')}
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuItem icon={<Pencil />} shortcut="F2" onSelect={() => setNaming({ mode: 'rename', dir: parentDir, path: node.path, initial: node.name })}>
            {t('Rename')}
          </ContextMenuItem>
          <ContextMenuItem icon={<Trash2 />} danger shortcut="Delete" onSelect={() => void remove()}>
            {t('Delete')}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuSub>
            <ContextMenuSubTrigger icon={<ExternalLink />}>{t('System')}</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem icon={<ExternalLink />} onSelect={() => void openPath(node.path)}>
                {t('Open with default app')}
              </ContextMenuItem>
              <ContextMenuItem icon={<FolderOpen />} onSelect={() => void revealInFileManager(node.path)}>
                {t('Reveal in file manager')}
              </ContextMenuItem>
              <ContextMenuItem
                icon={<Copy />}
                onSelect={() => {
                  void copyText(node.path);
                  toast.neutral(t('Path copied'));
                }}
              >
                {t('Copy path')}
              </ContextMenuItem>
              <ContextMenuItem
                icon={<Copy />}
                onSelect={() => {
                  void copyText(node.rel);
                  toast.neutral(t('Path copied'));
                }}
              >
                {t('Copy relative path')}
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
        </ContextMenuContent>
      </ContextMenu>
      </LivingItem>
      {node.isDir ? (
        <LivingReveal open={open}>
          <DirChildren root={root} dir={node.path} rel={node.rel} depth={depth + 1} decorations={decorations} projectId={projectId} />
        </LivingReveal>
      ) : null}
    </LivingBox>
  );
}
