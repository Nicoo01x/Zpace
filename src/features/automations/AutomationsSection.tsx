import { useState } from 'react';
import { Plus, Play, Trash2, Pencil, Eye, Clock, CalendarClock, Terminal, MessageSquare } from 'lucide-react';
import { useAutomations, describeTrigger, type Automation, type Trigger, type Action } from '@/stores/automations';
import { useProjects } from '@/stores/projects';
import { Switch } from '@/components/ui/Switch';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/TextInput';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { MacFolder } from '@/components/ui/MacFolder';
import { ClaudeLogo } from '@/features/agent/BrandIcon';
import { fire } from './runner';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/cn';
import { LivingBox, LivingItem, LivingList, LivingReveal, LivingSwitch } from '@/components/ui/Living';
import { t } from '@/i18n';

/**
 * Settings › Automations: the list (name, trigger, action, last run, on/off,
 * run now) and a small form to add or edit one. Triggers: files change
 * under a path, every N minutes, daily at a time. Actions: a prompt to
 * Claude (`{files}` = the files that changed) or a command, with an
 * optional prompt for when it fails.
 */
export function AutomationsSection() {
  const items = useAutomations((s) => s.items);
  const projects = useProjects((s) => s.projects);
  const [editing, setEditing] = useState<Automation | 'new' | null>(null);
  const projectOf = (id: string) => projects.find((p) => p.id === id);
  return (
    <LivingBox clip={false} className="flex flex-col gap-4">
      <LivingItem still className="flex items-center justify-between">
        <div>
          <div className="text-[13px] font-medium text-primary">{t('Automations')}</div>
          <div className="mt-0.5 text-[12px] text-secondary">{t('When files change or on a schedule: send Claude a prompt, or run a command and hand Claude the failure.')}</div>
        </div>
        <Button size="sm" onClick={() => setEditing('new')} disabled={projects.length === 0}>
          <Plus className="size-[13px]" /> {t('New automation')}
        </Button>
      </LivingItem>
      <LivingReveal open={!!editing}>
        <Form initial={editing === 'new' ? null : (editing as Automation)} onDone={() => setEditing(null)} />
      </LivingReveal>
      {items.length === 0 && !editing ? (
        <LivingItem className="rounded-lg bg-surface-inset px-4 py-6 text-center text-[12.5px] text-muted">{t('Nothing automated yet. Try: when src/**/*.ts changes → run "npm test", and if it fails ask Claude to fix it.')}</LivingItem>
      ) : (
        <LivingList className="flex flex-col gap-2">
          {items.map((a) => {
            const p = projectOf(a.projectId);
            return (
              <LivingItem key={a.id} still className={cn('flex items-start gap-3 rounded-lg px-3 py-2.5 shadow-[0_0_0_1px_var(--border)]', !a.enabled && 'opacity-60')}>
                <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-inset text-secondary">
                  {a.trigger.kind === 'watch' ? <Eye className="size-[14px]" /> : a.trigger.kind === 'interval' ? <Clock className="size-[14px]" /> : <CalendarClock className="size-[14px]" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[13px]">
                    <span className="truncate font-medium text-primary">{a.name}</span>
                    {p ? (
                      <span className="inline-flex items-center gap-1 text-[11.5px] text-muted">
                        <MacFolder color={p.color || undefined} size={12} /> {p.name}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-secondary">
                    <span className="font-mono">{describeTrigger(a.trigger)}</span>
                    <span className="text-muted">→</span>
                    <span className="inline-flex items-center gap-1">
                      {a.action.kind === 'prompt' ? <ClaudeLogo size={11} /> : <Terminal className="size-[11px]" />}
                      <span className="truncate font-mono">{a.action.kind === 'prompt' ? a.action.text.slice(0, 60) : a.action.command}</span>
                    </span>
                  </div>
                  {a.lastRun ? (
                    <div className="mt-0.5 text-[11px] text-muted">
                      {t('Last run {when}', { when: formatRelative(a.lastRun) })}
                      {a.lastResult ? ` · ${a.lastResult}` : ''} · {t('{n} runs', { n: a.runs })}
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => void fire(a)} title={t('Run now')} aria-label={t('Run now')}>
                    <Play className="size-[13px]" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(a)} aria-label={t('Edit')}>
                    <Pencil className="size-[13px]" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => useAutomations.getState().remove(a.id)} aria-label={t('Delete')}>
                    <Trash2 className="size-[13px] text-danger" />
                  </Button>
                  <Switch checked={a.enabled} onCheckedChange={(v) => useAutomations.getState().update(a.id, { enabled: v })} />
                </div>
              </LivingItem>
            );
          })}
        </LivingList>
      )}
    </LivingBox>
  );
}

function Form({ initial, onDone }: { initial: Automation | null; onDone: () => void }) {
  const projects = useProjects((s) => s.projects);
  const [name, setName] = useState(initial?.name ?? '');
  const [projectId, setProjectId] = useState(initial?.projectId ?? projects[0]?.id ?? '');
  const [triggerKind, setTriggerKind] = useState<Trigger['kind']>(initial?.trigger.kind ?? 'watch');
  const [path, setPath] = useState(initial?.trigger.kind === 'watch' ? initial.trigger.path : 'src');
  const [include, setInclude] = useState(initial?.trigger.kind === 'watch' ? (initial.trigger.include ?? '') : '');
  const [minutes, setMinutes] = useState(initial?.trigger.kind === 'interval' ? String(initial.trigger.minutes) : '30');
  const [at, setAt] = useState(initial?.trigger.kind === 'daily' ? initial.trigger.at : '09:00');
  const [actionKind, setActionKind] = useState<Action['kind']>(initial?.action.kind ?? 'command');
  const [text, setText] = useState(initial?.action.kind === 'prompt' ? initial.action.text : '');
  const [session, setSession] = useState<'active' | 'new'>(initial?.action.kind === 'prompt' ? initial.action.session : 'active');
  const [command, setCommand] = useState(initial?.action.kind === 'command' ? initial.action.command : 'npm test');
  const [onFail, setOnFail] = useState(initial?.action.kind === 'command' ? (initial.action.onFailurePrompt ?? '') : t('The tests failed after my last change — find the cause and fix it.'));

  const trigger: Trigger = triggerKind === 'watch' ? { kind: 'watch', path, include: include.trim() || undefined } : triggerKind === 'interval' ? { kind: 'interval', minutes: Math.max(1, Number(minutes) || 30) } : { kind: 'daily', at };
  const action: Action = actionKind === 'prompt' ? { kind: 'prompt', text, session } : { kind: 'command', command, onFailurePrompt: onFail.trim() || undefined };
  const valid = name.trim() && projectId && (actionKind === 'prompt' ? text.trim() : command.trim());
  const save = () => {
    if (!valid) return;
    if (initial) useAutomations.getState().update(initial.id, { name: name.trim(), projectId, trigger, action });
    else useAutomations.getState().add({ name: name.trim(), projectId, enabled: true, trigger, action });
    onDone();
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="flex flex-col gap-3 rounded-lg bg-surface-inset p-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] text-secondary">{t('Name')}</span>
          <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Tests on save')} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] text-secondary">{t('Project')}</span>
          <Select size="sm" value={projectId} onChange={setProjectId} options={projects.map((p) => ({ value: p.id, label: p.name }))} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] text-secondary">{t('When')}</span>
          <Select size="sm" value={triggerKind} onChange={setTriggerKind} options={[{ value: 'watch', label: t('Files change') }, { value: 'interval', label: t('Every N minutes') }, { value: 'daily', label: t('Daily at') }]} />
        </label>
        <LivingSwitch k={triggerKind}>
        {triggerKind === 'watch' ? (
          <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] text-secondary">{t('Path (relative to the project)')}</span>
              <TextInput value={path} onChange={(e) => setPath(e.target.value)} placeholder="src" spellCheck={false} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] text-secondary">{t('Extensions')}</span>
              <TextInput value={include} onChange={(e) => setInclude(e.target.value)} placeholder="ts,tsx" spellCheck={false} />
            </label>
          </div>
        ) : triggerKind === 'interval' ? (
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] text-secondary">{t('Minutes')}</span>
            <TextInput type="number" min={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </label>
        ) : (
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] text-secondary">{t('Time')}</span>
            <TextInput type="time" value={at} onChange={(e) => setAt(e.target.value)} />
          </label>
        )}
        </LivingSwitch>
      </div>
      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] text-secondary">{t('Then')}</span>
          <Select size="sm" value={actionKind} onChange={setActionKind} options={[{ value: 'command', label: t('Run a command') }, { value: 'prompt', label: t('Send Claude a prompt') }]} />
        </label>
        <LivingSwitch k={actionKind}>
        {actionKind === 'command' ? (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] text-secondary">{t('Command (runs in the project folder)')}</span>
              <TextInput value={command} onChange={(e) => setCommand(e.target.value)} placeholder="npm test" spellCheck={false} className="font-mono" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="inline-flex items-center gap-1 text-[11.5px] text-secondary">
                <ClaudeLogo size={11} /> {t('If it fails, ask Claude (leave empty to only notify)')}
              </span>
              <Textarea value={onFail} onChange={(e) => setOnFail(e.target.value)} rows={2} />
            </label>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="inline-flex items-center gap-1 text-[11.5px] text-secondary">
                <MessageSquare className="size-[11px]" /> {t('Prompt ({files} = the files that changed)')}
              </span>
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder={t('Review {files} for bugs and tell me what you would change.')} />
            </label>
            <label className="flex items-center gap-2 text-[12px] text-secondary">
              <Select size="sm" value={session} onChange={setSession} options={[{ value: 'active', label: t("In the project's current session") }, { value: 'new', label: t('In a new session each time') }]} />
            </label>
          </div>
        )}
        </LivingSwitch>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" type="button" onClick={onDone}>
          {t('Cancel')}
        </Button>
        <Button size="sm" type="submit" disabled={!valid}>
          {initial ? t('Save') : t('Add')}
        </Button>
      </div>
    </form>
  );
}
