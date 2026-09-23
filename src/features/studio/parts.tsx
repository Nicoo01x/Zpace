import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import { unfold } from '@/lib/motion';
import { useStudio } from '@/stores/studio';
import { useSettings } from '@/stores/settings';
import { Button } from '@/components/ui/Button';
import { LivingBox, LivingItem, LivingReveal } from '@/components/ui/Living';
import { Spinner } from '@/components/ui/Spinner';

/**
 * The pieces every editor on the stage is built from: the header (kicker,
 * title, actions), a labelled field, the save button that says "Saved" for
 * a beat, the inline delete confirmation, the unsaved-changes bar, and the
 * Markdown editor (Monaco, loaded when first needed).
 */

const MonacoEditor = lazy(() => import('@/features/files/MonacoEditor'));

export function StageHeader({ kicker, title, actions }: { kicker: ReactNode; title: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-start gap-4 px-7 pb-4 pt-6">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 truncate whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.05em] text-muted">{kicker}</div>
        <div className="mt-1 min-w-0">{title}</div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1.5 pt-1">{actions}</div> : null}
    </div>
  );
}

/** The thing's name, as a title that is also an input: big, quiet, no box until it is focused. */
export function TitleInput({ value, onChange, placeholder, mono, readOnly, autoFocus }: { value: string; onChange: (v: string) => void; placeholder: string; mono?: boolean; readOnly?: boolean; autoFocus?: boolean }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      readOnly={readOnly}
      autoFocus={autoFocus}
      spellCheck={false}
      aria-label={t('Name')}
      className={cn(
        '-ml-2 w-full min-w-0 rounded-md bg-transparent px-2 py-0.5 text-[22px] font-semibold leading-tight tracking-[-0.01em] text-primary outline-none placeholder:font-normal placeholder:text-muted',
        'transition-[background-color,box-shadow] duration-(--motion-fast) hover:bg-surface-inset focus:bg-surface-inset focus:shadow-[0_0_0_3px_var(--accent-soft)]',
        mono && 'font-mono text-[19px] font-medium',
        readOnly && 'pointer-events-none',
      )}
    />
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-[11.5px] text-secondary">{label}</span>
      {children}
      {hint ? <span className="text-[11px] leading-relaxed text-muted">{hint}</span> : null}
    </label>
  );
}

/** A group of fields on a tonal inset — one surface, no ring. */
export function FieldBox({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-7 grid gap-3 rounded-[12px] bg-surface-inset p-4', className)}>{children}</div>;
}

/** Save: enabled while dirty; after a save it says "Saved" with a check for a beat. */
export function SaveButton({ dirty, busy, onSave, label }: { dirty: boolean; busy: boolean; onSave: () => Promise<boolean>; label?: string }) {
  const [savedAt, setSavedAt] = useState(0);
  const [now, setNow] = useState(0);
  // "Saved" shows for a beat after a save, and never while there are new changes.
  useEffect(() => {
    if (!savedAt) return;
    const id = window.setTimeout(() => setNow(Date.now()), 1400);
    return () => window.clearTimeout(id);
  }, [savedAt]);
  const saved = !dirty && savedAt > 0 && now < savedAt + 1400;
  return (
    <Button variant="primary" size="md" className="min-w-[88px] rounded-full px-4" disabled={(!dirty && !saved) || busy} loading={busy} onClick={() => void onSave().then((ok) => ok && setSavedAt(Date.now()))}>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span key={saved ? 'saved' : 'save'} initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 3 }} transition={unfold.in} className="inline-flex items-center gap-1.5">
          {saved ? (
            <>
              <Check className="size-[14px]" /> {t('Saved')}
            </>
          ) : (
            (label ?? t('Save'))
          )}
        </motion.span>
      </AnimatePresence>
    </Button>
  );
}

/** Delete with an inline confirmation instead of a dialog — the row itself asks. */
export function DeleteInline({ onDelete, what }: { onDelete: () => void; what: string }) {
  const [open, setOpen] = useState(false);
  return (
    <LivingBox clip={false} className="mx-7 mt-auto flex flex-col gap-2 pb-5 pt-3">
      <LivingItem still className="flex items-center">
        <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-muted press hover:bg-surface-hover hover:text-danger">
          <Trash2 className="size-[13px]" /> {t('Delete')}
        </button>
      </LivingItem>
      <LivingReveal open={open}>
        <div className="flex items-center gap-2 rounded-md bg-danger-soft px-3 py-2 text-[12px] text-danger">
          <span className="min-w-0 flex-1">{what}</span>
          <Button size="xs" variant="danger" onClick={onDelete}>
            {t('Delete')}
          </Button>
        </div>
      </LivingReveal>
    </LivingBox>
  );
}

/** Shown over the editor when the user tried to leave with unsaved changes: save first, or drop them. */
export function PendingBar({ onSave, busy }: { onSave: () => Promise<boolean>; busy: boolean }) {
  const pending = useStudio((s) => s.pending);
  const cancel = useStudio((s) => s.cancelPending);
  // The move happens after the editor let go of its changes (saved, or dropped), so `go` is not parked again; the
  // target is taken before saving because a save may navigate (to the item it just created) and clear `pending`.
  const leave = (target = useStudio.getState().pending) => {
    if (!target) return;
    useStudio.getState().setDirty(false);
    useStudio.getState().go(target.kind, target.selected, target.draft);
  };
  const saveAndLeave = () => {
    const target = useStudio.getState().pending;
    void onSave().then((ok) => ok && leave(target));
  };
  return (
    <AnimatePresence>
      {pending ? (
        <motion.div key="pending" initial={unfold.from} animate={unfold.to} exit={{ ...unfold.gone, transition: unfold.out }} transition={unfold.in} className="absolute inset-x-7 top-4 z-10 flex items-center gap-3 rounded-[12px] bg-surface-raised px-4 py-2.5 text-[12.5px] shadow-popover">
          <span className="min-w-0 flex-1 text-primary">{t('Unsaved changes here.')}</span>
          <Button size="sm" variant="ghost" onClick={cancel}>
            {t('Stay')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => leave()}>
            {t('Discard')}
          </Button>
          <Button size="sm" variant="primary" className="rounded-full" loading={busy} onClick={saveAndLeave}>
            {t('Save and go')}
          </Button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** Monaco for the body of a skill, an agent, a command or a memory file. */
export function MarkdownEditor({ value, onChange, language = 'markdown', readOnly, path }: { value: string; onChange: (v: string) => void; language?: string; readOnly?: boolean; path?: string }) {
  const theme = useSettings((s) => s.theme);
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  return (
    <div className="relative min-h-0 flex-1">
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-muted">
            <Spinner size={14} />
          </div>
        }
      >
        <MonacoEditor value={value} onChange={onChange} language={language} readOnly={!!readOnly} theme={dark ? 'conduit-dark' : 'conduit-light'} findPath={path} wrap={language === 'markdown'} />
      </Suspense>
    </div>
  );
}

/** One quiet line, centred, the action inline. */
export function Empty({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 items-center justify-center px-7 text-center text-[13px] text-muted">{children}</div>;
}
