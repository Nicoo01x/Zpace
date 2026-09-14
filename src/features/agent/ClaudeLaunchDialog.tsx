import { useState } from 'react';
import { ClaudeLogo } from './BrandIcon';
import { useUI } from '@/stores/ui';
import { useSettings, MODELS } from '@/stores/settings';
import { useProjects } from '@/stores/projects';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { TextInput } from '@/components/ui/TextInput';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Swap } from '@/components/ui/Living';
import { Switch } from '@/components/ui/Switch';
import { claudeArgs, claudeLaunchDefaults, useWorkspaceActions, type ClaudeLaunchArgs } from '@/features/sessions/useWorkspaceActions';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';

/**
 * Floating launch panel for Claude Code: model, permission mode, resume, and
 * free-form arguments — with the exact command shown before you run it. Opens
 * from "Claude Code with arguments…" or every time when Settings › Claude Code
 * › "Ask before launching" is on. Morphs out of the control that opened it.
 */
export function ClaudeLaunchDialog() {
  const target = useUI((s) => s.claudeLaunch);
  const setTarget = useUI((s) => s.setClaudeLaunch);
  return (
    <Dialog open={!!target} onOpenChange={(v) => !v && setTarget(null)}>
      <DialogContent size="md">{target ? <LaunchForm projectId={target.projectId} onDone={() => setTarget(null)} /> : null}</DialogContent>
    </Dialog>
  );
}

const PERMISSION_MODES: Array<{ value: ClaudeLaunchArgs['permissionMode']; label: string }> = [
  { value: 'default', label: 'Ask for permissions' },
  { value: 'acceptEdits', label: 'Accept edits' },
  { value: 'plan', label: 'Plan mode' },
  { value: 'bypassPermissions', label: 'Bypass permissions' },
];

function LaunchForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const project = useProjects((s) => s.projects.find((p) => p.id === projectId));
  const claude = useSettings((s) => s.claude);
  const patchSettings = useSettings((s) => s.patch);
  const { launchClaude } = useWorkspaceActions();
  const [launch, setLaunch] = useState<ClaudeLaunchArgs>(() => claudeLaunchDefaults(claude));
  const [remember, setRemember] = useState(false);
  const knownModel = launch.model === '' || MODELS.some((m) => m.id === launch.model);
  const [customModel, setCustomModel] = useState(knownModel ? false : true);
  const patch = (p: Partial<ClaudeLaunchArgs>) => setLaunch((l) => ({ ...l, ...p }));
  const args = claudeArgs(launch);
  const preview = ['claude', ...args.map((a) => (/\s/.test(a) ? `"${a}"` : a))].join(' ');

  const submit = () => {
    if (remember) {
      patchSettings({ claude: { ...claude, defaultModel: launch.model, permissionMode: launch.permissionMode, continueLast: launch.continueLast, extraArgs: launch.extraArgs } });
    }
    launchClaude(projectId, launch);
    onDone();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ClaudeLogo size={16} />
          Claude Code{project ? ` · ${project.name}` : ''}
        </DialogTitle>
        <DialogDescription>{t('Choose how this session starts. Extra arguments are passed to the CLI as written.')}</DialogDescription>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-3 pb-2">
        <Field label={t('Model')}>
          <Swap k={customModel ? 'custom' : 'pick'}>
          {customModel ? (
            <TextInput size="sm" mono autoFocus value={launch.model} onChange={(e) => patch({ model: e.target.value })} placeholder="claude-opus-5" spellCheck={false} className="w-[220px]" />
          ) : (
            <Select
              size="sm"
              value={launch.model}
              onChange={(v) => {
                if (v === '__custom') {
                  setCustomModel(true);
                  patch({ model: '' });
                } else patch({ model: v });
              }}
              options={[{ value: '', label: t('Claude’s default') }, ...MODELS.map((m) => ({ value: m.id, label: m.label, hint: m.hint })), { value: '__custom', label: t('Other model id…') }]}
              className="w-[220px]"
            />
          )}
          </Swap>
        </Field>
        <Field label={t('Permissions')}>
          <Select size="sm" value={launch.permissionMode} onChange={(v) => patch({ permissionMode: v })} options={PERMISSION_MODES.map((m) => ({ ...m, label: t(m.label) }))} className="w-[220px]" />
        </Field>
        <Field label={t('Continue last conversation')} hint="--continue">
          <Switch checked={launch.continueLast} onCheckedChange={(v) => patch({ continueLast: v })} />
        </Field>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] text-secondary">{t('Extra arguments')}</span>
          <TextInput
            autoFocus={!customModel}
            mono
            value={launch.extraArgs}
            onChange={(e) => patch({ extraArgs: e.target.value })}
            placeholder='--resume  --add-dir ../shared  --append-system-prompt "…"'
            spellCheck={false}
          />
          <span className="text-[11.5px] text-muted">{t('Anything')} <code className="font-mono">claude --help</code> {t('accepts. Quotes group a value.')}</span>
        </label>
        <div className="rounded-md bg-surface-inset px-3 py-2 font-mono text-[12px] leading-[1.5] text-primary break-all">
          <span className="text-muted">❯ </span>
          {preview}
        </div>
        <Field label={t('Remember as defaults')} hint={t('Saves model, permissions, resume and arguments to Settings › Claude Code.')}>
          <Switch checked={remember} onCheckedChange={setRemember} />
        </Field>
        <Field label={t('Always ask before launching')} hint={t('Show this panel every time Claude Code opens.')}>
          <Switch checked={claude.askArgs} onCheckedChange={(v) => patchSettings({ claude: { ...claude, askArgs: v } })} />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" size="sm" type="button" onClick={onDone}>
          {t('Cancel')}
        </Button>
        <Button variant="primary" size="sm" type="submit">
          {t('Launch')}
        </Button>
      </DialogFooter>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <div className="min-w-0">
        <div className="text-[12.5px] text-primary">{label}</div>
        {hint ? <div className={cn('mt-0.5 text-[11px] text-muted', hint.startsWith('-') && 'font-mono')}>{hint}</div> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
