import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, RotateCcw, GitCommitHorizontal, RefreshCw } from 'lucide-react';
import { useSessions } from '@/stores/sessions';
import { useSettings } from '@/stores/settings';
import { useProjects } from '@/stores/projects';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/features/notifications/toast-store';
import { openPath, joinPath, isAbsolutePath, gitSummary } from '@/native/system';
import { git, relativeTo } from '@/native/git';
import { basename, dirname } from '@/lib/format';
import { languageFor } from './languages';
import { simpleDiff } from './simpleDiff';
import { isTauri } from '@/lib/platform';
import { t } from '@/i18n';

const MonacoDiff = lazy(() => import('./MonacoDiff'));

/**
 * Diff viewer.
 *  - Session diffs: before/after captured in the FileWrite event.
 *  - Working-tree diffs (git panel, explorer): HEAD vs. disk through git.
 * Stage / Revert act on the real repository when a root is known.
 */
export function DiffPane({ path, sessionId, root }: { path: string; sessionId?: string; root?: string }) {
  const [mode, setMode] = useState<'side' | 'inline'>('side');
  const theme = useSettings((s) => s.theme);
  const events = useSessions((s) => (sessionId ? s.events[sessionId] : undefined));
  const sessionProjectId = useSessions((s) => (sessionId ? s.sessions[sessionId]?.projectId : undefined));
  const project = useProjects((s) => s.projects.find((p) => (root ? p.path === root : p.id === sessionProjectId)));
  const setGit = useProjects((s) => s.setGit);
  const change = useMemo(() => {
    const list = events ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (e.type === 'file_write' && e.path === path) return e;
    }
    return undefined;
  }, [events, path]);

  const repoRoot = root ?? project?.path;
  const relPath = repoRoot ? relativeTo(repoRoot, path) : path;
  const absPath = repoRoot && !isAbsolutePath(path) ? joinPath(repoRoot, path) : path;

  const [result, setResult] = useState<{ key: string; original: string; modified: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const useGit = !change && !!repoRoot && isTauri;
  const diffKey = `${repoRoot}|${relPath}|${reloadKey}`;
  const gitDiff = result?.key === diffKey ? result : null;
  const loading = useGit && !gitDiff;

  useEffect(() => {
    if (!useGit || !repoRoot) return;
    let cancelled = false;
    git
      .diffFile(repoRoot, relPath)
      .then((d) => !cancelled && setResult({ key: diffKey, ...d }))
      .catch((e) => {
        if (cancelled) return;
        setResult({ key: diffKey, original: '', modified: '' });
        toast.error(t('Could not read diff'), { description: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [useGit, repoRoot, relPath, diffKey]);

  const before = change?.before ?? gitDiff?.original ?? '';
  const after = change?.after ?? gitDiff?.modified ?? change?.diff ?? '';
  const stats = useMemo(() => simpleDiff(before, after), [before, after]);
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const refreshSummary = async () => {
    if (!repoRoot) return;
    const p = useProjects.getState().projects.find((x) => x.path === repoRoot);
    const g = await gitSummary(repoRoot);
    if (p && g) setGit(p.id, g);
  };

  const stage = async () => {
    if (!repoRoot) return toast.info(t('No repository for this file'));
    try {
      await git.stage(repoRoot, relPath);
      toast.success(t('Staged'), { description: relPath });
      await refreshSummary();
    } catch (e) {
      toast.error(t('Stage failed'), { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const revert = async () => {
    if (!repoRoot) return toast.info(t('No repository for this file'));
    try {
      await git.discard(repoRoot, relPath);
      toast.success(t('Reverted'), { description: relPath });
      setReloadKey((k) => k + 1);
      await refreshSummary();
    } catch (e) {
      toast.error(t('Revert failed'), { description: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-3 px-3 hairline-b">
        <div className="min-w-0 flex-1 truncate font-mono text-[12.5px]">
          <span className="text-muted">{dirname(relPath) !== relPath ? `${dirname(relPath)}/` : ''}</span>
          <span className="text-primary">{basename(relPath)}</span>
        </div>
        <span className="font-mono text-[11.5px] tabular">
          <span className="text-success">+{change?.additions ?? stats.additions}</span> <span className="text-danger">−{change?.deletions ?? stats.deletions}</span>
        </span>
        <SegmentedControl
          size="sm"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'side', label: t('Side by side') },
            { value: 'inline', label: t('Inline') },
          ]}
          aria-label={t('Diff layout')}
        />
      </div>
      <div className="min-h-0 flex-1">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : before || after ? (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <Spinner />
              </div>
            }
          >
            <MonacoDiff original={before} modified={after} language={languageFor(path)} inline={mode === 'inline'} theme={dark ? 'conduit-dark' : 'conduit-light'} />
          </Suspense>
        ) : (
          <div className="flex h-full items-center justify-center text-[12.5px] text-muted">{isTauri ? t('No changes for this file.') : t('Working-tree diffs open in the desktop app.')}</div>
        )}
      </div>
      <div className="flex h-11 shrink-0 items-center gap-2 px-3 hairline-t">
        <Button size="sm" variant="ghost" leading={<ExternalLink />} onClick={() => void openPath(absPath)}>
          {t('Open file')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          leading={<Copy />}
          onClick={() => {
            void navigator.clipboard.writeText(change?.diff ?? stats.unified);
            toast.neutral(t('Diff copied'));
          }}
        >
          {t('Copy diff')}
        </Button>
        {useGit ? (
          <Button size="sm" variant="ghost" leading={<RefreshCw />} onClick={() => setReloadKey((k) => k + 1)}>
            {t('Refresh')}
          </Button>
        ) : null}
        <span className="flex-1" />
        <Button size="sm" variant="ghost" leading={<RotateCcw />} onClick={() => void revert()} disabled={!repoRoot || !isTauri}>
          {t('Revert')}
        </Button>
        <Button size="sm" leading={<GitCommitHorizontal />} onClick={() => void stage()} disabled={!repoRoot || !isTauri}>
          {t('Stage')}
        </Button>
      </div>
    </div>
  );
}
