import { memo } from 'react';
import { Copy, ExternalLink, FileDiff, RotateCcw, GitCommitHorizontal } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { FileDeleteEvent, FileWriteEvent } from '@/types/agent';
import { useUI } from '@/stores/ui';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/ContextMenu';
import { truncateMiddle, basename, dirname } from '@/lib/format';
import { toast } from '@/features/notifications/toast-store';
import { openPath, joinPath, isAbsolutePath, gitSummary } from '@/native/system';
import { git, relativeTo } from '@/native/git';
import { useProjects } from '@/stores/projects';
import { useSessions } from '@/stores/sessions';
import { isTauri } from '@/lib/platform';
import { Row } from './Row';
import { t } from '@/i18n';
import { copyText } from '@/lib/clipboard';

/**
 * File change list:
 *   M app.domain.js            +23 −4
 *   A Dockerfile               +38
 *   D old.config.js
 * Click opens the diff viewer.
 */
export const FileChanges = memo(function FileChanges({ events, sessionId }: { events: Array<FileWriteEvent | FileDeleteEvent>; sessionId: string }) {
  const openDiff = useUI((s) => s.openDiff);
  const projectId = useSessions((s) => s.sessions[sessionId]?.projectId);
  const root = useProjects((s) => s.projects.find((p) => p.id === projectId)?.path);
  const setGit = useProjects((s) => s.setGit);
  const abs = (path: string) => (root && !isAbsolutePath(path) ? joinPath(root, path) : path);
  const run = async (label: string, path: string, fn: (rel: string) => Promise<unknown>) => {
    if (!isTauri || !root) return toast.info(`${label} needs the desktop app and a project`);
    try {
      await fn(relativeTo(root, path));
      toast.success(label, { description: relativeTo(root, path), origin: null });
      const g = await gitSummary(root);
      if (g && projectId) setGit(projectId, g);
    } catch (e) {
      toast.error(`${label} failed`, { description: e instanceof Error ? e.message : String(e) });
    }
  };
  return (
    <Row>
      <div className="flex flex-col font-mono">
      {events.map((e) => {
        const kind = e.type === 'file_delete' ? 'D' : e.kind;
        const dir = dirname(e.path);
        const name = basename(e.path);
        return (
          <ContextMenu key={e.id}>
            <ContextMenuTrigger asChild>
              <button
                type="button"
                onClick={() => openDiff(e.path, sessionId)}
                className={cn(
                  'group/file -ml-1.5 flex h-[22px] w-[calc(100%+6px)] items-center gap-2.5 rounded-[5px] pl-1.5 pr-2 text-left text-[12.5px] outline-none transition-colors duration-(--motion-fast)',
                  'hover:bg-surface-hover focus-visible:bg-surface-hover',
                )}
              >
                <span
                  className={cn(
                    'inline-flex w-[14px] shrink-0 justify-center font-mono text-[11.5px] font-semibold',
                    kind === 'M' && 'text-warning',
                    kind === 'A' && 'text-success',
                    kind === 'D' && 'text-danger',
                  )}
                >
                  {kind}
                </span>
                <span className="min-w-0 truncate font-mono text-[12px]">
                  {dir !== e.path ? <span className="text-muted">{truncateMiddle(dir, 40)}/</span> : null}
                  <span className="text-primary/90">{name}</span>
                </span>
                {e.type === 'file_write' ? (
                  <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-3 font-mono text-[11.5px] tabular">
                    {e.additions > 0 ? <span className="text-success">+{e.additions}</span> : null}
                    {e.deletions > 0 ? <span className="text-danger">−{e.deletions}</span> : null}
                  </span>
                ) : null}
                <FileDiff className="size-[12px] shrink-0 text-muted opacity-0 transition-opacity group-hover/file:opacity-100" />
              </button>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem icon={<FileDiff />} onSelect={() => openDiff(e.path, sessionId)}>
                {t('Open diff')}
              </ContextMenuItem>
              <ContextMenuItem icon={<ExternalLink />} onSelect={() => void openPath(abs(e.path))}>
                {t('Open file')}
              </ContextMenuItem>
              <ContextMenuItem
                icon={<Copy />}
                onSelect={() => {
                  void copyText(e.path);
                  toast.neutral(t('Path copied'));
                }}
              >
                {t('Copy path')}
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem icon={<GitCommitHorizontal />} onSelect={() => void run(t('Staged'), e.path, (rel) => git.stage(root!, rel))}>
                {t('Stage')}
              </ContextMenuItem>
              <ContextMenuItem icon={<RotateCcw />} danger onSelect={() => void run(t('Reverted'), e.path, (rel) => git.discard(root!, rel))}>
                {t('Revert')}
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        );
      })}
      </div>
    </Row>
  );
});
