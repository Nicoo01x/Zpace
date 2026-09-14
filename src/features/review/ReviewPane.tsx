import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Undo2, FilePlus2, Columns2, Rows3, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import { LivingItem, LivingList, LivingSwitch } from '@/components/ui/Living';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/cn';
import { springs } from '@/lib/motion';
import { basename } from '@/lib/format';
import { readTextFile } from '@/native/system';
import { useReview, pendingFor, allFor, hunksBetween, splitLines, type Hunk, type Snapshot } from '@/stores/review';
import { useTouched, touchKey } from '@/stores/touched';
import { useSessions } from '@/stores/sessions';
import { useProjects } from '@/stores/projects';
import { useSettings } from '@/stores/settings';
import { mentionPath } from '@/features/sessions/useWorkspaceActions';
import { FileIcon } from '@/features/files/FileIcon';
import { languageFor } from '@/features/files/languages';
import MonacoDiff from '@/features/files/MonacoDiff';
import { Tooltip } from '@/components/ui/Tooltip';
import { toast } from '@/features/notifications/toast-store';
import { t } from '@/i18n';

/**
 * Review what the agent wrote in a session: the files on the left with their
 * +/− counts, the diff on the right as hunks against the baseline taken when
 * the agent first touched each file. Keep or discard per file or per hunk —
 * a discard writes the old lines back to disk, a keep moves the baseline so
 * the hunk stops showing. Keeping everything empties the review.
 */
const CONTEXT = 3;

export function ReviewPane({ sessionId }: { sessionId: string }) {
  const [mode, setMode] = useState<'pending' | 'all'>('pending');
  const pendingFiles = useReview(useShallow((s) => pendingFor(s.pending, sessionId)));
  const allFiles = useReview(useShallow((s) => allFor(s.pending, sessionId)));
  const files = mode === 'all' ? allFiles : pendingFiles;
  const session = useSessions((s) => s.sessions[sessionId]);
  const project = useProjects((s) => s.projects.find((p) => p.id === session?.projectId));
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = files.find((f) => f.key === selectedKey) ?? files[0] ?? null;
  const [sideBySide, setSideBySide] = useState(false);
  const rel = (path: string) => (project ? mentionPath(project.path, path) : path);

  return (
    <div className="@container flex h-full min-h-0 flex-col @[680px]:flex-row">
      <aside data-review-files className="flex w-full shrink-0 flex-col self-stretch hairline-b @[680px]:min-h-0 @[680px]:w-[280px] @[680px]:hairline-r">
        <div className="flex h-9 items-center gap-1.5 whitespace-nowrap px-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-muted hairline-b">
          <button type="button" onClick={() => setMode('pending')} className={cn('rounded-[4px] px-1.5 py-0.5', mode === 'pending' ? 'bg-surface-active text-primary' : 'hover:bg-surface-hover')}>
            {t('To review')} {pendingFiles.length}
          </button>
          <button type="button" onClick={() => setMode('all')} className={cn('rounded-[4px] px-1.5 py-0.5', mode === 'all' ? 'bg-surface-active text-primary' : 'hover:bg-surface-hover')}>
            {t('All')} {allFiles.length}
          </button>
          <span className="flex-1" />
          {files.length ? (
            <>
              <button type="button" onClick={() => useReview.getState().keepAll(sessionId)} className="rounded-[4px] px-1.5 py-0.5 normal-case tracking-normal text-success hover:bg-surface-hover">
                {t('Keep all')}
              </button>
              <button
                type="button"
                onClick={() => void useReview.getState().discardAll(sessionId).catch((e: unknown) => toast.error(t('Could not discard'), { description: String(e) }))}
                className="rounded-[4px] px-1.5 py-0.5 normal-case tracking-normal text-danger hover:bg-surface-hover"
              >
                {t('Discard all')}
              </button>
            </>
          ) : null}
        </div>
        <LivingList className="flex max-h-[132px] min-h-0 flex-col overflow-y-auto py-1 @[680px]:max-h-none @[680px]:flex-1">
          {files.length === 0 ? <div className="px-3 py-6 text-[12px] leading-relaxed text-muted">{mode === 'all' ? t('The agent has not written files in this session.') : t('Nothing to review — the agent has not written files in this session since the last review.')}</div> : null}
          {files.map((f) => (
            <LivingItem key={f.key}>
              <FileRow snap={f} rel={rel(f.path)} active={selected?.key === f.key} onSelect={() => setSelectedKey(f.key)} />
            </LivingItem>
          ))}
        </LivingList>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <LivingSwitch k={selected?.key ?? ''} className="flex min-h-0 flex-1 flex-col">
          {selected ? (
            <FileReview key={selected.key} snap={selected} rel={rel(selected.path)} sideBySide={sideBySide} onToggleView={() => setSideBySide((v) => !v)} />
          ) : (
            <div className="flex flex-1 items-center justify-center text-[12.5px] text-muted">{t('Pick a file to see its changes.')}</div>
          )}
        </LivingSwitch>
      </div>
    </div>
  );
}

