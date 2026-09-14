import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { History, RotateCcw, Columns2, FileText } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/cn';
import { springs } from '@/lib/motion';
import { formatRelative } from '@/lib/format';
import { useSessions } from '@/stores/sessions';
import { useReview } from '@/stores/review';
import { useSettings } from '@/stores/settings';
import { touchKey } from '@/stores/touched';
import { writeTextFile } from '@/native/system';
import { toast } from '@/features/notifications/toast-store';
import { ClaudeLogo } from '@/features/agent/BrandIcon';
import MonacoDiff from '../MonacoDiff';
import MonacoEditor from '../MonacoEditor';
import { t } from '@/i18n';

/**
 * The Timeline lens: every edit an agent made to this file, in order, as a
 * step on a rail. Pick a step to see the file as it was then (or the change
 * itself against the step before), and put any of them back on disk. The
 * versions are rebuilt from the session's baseline snapshot plus each edit's
 * old/new text — when the baseline is missing, the rail starts at the first
 * full write it knows.
 */
interface Step {
  id: string;
  at: number;
  title: string;
  session: string;
  /** Full content at this step, when it could be rebuilt. */
  content: string | null;
  additions: number;
  deletions: number;
  kind: 'origin' | 'edit' | 'now';
}

function countDiff(a: string, b: string): { additions: number; deletions: number } {
  const x = a.split('\n');
  const y = b.split('\n');
  const setX = new Map<string, number>();
  for (const l of x) setX.set(l, (setX.get(l) ?? 0) + 1);
  let common = 0;
  for (const l of y) {
    const n = setX.get(l) ?? 0;
    if (n > 0) {
      common++;
      setX.set(l, n - 1);
    }
  }
  return { additions: y.length - common, deletions: x.length - common };
}

