import { useEffect, useState } from 'react';
import { Trash2, ArrowRightLeft, FolderOpen } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { t } from '@/i18n';
import { useProjects } from '@/stores/projects';
import { useUI } from '@/stores/ui';
import { useCapabilities } from '@/stores/capabilities';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/TextInput';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { LivingBox, LivingItem, LivingReveal } from '@/components/ui/Living';
import { ClaudeLogo } from '@/features/agent/BrandIcon';
import { PERMISSION_MODES } from '@/features/agent/permissionMode';
import { revealInFileManager } from '@/native/system';
import { toast } from '@/features/notifications/toast-store';
import { useSubagentEditor, useAgentEditor } from './editor';
import { deleteSubagent, importSubagentAsAgent, readSubagent, writeSubagent, type Subagent, type SubagentScope } from './subagents';

/**
 * Claude Code's own subagents, edited in place: the frontmatter as fields
 * (name, when Claude should delegate to it, its tools, its model, its
 * permission mode) and the system prompt underneath. The file lands in
 * `~/.claude/agents/` or the project's `.claude/agents/`.
 */
export function SubagentEditorDialog() {
  const target = useSubagentEditor((s) => s.target);
  const close = useSubagentEditor((s) => s.close);
  return (
    <Dialog open={!!target} onOpenChange={(v) => !v && close()}>
      <DialogContent size="lg">{target ? <SubagentForm key={target.path ?? 'new'} path={target.path} initialScope={target.scope} onDone={close} /> : null}</DialogContent>
    </Dialog>
  );
}

const BLANK: Subagent = { path: '', scope: 'user', name: '', description: '', tools: '', model: '', permissionMode: '', extra: [], body: '' };

