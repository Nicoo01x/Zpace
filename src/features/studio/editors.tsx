import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, FileText, FolderOpen, MessageSquare, Play } from 'lucide-react';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import { useStudio, type StudioKind } from '@/stores/studio';
import { useCapabilities } from '@/stores/capabilities';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { TextInput } from '@/components/ui/TextInput';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { Tooltip } from '@/components/ui/Tooltip';
import { PERMISSION_MODES } from '@/features/agent/permissionMode';
import { deleteSubagent, parseSubagent, serializeSubagent, slugOf, writeSubagent, type Subagent } from '@/features/agents/subagents';
import { toast } from '@/features/notifications/toast-store';
import { readTextFile, revealInFileManager, writeTextFile, joinPath } from '@/native/system';
import { languageFor } from '@/features/files/languages';
import { BLANK_COMMAND, BLANK_SKILL, deleteCommand, deleteSkill, readCommand, readMemory, readSkill, serializeCommand, serializeSkill, writeCommand, writeMemory, writeSkill, type CommandDoc, type SkillDoc } from './files';
import { askBuilder, startTest } from './builder';
import { DeleteInline, Field, FieldBox, MarkdownEditor, PendingBar, SaveButton, StageHeader, TitleInput } from './parts';
import { useUnsavedGuard } from './guard';
import type { ResolvedScope } from './scope';

/**
 * The editors of the Markdown kinds — a skill, a subagent, a command, a
 * memory file — and of any text file inside a skill's folder. Each reads
 * its file once, keeps a draft and the saved copy, and knows it is dirty
 * by comparing what it would write. Saving a new one lands on the file it
 * created; the rail follows because the catalogs re-scan.
 */
function useDoc<T>(load: (() => Promise<T>) | null, blank: T | null, serialize: (d: T) => string) {
  const [doc, setDoc] = useState<T | null>(blank);
  const [saved, setSaved] = useState<T | null>(blank);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!load) return;
    let alive = true;
    load()
      .then((d) => {
        if (!alive) return;
        setDoc(d);
        setSaved(d);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [load]);
  const dirty = !!doc && !!saved && serialize(doc) !== serialize(saved);
  useUnsavedGuard(dirty);
  const patch = useCallback((p: Partial<T>) => setDoc((d) => (d ? { ...d, ...p } : d)), []);
  return { doc, setDoc, saved, setSaved, dirty, error, patch };
}

/** After a write: the catalogs re-scan, and the stage lands on the file (a draft becomes the thing it created). */
function landOn(scope: ResolvedScope, kind: StudioKind, id: string) {
  void useCapabilities.getState().loadAssets(scope.project?.path, true);
  const studio = useStudio.getState();
  studio.bump();
  studio.setDirty(false);
  if (studio.selected !== id || studio.draft) studio.go(kind, id);
}

/** Ctrl+S saves whatever editor is on the stage. */
function useSaveKey(save: () => Promise<boolean>, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save, enabled]);
}

function SourceKicker({ scope, locked, what }: { scope: ResolvedScope; locked?: boolean; what: string }) {
  return (
    <>
      <span>{what}</span>
      <span className="text-muted/60">·</span>
      <span>{locked ? t('plugin, read-only') : scope.label}</span>
    </>
  );
}

function AskButton({ scope, text }: { scope: ResolvedScope; text: string }) {
  return (
    <Tooltip content={t('Ask the builder to improve it')} side="bottom">
      <Button size="md" variant="ghost" className="rounded-full" leading={<MessageSquare className="size-[14px]" />} onClick={() => askBuilder(scope, text)}>
        {t('Ask Claude')}
      </Button>
    </Tooltip>
  );
}

function RevealButton({ path }: { path: string }) {
  return (
    <IconButton label={t('Show file')} size="md" onClick={() => void revealInFileManager(path)}>
      <FolderOpen />
    </IconButton>
  );
}

function Failed({ error }: { error: string }) {
  return <div className="px-7 py-6 text-[12.5px] text-danger">{error}</div>;
}

/* -------------------------------- skill -------------------------------- */