/** Stats of a file against its baseline, from what is on disk right now. */
function useCurrent(snap: Snapshot) {
  const version = useTouched((s) => s.files[touchKey(snap.path)]?.version ?? 0);
  const [current, setCurrent] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const reload = useCallback(() => {
    readTextFile(snap.path)
      .then((text) => {
        setCurrent(text);
        setMissing(false);
      })
      .catch(() => {
        setCurrent('');
        setMissing(true);
      });
  }, [snap.path]);
  useEffect(() => {
    reload();
  }, [reload, version, snap.before]);
  const hunks = useMemo(() => (current === null ? [] : hunksBetween(snap.before, current)), [current, snap.before]);
  const additions = hunks.reduce((n, h) => n + h.modLines.length, 0);
  const deletions = hunks.reduce((n, h) => n + h.origLines.length, 0);
  return { current, missing, hunks, additions, deletions, reload };
}

function FileRow({ snap, rel, active, onSelect }: { snap: Snapshot; rel: string; active: boolean; onSelect: () => void }) {
  const { hunks, additions, deletions } = useCurrent(snap);
  const name = basename(snap.path);
  const dir = rel.slice(0, Math.max(0, rel.length - name.length - 1));
  return (
    <div className="px-1.5">
      <div className={cn('group/row flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px]', active ? 'bg-surface-active text-primary' : 'text-secondary hover:bg-surface-hover hover:text-primary')}>
        <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <FileIcon name={name} size={14} />
          <span className="min-w-0 flex-1 truncate">
            {name}
            {dir ? <span className="ml-1.5 text-[11px] text-muted">{dir}</span> : null}
          </span>
          {snap.before === null ? (
            <Tooltip content={t('Created by the agent')} side="top">
              <FilePlus2 className="size-[12px] text-success" />
            </Tooltip>
          ) : null}
          {snap.kept ? <span className="rounded-[3px] bg-success/12 px-1 text-[10px] font-medium uppercase tracking-[0.04em] text-success">{t('kept')}</span> : null}
          <span className="shrink-0 font-mono text-[11px] tabular">
            {additions ? <span className="text-success">+{additions}</span> : null}
            {additions && deletions ? ' ' : ''}
            {deletions ? <span className="text-danger">−{deletions}</span> : null}
            {!hunks.length ? <span className="text-muted">{t('same')}</span> : null}
          </span>
        </button>
        <span className="hidden shrink-0 items-center gap-0.5 group-hover/row:inline-flex">
          <Tooltip content={t('Keep file')} side="top">
            <button type="button" aria-label={t('Keep file')} onClick={() => useReview.getState().keepFile(snap.sessionId, snap.key)} className="inline-flex size-5 items-center justify-center rounded text-success hover:bg-surface-active">
              <Check className="size-[13px]" />
            </button>
          </Tooltip>
          <Tooltip content={snap.before === null ? t('Discard file (moves it to the bin)') : t('Discard file (restores the original)')} side="top">
            <button type="button" aria-label={t('Discard file')} onClick={() => void useReview.getState().discardFile(snap.sessionId, snap.key).catch((e: unknown) => toast.error(t('Could not discard'), { description: String(e) }))} className="inline-flex size-5 items-center justify-center rounded text-danger hover:bg-surface-active">
              <Undo2 className="size-[13px]" />
            </button>
          </Tooltip>
        </span>
      </div>
    </div>
  );
}

