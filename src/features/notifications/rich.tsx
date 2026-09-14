import { GitCommit, ArrowUpFromLine, ArrowDownToLine } from 'lucide-react';
import { ClaudeLogo } from '@/features/agent/BrandIcon';
import { FilesTouched, Steps } from './RichContent';
import { useSessions } from '@/stores/sessions';
import { t } from '@/i18n';
import { toast } from './toast-store';
import { celebrate } from '@/features/mascot/celebrate';
import { pullTrick } from '@/features/mascot/useMascot';

/**
 * Rich toast content: what the plain title cannot say. Claude's own mark, the
 * files a turn touched with their +/− lines, a commit's hash and file count,
 * a push shown as steps lighting up — sileo renders any React node as the
 * description and any node as the icon.
 */

/** Files written during a session's last turn (from its file_write events), newest last. */
export function touchedFilesOf(sessionId: string, sinceMs = 0): Array<{ path: string; add: number; del: number; kind: 'A' | 'M' }> {
  const evs = useSessions.getState().events[sessionId] ?? [];
  const byPath = new Map<string, { path: string; add: number; del: number; kind: 'A' | 'M' }>();
  for (const e of evs) {
    if (e.type !== 'file_write' || e.timestamp < sinceMs) continue;
    const cur = byPath.get(e.path) ?? { path: e.path, add: 0, del: 0, kind: e.kind };
    cur.add += e.additions;
    cur.del += e.deletions;
    if (e.kind === 'A') cur.kind = 'A';
    byPath.set(e.path, cur);
  }
  return Array.from(byPath.values());
}

/** "Claude finished": the mark, the project · session, the files it wrote, a button to open the chat. */
export function claudeFinishedToast(opts: { sessionId: string; title: string; project?: string; sinceMs?: number; open: () => void; review?: () => void }) {
  const files = touchedFilesOf(opts.sessionId, opts.sinceMs);
  const adds = files.reduce((n, f) => n + f.add, 0);
  const dels = files.reduce((n, f) => n + f.del, 0);
  const summary = files.length ? t('{n} files · +{a} −{d}', { n: files.length, a: adds, d: dels }) : t('No files changed');
  toast.success(t('Claude finished'), {
    key: `done:${opts.sessionId}`,
    icon: <ClaudeLogo size={16} />,
    mark: 'claude',
    summary: `${opts.project ? `${opts.project} · ` : ''}${opts.title} · ${summary}`,
    description: (
      <div>
        <div style={{ opacity: 0.8 }}>
          {opts.project ? `${opts.project} · ` : ''}
          {opts.title} · {summary}
        </div>
        <FilesTouched files={files} />
      </div>
    ),
    action: files.length && opts.review ? { label: t('Review changes'), onClick: opts.review } : { label: t('Open'), onClick: opts.open },
    duration: files.length ? 9000 : 5000,
  });
}

/** "Claude needs you": the mark, what it wants, a button to answer in the chat. */
export function claudePermissionToast(opts: { sessionId: string; title: string; project?: string; detail?: string; open: () => void }) {
  toast.warning(t('Permission required'), {
    key: `perm:${opts.sessionId}`,
    icon: <ClaudeLogo size={16} />,
    mark: 'claude',
    description: opts.detail ?? `${opts.project ? `${opts.project} · ` : ''}${opts.title}`,
    action: { label: t('Answer'), onClick: opts.open },
    duration: 0,
  });
}

/** A commit: hash, message and how many files went in. */
export function commitToast(opts: { hash?: string; message: string; files: number; branch?: string; avatar?: string; author?: string }) {
  celebrate('commit');
  pullTrick('orbit');
  toast.success(t('Committed'), {
    mark: 'commit',
    summary: `${opts.hash ? `${opts.hash.slice(0, 7)} · ` : ''}${opts.message} · ${t('{n} files', { n: opts.files })}${opts.branch ? ` · ${opts.branch}` : ''}`,
    icon: opts.avatar ? <img src={opts.avatar} alt={opts.author ?? ''} width={18} height={18} referrerPolicy="no-referrer" style={{ borderRadius: 999, display: 'block' }} /> : <GitCommit size={15} />,
    description: (
      <div>
        <div className="toast-files">
          <div>
            {opts.hash ? <span className="add">{opts.hash.slice(0, 7)}</span> : null}
            <span className="name">{opts.message}</span>
          </div>
        </div>
        <div style={{ opacity: 0.75, marginTop: 2 }}>
          {t('{n} files', { n: opts.files })}
          {opts.branch ? ` · ${opts.branch}` : ''}
        </div>
      </div>
    ),
  });
}

/** Push / pull as one pill that morphs from "sending" to done, with the steps lighting up. */
export function gitTransferToast<T>(kind: 'push' | 'pull' | 'fetch', p: Promise<T>, opts: { branch?: string; remote?: string }): Promise<T> {
  const icon = kind === 'push' ? <ArrowUpFromLine size={15} /> : <ArrowDownToLine size={15} />;
  const where = [opts.remote, opts.branch].filter(Boolean).join('/');
  const labels = kind === 'push' ? [t('pack'), t('upload'), t('remote')] : kind === 'pull' ? [t('fetch'), t('merge'), t('tree')] : [t('remote'), t('refs')];
  if (kind === 'push') {
    void p.then(() => {
      celebrate('push');
      pullTrick('comet');
    }, () => void 0);
  }
  return toast.promise(p, { loading: kind === 'push' ? t('Pushing…') : kind === 'pull' ? t('Pulling…') : t('Fetching…'), success: kind === 'push' ? t('Pushed') : kind === 'pull' ? t('Pull completed') : t('Fetched'), error: kind === 'push' ? t('Push failed') : kind === 'pull' ? t('Pull failed') : t('Fetch failed') }, {
    icon,
    mark: kind === 'push' ? 'push' : 'pull',
    summary: where,
    description: (
      <div>
        {where ? <div style={{ opacity: 0.75 }}>{where}</div> : null}
        <Steps labels={labels} at={1} />
      </div>
    ),
    successDescription: (
      <div>
        {where ? <div style={{ opacity: 0.75 }}>{where}</div> : null}
        <Steps labels={labels} at={labels.length} />
      </div>
    ),
  });
}