function SubagentForm({ path, initialScope, onDone }: { path?: string; initialScope?: SubagentScope; onDone: () => void }) {
  const projects = useProjects((s) => s.projects);
  const activeProjectId = useUI((s) => s.activeProjectId);
  const project = projects.find((p) => p.id === activeProjectId) ?? projects[0];
  const info = useCapabilities(useShallow((s) => Object.values(s.assets).flatMap((a) => a.data.agents).find((a) => a.path === path)));
  const [draft, setDraft] = useState<Subagent>(() => ({ ...BLANK, scope: initialScope ?? 'user' }));
  const [loaded, setLoaded] = useState(!path);
  const [scope, setScope] = useState<SubagentScope>(initialScope ?? 'user');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const patch = (p: Partial<Subagent>) => setDraft((d) => ({ ...d, ...p }));

  // An existing file: read it once.
  useEffect(() => {
    if (!path || !info) return;
    let alive = true;
    void readSubagent(info)
      .then((s) => {
        if (!alive) return;
        setDraft(s);
        if (s.scope !== 'plugin') setScope(s.scope);
        setLoaded(true);
      })
      .catch((e) => {
        toast.error(t('Could not read the subagent'), { description: String(e) });
        onDone();
      });
    return () => {
      alive = false;
    };
  }, [path, info, onDone]);

  const readOnly = draft.scope === 'plugin';
  const valid = draft.name.trim().length > 0 && draft.body.trim().length > 0 && !readOnly;
  const save = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      const target = await writeSubagent(draft, scope, project?.path);
      toast.success(t('Subagent saved'), { description: target });
      onDone();
    } catch (e) {
      toast.error(t('Could not save the subagent'), { description: String(e) });
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    try {
      await deleteSubagent(draft, project?.path);
      onDone();
    } catch (e) {
      toast.error(t('Could not delete the subagent'), { description: String(e) });
    }
  };
  const toZpace = () => {
    const a = importSubagentAsAgent(draft);
    onDone();
    useAgentEditor.getState().open(a.id);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="flex min-h-0 flex-col"
    >
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ClaudeLogo size={15} />
          {path ? t('Edit Claude Code subagent') : t('New Claude Code subagent')}
        </DialogTitle>
        <DialogDescription>{t('A Markdown file Claude Code delegates to on its own when the description matches, or when you ask for it by name. Lives in ~/.claude/agents or the project’s .claude/agents.')}</DialogDescription>
      </DialogHeader>
      <DialogBody className="flex min-h-[360px] flex-col gap-4 pb-3">
        {!loaded ? (
          <div className="text-[12.5px] text-muted">{t('Reading…')}</div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <label className="flex flex-col gap-1">
                <span className="text-[11.5px] text-secondary">{t('Name')}</span>
                <TextInput autoFocus value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder="code-reviewer" mono disabled={readOnly} />
              </label>
              <div className="flex flex-col gap-1">
                <span className="text-[11.5px] text-secondary">{t('Where')}</span>
                {readOnly ? (
                  <span className="inline-flex h-8 items-center rounded-md bg-surface-inset px-2.5 text-[12px] text-muted">{t('Plugin (read-only)')}</span>
                ) : (
                  <SegmentedControl<SubagentScope> size="sm" value={scope} onChange={setScope} options={[{ value: 'user', label: t('User') }, { value: 'project', label: project ? project.name : t('Project') }]} aria-label={t('Where')} />
                )}
              </div>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] text-secondary">{t('When to use it')}</span>
              <TextInput value={draft.description} onChange={(e) => patch({ description: e.target.value })} placeholder={t('Expert code review specialist. Use proactively after code changes.')} disabled={readOnly} />
              <span className="text-[11px] leading-relaxed text-muted">{t('Claude reads this to decide when to delegate. "Use proactively" makes it reach for it on its own.')}</span>
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11.5px] text-secondary">{t('Tools')}</span>
                <TextInput value={draft.tools} onChange={(e) => patch({ tools: e.target.value })} placeholder={t('all')} mono disabled={readOnly} />
                <span className="text-[11px] leading-relaxed text-muted">{t('Comma-separated tool names limit what it may use; empty = every tool the session has.')}</span>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11.5px] text-secondary">{t('Model')}</span>
                <Select size="sm" value={draft.model || 'inherit'} onChange={(v) => patch({ model: v === 'inherit' ? '' : v })} options={[{ value: 'inherit', label: t('Same as the session') }, { value: 'opus', label: 'Opus' }, { value: 'sonnet', label: 'Sonnet' }, { value: 'haiku', label: 'Haiku' }]} align="start" className="w-full" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11.5px] text-secondary">{t('Permissions')}</span>
                <Select size="sm" value={draft.permissionMode || 'inherit'} onChange={(v) => patch({ permissionMode: v === 'inherit' ? '' : v })} options={[{ value: 'inherit', label: t('Same as the session') }, ...PERMISSION_MODES.map((m) => ({ value: m.id, label: t(m.label), hint: t(m.hint) }))]} align="start" className="w-full" />
              </label>
            </div>
            <label className="flex min-h-0 flex-col gap-1">
              <span className="text-[11.5px] text-secondary">{t('System prompt')}</span>
              <Textarea value={draft.body} onChange={(e) => patch({ body: e.target.value })} minRows={8} maxRows={18} placeholder={t('You are a senior code reviewer. When invoked: run git diff, focus on the changed files, review for…')} readOnly={readOnly} className="rounded-md bg-surface-inset px-3 py-2 font-mono text-[12px] leading-[1.6]" />
            </label>
            {draft.extra.length ? <div className="text-[11px] text-muted">{t('Other frontmatter kept as is: {keys}', { keys: draft.extra.map(([k]) => k).join(', ') })}</div> : null}
            {path ? (
              <LivingBox clip={false} className="mt-auto flex flex-col gap-2">
                <LivingItem still className="flex flex-wrap items-center gap-2">
                  <Button size="xs" variant="ghost" type="button" leading={<ArrowRightLeft />} onClick={toZpace}>
                    {t('Make a Zpace agent from it')}
                  </Button>
                  <Button size="xs" variant="ghost" type="button" leading={<FolderOpen />} onClick={() => void revealInFileManager(draft.path)}>
                    {t('Show file')}
                  </Button>
                  <span className="flex-1" />
                  {!readOnly ? (
                    <button type="button" onClick={() => setConfirmDelete((v) => !v)} className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-muted press hover:bg-surface-hover hover:text-danger">
                      <Trash2 className="size-[13px]" /> {t('Delete')}
                    </button>
                  ) : null}
                </LivingItem>
                <LivingReveal open={confirmDelete}>
                  <div className="flex items-center gap-2 rounded-md bg-danger-soft px-3 py-2 text-[12px] text-danger">
                    <span className="min-w-0 flex-1">{t('The file goes to the recycle bin.')}</span>
                    <Button size="xs" variant="danger" type="button" onClick={() => void remove()}>
                      {t('Delete')}
                    </Button>
                  </div>
                </LivingReveal>
              </LivingBox>
            ) : null}
          </>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" size="sm" type="button" onClick={onDone}>
          {readOnly ? t('Close') : t('Cancel')}
        </Button>
        {!readOnly ? (
          <Button variant="primary" size="sm" type="submit" disabled={!valid || busy}>
            {busy ? t('Saving…') : path ? t('Save') : t('Create subagent')}
          </Button>
        ) : null}
      </DialogFooter>
    </form>
  );
}