export function TimelineLens({ path, current, language, onRestored }: { path: string; current: string; language: string; onRestored: () => void }) {
  const key = touchKey(path);
  const { sessions, events } = useSessions(useShallow((s) => ({ sessions: s.sessions, events: s.events })));
  const baseline = useReview(useShallow((s) => Object.values(s.pending).map((m) => Object.values(m).find((x) => x.key === key)).filter(Boolean).sort((a, b) => a!.at - b!.at)[0] ?? null));
  const theme = useSettings((s) => s.theme);
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [mode, setMode] = useState<'state' | 'change'>('change');

  const steps = useMemo<Step[]>(() => {
    const edits: Array<{ at: number; session: string; before?: string; after?: string; full: boolean; id: string }> = [];
    for (const s of Object.values(sessions)) {
      for (const e of events[s.id] ?? []) {
        if (e.type !== 'file_write' || touchKey(e.path) !== key || e.failed) continue;
        edits.push({ at: e.timestamp, session: s.title, before: e.before, after: e.after, full: e.kind === 'A' && e.after !== undefined && e.before === undefined, id: e.id });
      }
    }
    edits.sort((a, b) => a.at - b.at);
    const out: Step[] = [];
    let content: string | null = baseline?.before ?? null;
    if (content !== null) out.push({ id: 'origin', at: baseline?.at ?? 0, title: t('Original'), session: '', content, additions: 0, deletions: 0, kind: 'origin' });
    for (const e of edits) {
      // A full write is the new content; an edit replaces its old text inside what we have; anything else loses the thread.
      let next: string | null;
      if (e.full && e.after !== undefined) next = e.after;
      else if (content !== null && e.before !== undefined && e.after !== undefined && content.includes(e.before)) next = content.replace(e.before, e.after);
      else if (content === null && e.after !== undefined && e.before === undefined) next = e.after;
      else next = null;
      const counts = next !== null && content !== null ? countDiff(content, next) : e.before !== undefined && e.after !== undefined ? countDiff(e.before, e.after) : { additions: 0, deletions: 0 };
      out.push({ id: e.id, at: e.at, title: t('Edit'), session: e.session, content: next, additions: counts.additions, deletions: counts.deletions, kind: 'edit' });
      content = next;
    }
    const last = out[out.length - 1];
    if (!last || last.content !== current) out.push({ id: 'now', at: 0, title: t('Now'), session: '', content: current, additions: last?.content ? countDiff(last.content, current).additions : 0, deletions: last?.content ? countDiff(last.content, current).deletions : 0, kind: 'now' });
    return out;
  }, [sessions, events, key, baseline, current]);

  const [index, setIndex] = useState<number | null>(null);
  const sel = Math.min(index ?? steps.length - 1, steps.length - 1);
  const step = steps[sel];
  const prev = steps[sel - 1];
  const restore = async () => {
    if (!step || step.content === null) return;
    try {
      await writeTextFile(path, step.content);
      toast.success(t('Version restored'), { description: `${step.title} · ${formatRelative(step.at)}`, mark: 'note' });
      onRestored();
    } catch (e) {
      toast.error(t('Could not restore'), { description: String(e) });
    }
  };

  if (steps.length <= 1) {
    return <div className="flex h-full items-center justify-center px-8 text-center text-[12.5px] text-muted">{t('No agent edits to this file yet — the timeline fills in as Claude works on it.')}</div>;
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-4 pb-2 pt-3 hairline-b">
        <div className="flex items-center gap-3 text-[11.5px] text-muted">
          <History className="size-[13px]" />
          <span className="tabular">{t('{n} steps', { n: steps.length })}</span>
          <span className="flex-1" />
          <div className="inline-flex h-6 items-stretch overflow-hidden rounded-md bg-surface-inset text-[11.5px]">
            <button type="button" onClick={() => setMode('change')} className={cn('inline-flex items-center gap-1 px-2', mode === 'change' ? 'bg-surface-active text-primary' : 'text-secondary hover:text-primary')}>
              <Columns2 className="size-[12px]" /> {t('Change')}
            </button>
            <button type="button" onClick={() => setMode('state')} className={cn('inline-flex items-center gap-1 px-2', mode === 'state' ? 'bg-surface-active text-primary' : 'text-secondary hover:text-primary')}>
              <FileText className="size-[12px]" /> {t('State')}
            </button>
          </div>
          <button type="button" disabled={!step || step.content === null || step.kind === 'now'} onClick={() => void restore()} className="inline-flex h-6 items-center gap-1 rounded-md bg-accent-soft px-2 text-[11.5px] font-medium text-accent hover:brightness-95 disabled:opacity-40">
            <RotateCcw className="size-[12px]" /> {t('Restore this version')}
          </button>
        </div>
        {/* the rail */}
        <div className="relative mt-3 flex items-center gap-0 overflow-x-auto pb-2">
          {steps.map((s, i) => (
            <div key={s.id} className="flex items-center">
              {i > 0 ? <span className={cn('h-px w-8 shrink-0', i <= sel ? 'bg-accent' : 'bg-border')} /> : null}
              <button type="button" onClick={() => setIndex(i)} className="group/step relative flex shrink-0 flex-col items-center">
                <motion.span layout transition={springs.snappy} className={cn('flex size-6 items-center justify-center rounded-full text-[10px] font-semibold shadow-[0_0_0_1px_var(--border)]', i === sel ? 'bg-accent text-inverse shadow-none' : i < sel ? 'bg-accent-soft text-accent' : 'bg-surface-inset text-muted')}>
                  {s.kind === 'origin' ? '0' : s.kind === 'now' ? '•' : i}
                </motion.span>
                <span className={cn('mt-1 max-w-[92px] truncate text-[10px]', i === sel ? 'text-primary' : 'text-muted')}>{s.kind === 'edit' ? formatRelative(s.at) : s.title}</span>
              </button>
            </div>
          ))}
        </div>
        {step ? (
          <div className="mt-1 flex items-center gap-2 text-[12px]">
            {step.kind === 'edit' ? <ClaudeLogo size={12} /> : null}
            <span className="font-medium text-primary">{step.title}</span>
            {step.session ? <span className="truncate text-secondary">· {step.session}</span> : null}
            {step.kind !== 'origin' ? (
              <span className="font-mono text-[11px] tabular">
                <span className="text-success">+{step.additions}</span> <span className="text-danger">−{step.deletions}</span>
              </span>
            ) : null}
            <span className="ml-auto text-[11px] text-muted">{step.kind === 'now' ? t('On disk') : formatRelative(step.at)}</span>
          </div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1">
        {step?.content === null ? (
          <div className="flex h-full items-center justify-center px-8 text-center text-[12.5px] text-muted">{t('This step could not be rebuilt in full (the baseline is missing); the change itself is in the session.')}</div>
        ) : mode === 'change' && prev && prev.content !== null && step ? (
          <MonacoDiff original={prev.content} modified={step.content ?? ''} language={language} inline={false} theme={dark ? 'conduit-dark' : 'conduit-light'} />
        ) : step ? (
          <MonacoEditor value={step.content ?? ''} onChange={() => void 0} language={language} readOnly theme={dark ? 'conduit-dark' : 'conduit-light'} />
        ) : null}
      </div>
    </div>
  );
}
