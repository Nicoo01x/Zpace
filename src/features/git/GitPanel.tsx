import { useCallback, useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, GitBranch, Plus, Minus, RotateCcw, Check, RefreshCw, Search, GitBranchPlus, Trash2, Cloud, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { LivingSwitch } from '@/components/ui/Living';
import { useUI } from '@/stores/ui';
import { useProjects } from '@/stores/projects';
import { Sheet, SheetContent } from '@/components/ui/Sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { TextInput } from '@/components/ui/TextInput';
import { Spinner } from '@/components/ui/Spinner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/ContextMenu';
import { toast } from '@/features/notifications/toast-store';
import { commitToast, gitTransferToast } from '@/features/notifications/rich';
import { GitAvatar } from './GitAvatar';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { PanelRightClose } from 'lucide-react';
import { avatarCandidates } from './avatar-lookup';
import { git } from '@/native/git';
import { gitSummary } from '@/native/system';
import { basename, dirname } from '@/lib/format';
import { isTauri } from '@/lib/platform';
import { useWorkspaceActions } from '@/features/sessions/useWorkspaceActions';
import type { GitBranch as Branch, GitCommit, GitFileStatus } from '@/types/workspace';
import { fuzzyMatch } from '@/lib/fuzzy';
import { t } from '@/i18n';

/**
 * Git side panel — Changes / Branches / Commits. Everything runs through the
 * real `git` CLI; the header shows the current branch with ahead/behind.
 */
export function GitPanel() {
  const open = useUI((s) => s.gitPanelOpen);
  const toggle = useUI((s) => s.toggleGitPanel);
  const projects = useProjects((s) => s.projects);
  const { currentProject, currentRoot, splitActive } = useWorkspaceActions();
  const [projectId, setProjectId] = useState<string | null>(null);
  const project = projects.find((p) => p.id === projectId) ?? currentProject();
  // The active session's worktree, when it has one, is the checkout git looks at.
  const root = (!projectId && currentRoot()) || project?.path;
  // Undock: the same body lives on in a pane beside the current one; the sheet closes.
  const undock = () => {
    if (!project) return;
    toggle();
    window.setTimeout(() => splitActive('horizontal', { kind: 'git', projectId: project.id }), 60);
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && toggle()}>
      <SheetContent
        width={480}
        aria-describedby={undefined}
        title={
          <span className="inline-flex items-center gap-2">
            <GitBranch className="size-[14px] text-muted" />
            {projects.length > 1 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="inline-flex items-center gap-1 rounded-md px-1 hover:bg-surface-hover">
                    {project?.name ?? 'Git'}
                    <ChevronDown className="size-3 text-muted" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>{t('Repository')}</DropdownMenuLabel>
                  {projects.map((p) => (
                    <DropdownMenuItem key={p.id} onSelect={() => setProjectId(p.id)}>
                      {p.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <span>{project?.name ?? 'Git'}</span>
            )}
            {project ? (
              <button type="button" onClick={undock} title={t('Open as a pane')} className="ml-1 inline-flex size-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-primary">
                <PanelRightClose className="size-[14px]" />
              </button>
            ) : null}
          </span>
        }
      >
        {open && project ? (
          <ErrorBoundary compact label={t('Git')}>
            <GitBody key={`${project.id}:${root}`} projectId={project.id} path={root ?? project.path} />
          </ErrorBoundary>
        ) : (
          <Empty>{t('Add a project to use git.')}</Empty>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** The git panel's body, also shown inside a pane when undocked. */
export function GitBody({ projectId, path }: { projectId: string; path: string }) {
  const setGit = useProjects((s) => s.setGit);
  const summary = useProjects((s) => s.projects.find((p) => p.id === projectId)?.git);
  const openDiff = useUI((s) => s.openDiff);
  const [files, setFiles] = useState<GitFileStatus[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState('changes');
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(isTauri);
  const [branchQuery, setBranchQuery] = useState('');
  const [newBranch, setNewBranch] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!isTauri) return;
    let cancelled = false;
    void (async () => {
      try {
        const [f, b, c, s] = await Promise.all([git.status(path), git.branches(path), git.log(path, 40), gitSummary(path)]);
        if (cancelled) return;
        setFiles(f);
        setBranches(b);
        setCommits(c);
        if (s) setGit(projectId, s);
      } catch (e) {
        if (!cancelled) toast.error(t('Git error'), { description: e instanceof Error ? e.message : String(e) });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path, projectId, refreshKey, setGit]);

  const act = async (label: string, fn: () => Promise<unknown>, success?: string) => {
    setBusy(label);
    try {
      await fn();
      if (success) toast.success(success, { origin: null });
      refresh();
    } catch (e) {
      toast.error(`${label} failed`, { description: e instanceof Error ? e.message : String(e), duration: 8000 });
    } finally {
      setBusy(null);
    }
  };
  /** Push / pull / fetch: one pill that morphs through the steps (errors included). */
  const transfer = async (kind: 'push' | 'pull' | 'fetch', fn: () => Promise<unknown>) => {
    const label = kind === 'push' ? 'Push' : kind === 'pull' ? 'Pull' : 'Fetch';
    setBusy(label);
    try {
      await gitTransferToast(kind, fn(), { branch: branches.find((b) => b.current)?.name, remote: 'origin' });
      refresh();
    } catch {
      /* the pill already turned red */
    } finally {
      setBusy(null);
    }
  };
  const doCommit = async () => {
    const msg = message.trim();
    setBusy('Commit');
    try {
      const n = files.filter((f) => f.staged).length;
      await git.commit(path, msg);
      const head = await git.log(path, 1).catch(() => []);
      const avatar = head[0]?.email ? (await avatarCandidates(head[0].email).catch(() => []))[0] : undefined;
      commitToast({ hash: head[0]?.hash, message: msg, files: n, branch: branches.find((b) => b.current)?.name, avatar, author: head[0]?.author });
      setMessage('');
      refresh();
    } catch (e) {
      toast.error(t('Commit failed'), { description: e instanceof Error ? e.message : String(e), duration: 8000 });
    } finally {
      setBusy(null);
    }
  };

  const changes = files.filter((f) => !f.staged);
  const staged = files.filter((f) => f.staged);
  const current = branches.find((b) => b.current);
  const filteredBranches = branchQuery ? branches.filter((b) => fuzzyMatch(branchQuery, b.name)) : branches;
  const local = filteredBranches.filter((b) => !b.remote);
  const remote = filteredBranches.filter((b) => b.remote);

  if (!isTauri) return <Empty>{t('Git runs in the desktop app.')}</Empty>;

  const FileRow = ({ f }: { f: GitFileStatus }) => (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          onClick={() => openDiff(f.path, undefined, path)}
          className="group/row flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[12.5px] outline-none hover:bg-surface-hover focus-visible:bg-surface-hover"
        >
          <span className={cn('w-3 font-mono text-[11px] font-semibold', f.status === 'M' && 'text-warning', (f.status === 'A' || f.status === 'U') && 'text-success', f.status === 'D' && 'text-danger', f.status === 'R' && 'text-accent')}>{f.status}</span>
          <span className="min-w-0 flex-1 truncate font-mono text-[12px]">
            <span className="text-muted">{dirname(f.path) !== f.path ? `${dirname(f.path)}/` : ''}</span>
            <span className="text-primary">{basename(f.path)}</span>
          </span>
          <span className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100">
            {f.staged ? (
              <span role="button" aria-label={t('Unstage')} onClick={(e) => { e.stopPropagation(); void act('Unstage', () => git.unstage(path, f.path)); }} className="inline-flex size-5 items-center justify-center rounded text-muted hover:bg-surface-active hover:text-primary">
                <Minus className="size-3" />
              </span>
            ) : (
              <>
                <span role="button" aria-label={t('Discard')} onClick={(e) => { e.stopPropagation(); void act('Discard', () => git.discard(path, f.path), 'Changes discarded'); }} className="inline-flex size-5 items-center justify-center rounded text-muted hover:bg-surface-active hover:text-danger">
                  <RotateCcw className="size-3" />
                </span>
                <span role="button" aria-label={t('Stage')} onClick={(e) => { e.stopPropagation(); void act('Stage', () => git.stage(path, f.path)); }} className="inline-flex size-5 items-center justify-center rounded text-muted hover:bg-surface-active hover:text-primary">
                  <Plus className="size-3" />
                </span>
              </>
            )}
          </span>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => openDiff(f.path, undefined, path)}>{t('Open diff')}</ContextMenuItem>
        {f.staged ? (
          <ContextMenuItem icon={<Minus />} onSelect={() => void act('Unstage', () => git.unstage(path, f.path))}>
            {t('Unstage')}
          </ContextMenuItem>
        ) : (
          <ContextMenuItem icon={<Plus />} onSelect={() => void act('Stage', () => git.stage(path, f.path))}>
            {t('Stage')}
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem icon={<RotateCcw />} danger onSelect={() => void act('Discard', () => git.discard(path, f.path), 'Changes discarded')}>
          {t('Discard changes')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );

  return (
    <div className="flex h-full flex-col">
      {/* header: branch + sync */}
      <div className="flex items-center gap-2 px-3 py-2 hairline-b">
        <span className="inline-flex min-w-0 items-center gap-1.5 font-mono text-[12.5px] text-primary">
          <GitBranch className="size-[13px] shrink-0 text-muted" />
          <span className="truncate">{summary?.branch ?? current?.name ?? '—'}</span>
        </span>
        {summary ? (
          <span className="text-[12px] tabular text-secondary">
            <span className="text-muted">↑</span>
            {summary.ahead} <span className="text-muted">↓</span>
            {summary.behind}
          </span>
        ) : null}
        <span className="flex-1" />
        <Button size="sm" variant="ghost" leading={<RefreshCw />} loading={busy === 'Fetch'} onClick={() => void transfer('fetch', () => git.fetch(path))}>
          {t('Fetch')}
        </Button>
        <Button size="sm" variant="ghost" leading={<ArrowDownToLine />} loading={busy === 'Pull'} onClick={() => void transfer('pull', () => git.pull(path))}>
          {t('Pull')}
        </Button>
        <Button size="sm" variant="ghost" leading={<ArrowUpFromLine />} loading={busy === 'Push'} onClick={() => void transfer('push', () => git.push(path))}>
          {t('Push')}
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="px-2">
            <TabsTrigger value="changes" active={tab === 'changes'} layoutId="git-tab" count={files.length}>
              {t('Changes')}
            </TabsTrigger>
            <TabsTrigger value="branches" active={tab === 'branches'} layoutId="git-tab" count={local.length}>
              {t('Branches')}
            </TabsTrigger>
            <TabsTrigger value="commits" active={tab === 'commits'} layoutId="git-tab">
              {t('Commits')}
            </TabsTrigger>
          </TabsList>

          <LivingSwitch k={tab} className="flex min-h-0 flex-1 flex-col">
          {/* Changes */}
          <TabsContent value="changes" className="flex min-h-0 flex-1 flex-col outline-none">
            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              <SectionTitle
                action={
                  changes.length ? (
                    <button type="button" className="text-[11px] text-muted hover:text-primary" onClick={() => void act('Stage all', () => git.stageAll(path))}>
                      {t('Stage all')}
                    </button>
                  ) : null
                }
              >
                {t('Changes')} · {changes.length}
              </SectionTitle>
              {changes.length === 0 ? <Empty>{t('Working tree clean.')}</Empty> : changes.map((f) => <FileRow key={`c-${f.path}`} f={f} />)}
              <SectionTitle>{t('Staged')} · {staged.length}</SectionTitle>
              {staged.length === 0 ? <Empty>{t('Nothing staged.')}</Empty> : staged.map((f) => <FileRow key={`s-${f.path}`} f={f} />)}
            </div>
            <div className="flex flex-col gap-2 p-3 hairline-t">
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t('Commit message')} minRows={2} maxRows={6} className="text-[12.5px]" />
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] text-muted">{staged.length ? t('{n} files staged', { n: staged.length }) : t('Stage files to commit')}</span>
                <Button
                  size="sm"
                  variant="primary"
                  leading={<Check />}
                  disabled={!message.trim() || staged.length === 0}
                  loading={busy === 'Commit'}
                  onClick={() => void doCommit()}
                >
                  {t('Commit')}
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Branches */}
          <TabsContent value="branches" className="flex min-h-0 flex-1 flex-col outline-none">
            <div className="flex items-center gap-2 px-3 py-2">
              <TextInput size="sm" leading={<Search />} placeholder={t('Filter branches')} value={branchQuery} onChange={(e) => setBranchQuery(e.target.value)} className="flex-1" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              <SectionTitle>{t('Local')}</SectionTitle>
              {local.map((b) => (
                <BranchRow key={b.name} b={b} busy={busy === `Checkout ${b.name}`} onCheckout={() => void act(`Checkout ${b.name}`, () => git.checkout(path, b.name), `Switched to ${b.name}`)} onDelete={() => void act('Delete branch', () => git.deleteBranch(path, b.name), `Deleted ${b.name}`)} />
              ))}
              {remote.length ? (
                <>
                  <SectionTitle>{t('Remote')}</SectionTitle>
                  {remote.map((b) => (
                    <BranchRow key={b.name} b={b} busy={busy === `Checkout ${b.name}`} onCheckout={() => void act(`Checkout ${b.name}`, () => git.checkout(path, b.name), `Checked out ${b.name}`)} />
                  ))}
                </>
              ) : null}
            </div>
            <div className="flex items-center gap-2 p-3 hairline-t">
              <TextInput size="sm" mono leading={<GitBranchPlus />} placeholder="new-branch-name" value={newBranch} onChange={(e) => setNewBranch(e.target.value.replace(/\s+/g, '-'))} className="flex-1" onKeyDown={(e) => { if (e.key === 'Enter' && newBranch.trim()) void act('Create branch', () => git.checkout(path, newBranch.trim(), true), `Created ${newBranch.trim()}`).then(() => setNewBranch('')); }} />
              <Button size="sm" disabled={!newBranch.trim()} loading={busy === 'Create branch'} onClick={() => void act('Create branch', () => git.checkout(path, newBranch.trim(), true), `Created ${newBranch.trim()}`).then(() => setNewBranch(''))}>
                {t('Create & switch')}
              </Button>
            </div>
          </TabsContent>

          {/* Commits */}
          <TabsContent value="commits" className="min-h-0 flex-1 overflow-y-auto p-1.5 outline-none">
            {commits.length === 0 ? <Empty>{t('No commits yet.')}</Empty> : null}
            {commits.map((c) => (
              <div key={c.hash} className="flex h-8 items-center gap-2.5 rounded-md px-2 text-[12.5px] hover:bg-surface-hover" title={`${c.author} <${c.email}>`}>
                <GitAvatar email={c.email} name={c.author} size={18} />
                <span className="font-mono text-[11.5px] text-muted">{c.hash}</span>
                <span className="min-w-0 flex-1 truncate text-primary">{c.subject}</span>
                <span className="shrink-0 text-[11.5px] text-muted">{c.author}</span>
                <span className="shrink-0 text-[11.5px] text-muted">{c.date}</span>
              </div>
            ))}
          </TabsContent>
          </LivingSwitch>
        </Tabs>
      )}
    </div>
  );
}

function BranchRow({ b, busy, onCheckout, onDelete }: { b: Branch; busy: boolean; onCheckout: () => void; onDelete?: () => void }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          onDoubleClick={onCheckout}
          onClick={() => !b.current && onCheckout()}
          className={cn('group/b flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[12.5px] outline-none hover:bg-surface-hover focus-visible:bg-surface-hover', b.current && 'text-primary')}
        >
          <span className="inline-flex w-4 justify-center">{b.current ? <Check className="size-[13px] text-success" strokeWidth={2.5} /> : b.remote ? <Cloud className="size-[12px] text-muted" /> : <GitBranch className="size-[12px] text-muted" />}</span>
          <span className={cn('min-w-0 flex-1 truncate font-mono text-[12px]', b.current ? 'font-medium text-primary' : 'text-secondary')}>{b.name}</span>
          {busy ? <Spinner size={11} /> : null}
          {b.ahead || b.behind ? (
            <span className="text-[11px] tabular text-muted">
              {b.ahead ? `↑${b.ahead} ` : ''}
              {b.behind ? `↓${b.behind}` : ''}
            </span>
          ) : null}
          <span className="max-w-[120px] shrink-0 truncate text-[11px] text-muted" title={b.subject}>
            {b.date}
          </span>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onCheckout} disabled={b.current}>
          {t('Switch to branch')}
        </ContextMenuItem>
        {!b.remote && onDelete ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem icon={<Trash2 />} danger disabled={b.current} onSelect={onDelete}>
              {t('Delete branch')}
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
      <span>{children}</span>
      {action}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-3 py-4 text-center text-[12.5px] text-muted">{children}</div>;
}