function FileReview({ snap, rel, sideBySide, onToggleView }: { snap: Snapshot; rel: string; sideBySide: boolean; onToggleView: () => void }) {
  const { current, missing, hunks, additions, deletions, reload } = useCurrent(snap);
  const theme = useSettings((s) => s.theme);
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const lines = useMemo(() => splitLines(current ?? ''), [current]);
  const discard = (h: Hunk) =>
    useReview
      .getState()
      .discardHunk(snap.sessionId, snap.key, h)
      .then(reload)
      .catch((e: unknown) => toast.error(t('Could not discard'), { description: e instanceof Error ? e.message : String(e) }));
  return (
    <>
      <div className="flex h-9 shrink-0 items-center gap-2 overflow-hidden px-3 text-[12px] hairline-b">
        <FileIcon name={basename(snap.path)} size={14} />
        <span className="min-w-0 flex-1 truncate font-mono text-primary">{rel}</span>
        <span className="hidden shrink-0 whitespace-nowrap font-mono text-[11px] tabular text-muted @[560px]:inline">
          <span className="text-success">+{additions}</span> <span className="text-danger">−{deletions}</span> · {t('{n} hunks', { n: hunks.length })}
        </span>
        <Tooltip content={t('Reload from disk')} side="bottom">
          <button type="button" onClick={reload} className="inline-flex size-6 items-center justify-center rounded text-muted hover:bg-surface-hover hover:text-primary">
            <RefreshCw className="size-[12px]" />
          </button>
        </Tooltip>
        <Tooltip content={sideBySide ? t('Hunks') : t('Side by side')} side="bottom">
          <button type="button" onClick={onToggleView} className="inline-flex size-6 items-center justify-center rounded text-muted hover:bg-surface-hover hover:text-primary">
            {sideBySide ? <Rows3 className="size-[13px]" /> : <Columns2 className="size-[13px]" />}
          </button>
        </Tooltip>
        <button type="button" onClick={() => useReview.getState().keepFile(snap.sessionId, snap.key)} className="inline-flex h-6 items-center gap-1 rounded-md bg-success/12 px-2 text-[11.5px] font-medium text-success hover:bg-success/20">
          <Check className="size-[12px]" /> <span className="hidden @[460px]:inline">{t('Keep file')}</span>
        </button>
        <button type="button" onClick={() => void useReview.getState().discardFile(snap.sessionId, snap.key).catch((e: unknown) => toast.error(t('Could not discard'), { description: String(e) }))} className="inline-flex h-6 items-center gap-1 rounded-md bg-danger/10 px-2 text-[11.5px] font-medium text-danger hover:bg-danger/20">
          <Undo2 className="size-[12px]" /> <span className="hidden @[460px]:inline">{t('Discard file')}</span>
        </button>
      </div>
      {current === null ? null : missing ? (
        <div className="flex flex-1 items-center justify-center text-[12.5px] text-muted">{t('The file is gone from disk.')}</div>
      ) : sideBySide ? (
        <div className="min-h-0 flex-1">
          <MonacoDiff original={snap.before ?? ''} modified={current} language={languageFor(snap.path)} inline={false} theme={dark ? 'conduit-dark' : 'conduit-light'} />
        </div>
      ) : hunks.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-[12.5px] text-muted">{t('Identical to the baseline — nothing left to review here.')}</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <div className="flex flex-col gap-3">
            {hunks.map((h, i) => (
              <HunkCard key={h.id} hunk={h} index={i} lines={lines} onKeep={() => useReview.getState().keepHunk(snap.sessionId, snap.key, h)} onDiscard={() => void discard(h)} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function HunkCard({ hunk, index, lines, onKeep, onDiscard }: { hunk: Hunk; index: number; lines: string[]; onKeep: () => void; onDiscard: () => void }) {
  const beforeCtx = lines.slice(Math.max(0, hunk.modStart - 1 - CONTEXT), hunk.modStart - 1);
  const afterStart = hunk.modStart - 1 + hunk.modLines.length;
  const afterCtx = lines.slice(afterStart, afterStart + CONTEXT);
  let modNo = hunk.modStart - beforeCtx.length;
  let origNo = hunk.origStart - beforeCtx.length;
  const rows: Array<{ kind: ' ' | '+' | '-'; text: string; o?: number; m?: number }> = [];
  for (const text of beforeCtx) rows.push({ kind: ' ', text, o: origNo++, m: modNo++ });
  for (const text of hunk.origLines) rows.push({ kind: '-', text, o: origNo++ });
  for (const text of hunk.modLines) rows.push({ kind: '+', text, m: modNo++ });
  for (const text of afterCtx) rows.push({ kind: ' ', text, o: origNo++, m: modNo++ });
  return (
    <motion.section layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springs.snappy, delay: Math.min(0.2, index * 0.03) }} data-hunk className="overflow-hidden rounded-lg bg-surface-raised shadow-[0_0_0_1px_var(--border)]">
      <div className="flex h-8 items-center gap-2 bg-surface-inset px-3 font-mono text-[11px] text-muted">
        <span className="truncate whitespace-nowrap">
          @@ −{hunk.origStart},{hunk.origLines.length} +{hunk.modStart},{hunk.modLines.length} @@
        </span>
        <span className="flex-1" />
        <button type="button" onClick={onKeep} className="inline-flex h-6 items-center gap-1 rounded px-1.5 font-sans text-[11.5px] font-medium text-success hover:bg-surface-hover">
          <Check className="size-[12px]" /> {t('Keep')}
        </button>
        <button type="button" onClick={onDiscard} className="inline-flex h-6 items-center gap-1 rounded px-1.5 font-sans text-[11.5px] font-medium text-danger hover:bg-surface-hover">
          <Undo2 className="size-[12px]" /> {t('Discard')}
        </button>
      </div>
      <div className="overflow-x-auto py-1 font-mono text-[12px] leading-[20px]">
        {rows.map((r, i) => (
          <div
            key={i}
            className={cn('flex whitespace-pre', r.kind === '+' && 'bg-[color-mix(in_srgb,var(--success)_12%,transparent)]', r.kind === '-' && 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]')}
          >
            <span className="w-11 shrink-0 select-none pr-2 text-right text-[11px] text-muted">{r.o ?? ''}</span>
            <span className="w-11 shrink-0 select-none pr-2 text-right text-[11px] text-muted">{r.m ?? ''}</span>
            <span className={cn('w-5 shrink-0 select-none text-center', r.kind === '+' ? 'text-success' : r.kind === '-' ? 'text-danger' : 'text-muted')}>{r.kind === ' ' ? '' : r.kind}</span>
            <span className={cn('pr-4', r.kind === '+' ? 'text-primary' : r.kind === '-' ? 'text-secondary line-through decoration-danger/40' : 'text-secondary')}>{r.text}</span>
          </div>
        ))}
      </div>
    </motion.section>
  );
}