export function SkillEditor({ scope, id, locked }: { scope: ResolvedScope; id: string | null; locked?: boolean }) {
  const load = useCallback(() => (id ? readSkill(id) : Promise.resolve(BLANK_SKILL)), [id]);
  const { doc, saved, setSaved, dirty, error, patch } = useDoc<SkillDoc>(id ? load : null, id ? null : BLANK_SKILL, serializeSkill);
  const [busy, setBusy] = useState(false);
  const [sub, setSub] = useState<string | null>(null);
  const valid = !!doc && doc.name.trim().length > 0 && !locked;

  const save = useCallback(async (): Promise<boolean> => {
    if (!doc || !valid) return false;
    setBusy(true);
    try {
      const target = await writeSkill(doc, scope);
      setSaved(doc);
      landOn(scope, 'skills', target);
      return true;
    } catch (e) {
      toast.error(t('Could not save the skill'), { description: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      setBusy(false);
    }
  }, [doc, valid, scope, setSaved]);
  useSaveKey(save, dirty && !sub);

  const remove = async () => {
    if (!doc) return;
    try {
      await deleteSkill(doc);
      toast.success(t('Skill deleted'), { description: doc.folder });
      useStudio.getState().setDirty(false);
      useStudio.getState().go('skills');
      void useCapabilities.getState().loadAssets(scope.project?.path, true);
      useStudio.getState().bump();
    } catch (e) {
      toast.error(t('Could not delete the skill'), { description: e instanceof Error ? e.message : String(e) });
    }
  };

  if (error) return <Failed error={error} />;
  if (!doc) return null;
  if (sub && saved) return <SubFileEditor folder={saved.folder} rel={sub} onBack={() => setSub(null)} readOnly={locked} />;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <PendingBar onSave={save} busy={busy} />
      <StageHeader
        kicker={<SourceKicker scope={scope} locked={locked} what={t('Skill')} />}
        title={<TitleInput value={doc.name} onChange={(v) => patch({ name: v })} placeholder={t('skill-name')} readOnly={locked} autoFocus={!id} />}
        actions={
          <>
            {id ? <AskButton scope={scope} text={t('Improve the skill at {path}: ', { path: id })} /> : null}
            {id ? <RevealButton path={id} /> : null}
            {!locked ? <SaveButton dirty={dirty && valid} busy={busy} onSave={save} label={id ? undefined : t('Create skill')} /> : null}
          </>
        }
      />
      <FieldBox className="grid-cols-[1fr_180px_auto]">
        <Field label={t('When to use it')} className="col-span-3">
          <TextInput value={doc.description} onChange={(e) => patch({ description: e.target.value })} placeholder={t('What it does and when Claude should reach for it — this line is what triggers it.')} disabled={locked} />
        </Field>
        <Field label={t('Argument hint')}>
          <TextInput value={doc.argumentHint} onChange={(e) => patch({ argumentHint: e.target.value })} placeholder="[file] [--flag]" mono disabled={locked} />
        </Field>
        <Field label={t('Folder')}>
          <span className="inline-flex h-8 items-center truncate font-mono text-[11.5px] text-muted">{doc.folder ? doc.folder.split(/[\\/]/).slice(-2).join('/') : t('skills/{name}', { name: slugOf(doc.name) || '…' })}</span>
        </Field>
        <Field label={t('Callable as /{name}', { name: slugOf(doc.name) || '…' })} className="items-start">
          <span className="inline-flex h-8 items-center">
            <Switch checked={doc.userInvocable} onCheckedChange={(v) => patch({ userInvocable: v })} disabled={locked} aria-label={t('User-invocable')} />
          </span>
        </Field>
      </FieldBox>
      {doc.files.length ? (
        <div className="flex flex-wrap items-center gap-1.5 px-7 pt-3">
          <span className="text-[11px] text-muted">{t('In the folder')}</span>
          {doc.files.map((f) => (
            <button key={f} type="button" onClick={() => setSub(f)} className="inline-flex h-6 items-center gap-1 rounded-md bg-surface-inset px-2 font-mono text-[11px] text-secondary press hover:bg-surface-hover hover:text-primary">
              <FileText className="size-[11px]" /> {f}
            </button>
          ))}
        </div>
      ) : null}
      <div className="px-7 pb-1 pt-4 text-[11.5px] text-secondary">{t('Instructions')}</div>
      <div className="mx-7 mb-5 flex min-h-0 flex-1 overflow-hidden rounded-[12px] bg-surface-inset">
        <MarkdownEditor value={doc.body} onChange={(v) => patch({ body: v })} readOnly={locked} path={id ?? undefined} />
      </div>
      {id && !locked ? <DeleteInline onDelete={() => void remove()} what={t('The whole folder goes to the recycle bin.')} /> : null}
    </div>
  );
}

/** Any text file inside a skill's folder (references/, scripts/…), edited in place. */
function SubFileEditor({ folder, rel, onBack, readOnly }: { folder: string; rel: string; onBack: () => void; readOnly?: boolean }) {
  const path = joinPath(folder, rel);
  const load = useCallback(() => readTextFile(path).then((text) => ({ text })), [path]);
  const { doc, setSaved, dirty, error, patch } = useDoc<{ text: string }>(load, null, (d) => d.text);
  const [busy, setBusy] = useState(false);
  const save = useCallback(async (): Promise<boolean> => {
    if (!doc || readOnly) return false;
    setBusy(true);
    try {
      await writeTextFile(path, doc.text);
      setSaved(doc);
      return true;
    } catch (e) {
      toast.error(t('Save failed'), { description: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      setBusy(false);
    }
  }, [doc, path, readOnly, setSaved]);
  useSaveKey(save, dirty);
  if (error) return <Failed error={error} />;
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <PendingBar onSave={save} busy={busy} />
      <StageHeader
        kicker={
          <button type="button" onClick={onBack} className="inline-flex items-center gap-1 rounded-sm text-muted normal-case tracking-normal hover:text-primary">
            <ArrowLeft className="size-[12px]" /> {t('Back to the skill')}
          </button>
        }
        title={<div className="truncate font-mono text-[17px] font-medium text-primary">{rel}</div>}
        actions={
          <>
            <RevealButton path={path} />
            {!readOnly ? <SaveButton dirty={dirty} busy={busy} onSave={save} /> : null}
          </>
        }
      />
      <div className="mx-7 mb-5 flex min-h-0 flex-1 overflow-hidden rounded-[12px] bg-surface-inset">{doc ? <MarkdownEditor value={doc.text} onChange={(v) => patch({ text: v })} language={languageFor(rel)} readOnly={readOnly} path={path} /> : null}</div>
    </div>
  );
}

/* -------------------------------- agent -------------------------------- */

const BLANK_AGENT: Subagent = { path: '', scope: 'user', name: '', description: '', tools: '', model: '', permissionMode: '', extra: [], body: '' };

export function AgentEditor({ scope, id, locked }: { scope: ResolvedScope; id: string | null; locked?: boolean }) {
  const load = useCallback(() => (id ? readTextFile(id).then((text) => parseSubagent(text, id, locked ? 'plugin' : scope.kind)) : Promise.resolve(BLANK_AGENT)), [id, locked, scope.kind]);
  const { doc, setSaved, dirty, error, patch } = useDoc<Subagent>(id ? load : null, id ? null : { ...BLANK_AGENT, scope: scope.kind }, serializeSubagent);
  const [busy, setBusy] = useState(false);
  const valid = !!doc && doc.name.trim().length > 0 && doc.body.trim().length > 0 && !locked;
  const testing = useStudio((s) => s.testing[scope.key]?.agent);

  const save = useCallback(async (): Promise<boolean> => {
    if (!doc || !valid) return false;
    setBusy(true);
    try {
      const target = await writeSubagent(doc, scope.kind, scope.project?.path);
      setSaved({ ...doc, path: target });
      landOn(scope, 'agents', target);
      return true;
    } catch (e) {
      toast.error(t('Could not save the subagent'), { description: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      setBusy(false);
    }
  }, [doc, valid, scope, setSaved]);
  useSaveKey(save, dirty);

  const remove = async () => {
    if (!doc) return;
    try {
      await deleteSubagent(doc, scope.project?.path);
      useStudio.getState().setDirty(false);
      useStudio.getState().go('agents');
      useStudio.getState().bump();
    } catch (e) {
      toast.error(t('Could not delete the subagent'), { description: e instanceof Error ? e.message : String(e) });
    }
  };

  if (error) return <Failed error={error} />;
  if (!doc) return null;
  const name = slugOf(doc.name);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <PendingBar onSave={save} busy={busy} />
      <StageHeader
        kicker={<SourceKicker scope={scope} locked={locked} what={t('Subagent')} />}
        title={<TitleInput value={doc.name} onChange={(v) => patch({ name: v })} placeholder="code-reviewer" mono readOnly={locked} autoFocus={!id} />}
        actions={
          <>
            {id ? <AskButton scope={scope} text={t('Improve the subagent at {path}: ', { path: id })} /> : null}
            {id ? <RevealButton path={id} /> : null}
            {id ? (
              <Tooltip content={t('Talk to it in the chat column, as the session itself')} side="bottom">
                <Button size="md" variant={testing === name ? 'subtle' : 'default'} className="rounded-full" leading={<Play className="size-[13px]" />} onClick={() => void startTest(scope, name)}>
                  {t('Test')}
                </Button>
              </Tooltip>
            ) : null}
            {!locked ? <SaveButton dirty={dirty && valid} busy={busy} onSave={save} label={id ? undefined : t('Create subagent')} /> : null}
          </>
        }
      />
      <FieldBox className="grid-cols-3">
        <Field label={t('When to use it')} className="col-span-3">
          <TextInput value={doc.description} onChange={(e) => patch({ description: e.target.value })} placeholder={t('Expert code review specialist. Use proactively after code changes.')} disabled={locked} />
        </Field>
        <Field label={t('Tools')}>
          <TextInput value={doc.tools} onChange={(e) => patch({ tools: e.target.value })} placeholder={t('all')} mono disabled={locked} />
        </Field>
        <Field label={t('Model')}>
          <Select size="md" value={doc.model || 'inherit'} onChange={(v) => patch({ model: v === 'inherit' ? '' : v })} options={[{ value: 'inherit', label: t('Same as the session') }, { value: 'opus', label: 'Opus' }, { value: 'sonnet', label: 'Sonnet' }, { value: 'haiku', label: 'Haiku' }]} align="start" className="w-full" />
        </Field>
        <Field label={t('Permissions')}>
          <Select size="md" value={doc.permissionMode || 'inherit'} onChange={(v) => patch({ permissionMode: v === 'inherit' ? '' : v })} options={[{ value: 'inherit', label: t('Same as the session') }, ...PERMISSION_MODES.map((m) => ({ value: m.id, label: t(m.label), hint: t(m.hint) }))]} align="start" className="w-full" />
        </Field>
      </FieldBox>
      <div className="px-7 pb-1 pt-4 text-[11.5px] text-secondary">{t('System prompt')}</div>
      <div className="mx-7 mb-5 flex min-h-0 flex-1 overflow-hidden rounded-[12px] bg-surface-inset">
        <MarkdownEditor value={doc.body} onChange={(v) => patch({ body: v })} readOnly={locked} path={id ?? undefined} />
      </div>
      {id && !locked ? <DeleteInline onDelete={() => void remove()} what={t('The file goes to the recycle bin.')} /> : null}
    </div>
  );
}

/* ------------------------------- command ------------------------------- */

export function CommandEditor({ scope, id, locked }: { scope: ResolvedScope; id: string | null; locked?: boolean }) {
  const load = useCallback(() => (id ? readCommand(id) : Promise.resolve(BLANK_COMMAND)), [id]);
  const { doc, setSaved, dirty, error, patch } = useDoc<CommandDoc>(id ? load : null, id ? null : BLANK_COMMAND, serializeCommand);
  const [busy, setBusy] = useState(false);
  const valid = !!doc && doc.name.trim().length > 0 && doc.body.trim().length > 0 && !locked;

  const save = useCallback(async (): Promise<boolean> => {
    if (!doc || !valid) return false;
    setBusy(true);
    try {
      const target = await writeCommand(doc, scope);
      setSaved({ ...doc, path: target });
      landOn(scope, 'commands', target);
      return true;
    } catch (e) {
      toast.error(t('Could not save the command'), { description: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      setBusy(false);
    }
  }, [doc, valid, scope, setSaved]);
  useSaveKey(save, dirty);

  const remove = async () => {
    if (!doc) return;
    try {
      await deleteCommand(doc);
      useStudio.getState().setDirty(false);
      useStudio.getState().go('commands');
      void useCapabilities.getState().loadAssets(scope.project?.path, true);
      useStudio.getState().bump();
    } catch (e) {
      toast.error(t('Could not delete the command'), { description: e instanceof Error ? e.message : String(e) });
    }
  };

  if (error) return <Failed error={error} />;
  if (!doc) return null;
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <PendingBar onSave={save} busy={busy} />
      <StageHeader
        kicker={<SourceKicker scope={scope} locked={locked} what={t('Command')} />}
        title={
          <div className="flex items-baseline">
            <span className={cn('font-mono text-[19px] font-medium text-muted', locked && 'opacity-60')}>/</span>
            <TitleInput value={doc.name} onChange={(v) => patch({ name: v })} placeholder="review-pr" mono readOnly={locked} autoFocus={!id} />
          </div>
        }
        actions={
          <>
            {id ? <AskButton scope={scope} text={t('Improve the command at {path}: ', { path: id })} /> : null}
            {id ? <RevealButton path={id} /> : null}
            {!locked ? <SaveButton dirty={dirty && valid} busy={busy} onSave={save} label={id ? undefined : t('Create command')} /> : null}
          </>
        }
      />
      <FieldBox className="grid-cols-[1fr_200px]">
        <Field label={t('Description')}>
          <TextInput value={doc.description} onChange={(e) => patch({ description: e.target.value })} placeholder={t('What it does, in one line')} disabled={locked} />
        </Field>
        <Field label={t('Argument hint')}>
          <TextInput value={doc.argumentHint} onChange={(e) => patch({ argumentHint: e.target.value })} placeholder="[pr-number]" mono disabled={locked} />
        </Field>
      </FieldBox>
      <div className="flex items-baseline gap-2 px-7 pb-1 pt-4 text-[11.5px] text-secondary">
        {t('Prompt')}
        <span className="font-mono text-[11px] text-muted">{t('$ARGUMENTS is what follows the command')}</span>
      </div>
      <div className="mx-7 mb-5 flex min-h-0 flex-1 overflow-hidden rounded-[12px] bg-surface-inset">
        <MarkdownEditor value={doc.body} onChange={(v) => patch({ body: v })} readOnly={locked} path={id ?? undefined} />
      </div>
      {id && !locked ? <DeleteInline onDelete={() => void remove()} what={t('The file goes to the recycle bin.')} /> : null}
    </div>
  );
}

/* -------------------------------- memory ------------------------------- */

export function MemoryEditor({ scope, path, label }: { scope: ResolvedScope; path: string; label: string }) {
  const load = useCallback(() => readMemory(path), [path]);
  const { doc, setSaved, dirty, error, patch } = useDoc<{ text: string; exists: boolean }>(load, null, (d) => d.text);
  const [busy, setBusy] = useState(false);

  const save = useCallback(async (): Promise<boolean> => {
    if (!doc) return false;
    setBusy(true);
    try {
      await writeMemory(path, doc.text);
      setSaved({ ...doc, exists: true });
      useStudio.getState().bump();
      return true;
    } catch (e) {
      toast.error(t('Save failed'), { description: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      setBusy(false);
    }
  }, [doc, path, setSaved]);
  useSaveKey(save, dirty);

  if (error) return <Failed error={error} />;
  if (!doc) return null;
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <PendingBar onSave={save} busy={busy} />
      <StageHeader
        kicker={<SourceKicker scope={scope} what={t('Memory')} />}
        title={<div className="truncate font-mono text-[19px] font-medium text-primary">{label}</div>}
        actions={
          <>
            <AskButton scope={scope} text={doc.exists ? t('Improve {path}: ', { path }) : t('Write {path} for me: ', { path })} />
            {doc.exists ? <RevealButton path={path} /> : null}
            <SaveButton dirty={dirty || !doc.exists} busy={busy} onSave={save} label={doc.exists ? undefined : t('Create file')} />
          </>
        }
      />
      <div className="mx-7 mb-5 flex min-h-0 flex-1 overflow-hidden rounded-[12px] bg-surface-inset">
        <MarkdownEditor value={doc.text} onChange={(v) => patch({ text: v })} path={path} />
      </div>
    </div>
  );
}
