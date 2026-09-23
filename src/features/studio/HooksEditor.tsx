import { useCallback, useEffect, useState } from 'react';
import { t } from '@/i18n';
import { useStudio } from '@/stores/studio';
import { TextInput } from '@/components/ui/TextInput';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { toast } from '@/features/notifications/toast-store';
import { deleteHook, HOOK_EVENTS, readHooks, writeHook, type HookEvent, type HookRow } from './files';
import { DeleteInline, Field, FieldBox, PendingBar, SaveButton, StageHeader } from './parts';
import { useUnsavedGuard } from './guard';
import type { ResolvedScope } from './scope';

/**
 * One hook: the event, which tools it matches, the command Claude Code
 * runs, how long it may take. Written under `hooks` in the scope's
 * settings.json; the file's other keys stay as they were.
 */
const EVENT_HINT: Record<HookEvent, () => string> = {
  PreToolUse: () => t('Before a tool runs — a non-zero exit blocks it.'),
  PostToolUse: () => t('After a tool ran.'),
  UserPromptSubmit: () => t('When the user sends a message.'),
  Notification: () => t('When Claude Code notifies.'),
  Stop: () => t('When Claude finishes a turn.'),
  SubagentStop: () => t('When a subagent finishes.'),
  SessionStart: () => t('When a session starts.'),
  SessionEnd: () => t('When a session ends.'),
  PreCompact: () => t('Before the context is compacted.'),
};
const MATCHABLE = new Set<HookEvent>(['PreToolUse', 'PostToolUse', 'PreCompact', 'SessionStart']);
const BLANK: HookRow = { id: '', event: 'PreToolUse', matcher: '', command: '', timeout: '' };
const same = (r: HookRow) => JSON.stringify([r.event, r.matcher.trim(), r.command.trim(), r.timeout.trim()]);

export function HooksEditor({ scope, id }: { scope: ResolvedScope; id: string | null }) {
  const [doc, setDoc] = useState<HookRow | null>(id ? null : BLANK);
  const [saved, setSaved] = useState<HookRow | null>(id ? null : BLANK);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    void readHooks(scope.settings)
      .then((rows) => {
        if (!alive) return;
        const r = rows.find((x) => x.id === id);
        if (!r) {
          setError(t('This hook is gone.'));
          return;
        }
        setDoc(r);
        setSaved(r);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [id, scope.settings]);
  const dirty = !!doc && !!saved && same(doc) !== same(saved);
  useUnsavedGuard(dirty);
  const patch = (p: Partial<HookRow>) => setDoc((d) => (d ? { ...d, ...p } : d));
  const valid = !!doc && doc.command.trim().length > 0;

  const save = useCallback(async (): Promise<boolean> => {
    if (!doc || !valid) return false;
    setBusy(true);
    try {
      const newId = await writeHook(scope.settings, doc);
      const next = { ...doc, id: newId };
      setDoc(next);
      setSaved(next);
      const studio = useStudio.getState();
      studio.bump();
      studio.setDirty(false);
      if (studio.selected !== newId || studio.draft) studio.go('hooks', newId);
      return true;
    } catch (e) {
      toast.error(t('Could not save the hook'), { description: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      setBusy(false);
    }
  }, [doc, valid, scope.settings]);
  useEffect(() => {
    if (!dirty) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save, dirty]);

  const remove = async () => {
    if (!doc?.id) return;
    try {
      await deleteHook(scope.settings, doc.id);
      useStudio.getState().setDirty(false);
      useStudio.getState().go('hooks');
      useStudio.getState().bump();
    } catch (e) {
      toast.error(t('Could not remove the hook'), { description: e instanceof Error ? e.message : String(e) });
    }
  };

  if (error) return <div className="px-7 py-6 text-[12.5px] text-danger">{error}</div>;
  if (!doc) return null;
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <PendingBar onSave={save} busy={busy} />
      <StageHeader
        kicker={
          <>
            <span>{t('Hook')}</span>
            <span className="text-muted/60">·</span>
            <span className="normal-case tracking-normal">{scope.kind === 'user' ? '~/.claude/settings.json' : '.claude/settings.json'}</span>
          </>
        }
        title={
          <div className="flex items-center gap-3">
            <Select<HookEvent> size="md" value={doc.event} onChange={(v) => patch({ event: v, matcher: MATCHABLE.has(v) ? doc.matcher : '' })} options={HOOK_EVENTS.map((e) => ({ value: e, label: e, hint: EVENT_HINT[e]() }))} align="start" className="h-9 font-mono text-[15px] font-medium" aria-label={t('Event')} />
            <span className="text-[12px] text-secondary">{EVENT_HINT[doc.event]()}</span>
          </div>
        }
        actions={<SaveButton dirty={dirty && valid} busy={busy} onSave={save} label={id ? undefined : t('Add hook')} />}
      />
      <FieldBox className="grid-cols-[1fr_140px]">
        {MATCHABLE.has(doc.event) ? (
          <Field label={t('Matcher')} hint={t('Bash, Edit|Write, mcp__.* — empty matches everything.')}>
            <TextInput value={doc.matcher} onChange={(e) => patch({ matcher: e.target.value })} placeholder="Bash" mono />
          </Field>
        ) : (
          <div />
        )}
        <Field label={t('Timeout, seconds')}>
          <TextInput value={doc.timeout} onChange={(e) => patch({ timeout: e.target.value.replace(/[^\d]/g, '') })} placeholder="60" mono inputMode="numeric" />
        </Field>
        <Field label={t('Command')} className="col-span-2" hint={t('The event arrives as JSON on stdin; exit 2 blocks the action.')}>
          <Textarea value={doc.command} onChange={(e) => patch({ command: e.target.value })} minRows={3} maxRows={10} placeholder={'jq -r \'.tool_input.command\' | grep -q "rm -rf" && exit 2 || exit 0'} spellCheck={false} autoFocus={!id} className="rounded-md bg-surface px-3 py-2 font-mono text-[12px] leading-[1.6] shadow-[inset_0_0_0_1px_var(--border)]" />
        </Field>
      </FieldBox>
      {id ? <DeleteInline onDelete={() => void remove()} what={t('Removed from settings.json.')} /> : null}
    </div>
  );
}
