import { useState } from 'react';
import { Swords, AlertTriangle } from 'lucide-react';
import { useProjects } from '@/stores/projects';
import { useSettings, MODELS } from '@/stores/settings';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Textarea } from '@/components/ui/Textarea';
import { TextInput } from '@/components/ui/TextInput';
import { LivingReveal } from '@/components/ui/Living';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useArenaLauncher } from './launcher';
import { ANGLES, launchArena, type VariantSpec } from './launch';
import { VARIANT_TONES } from './tones';
import { t } from '@/i18n';

/**
 * "Solve this N ways": the task, how many agents, and for each one the
 * model and the angle it is asked to take. Every variant starts from the
 * last commit in a worktree of its own.
 */
export function ArenaDialog() {
  const target = useArenaLauncher((s) => s.target);
  const close = useArenaLauncher((s) => s.close);
  return (
    <Dialog open={!!target} onOpenChange={(v) => !v && close()}>
      <DialogContent size="lg">{target ? <ArenaForm projectId={target.projectId} initial={target.prompt} onDone={close} /> : null}</DialogContent>
    </Dialog>
  );
}

const DEFAULT_ANGLES = ['free', 'simple', 'robust', 'alt'];

function ArenaForm({ projectId, initial, onDone }: { projectId: string; initial: string; onDone: () => void }) {
  const project = useProjects((s) => s.projects.find((p) => p.id === projectId));
  const defaultModel = useSettings((s) => s.claude.defaultModel || 'opus');
  const [prompt, setPrompt] = useState(initial);
  const [count, setCount] = useState<'2' | '3' | '4'>('3');
  const [specs, setSpecs] = useState<VariantSpec[]>(() => DEFAULT_ANGLES.map((angle) => ({ model: defaultModel, angle })));
  const [busy, setBusy] = useState(false);
  const n = Number(count);
  const patch = (i: number, p: Partial<VariantSpec>) => setSpecs((all) => all.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const dirty = project?.git?.dirty ?? 0;
  const canGo = prompt.trim().length > 0 && !busy;

  const submit = async () => {
    if (!canGo) return;
    setBusy(true);
    const arena = await launchArena({ projectId, prompt, variants: specs.slice(0, n) });
    setBusy(false);
    if (arena) onDone();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Swords className="size-4 text-accent" />
          {t('Agent arena')}
          {project ? <span className="text-muted">· {project.name}</span> : null}
        </DialogTitle>
        <DialogDescription>{t('The same task to several agents at once, each in its own worktree and branch. Compare what they did side by side and keep one.')}</DialogDescription>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-3 pb-2">
        <Textarea
          autoFocus
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          minRows={3}
          maxRows={8}
          placeholder={t('What should they do? — "make the sidebar collapsible", "fix the flaky test in auth.spec"…')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void submit();
            }
          }}
          className="rounded-md bg-surface-inset px-3 py-2 font-mono text-[12.5px] leading-[1.6]"
        />
        <div className="flex items-center justify-between gap-4">
          <span className="text-[12.5px] text-primary">{t('Agents')}</span>
          <SegmentedControl size="sm" value={count} onChange={setCount} options={[{ value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }]} aria-label={t('Agents')} />
        </div>
        <div className="flex flex-col gap-1.5">
          {specs.slice(0, n).map((spec, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md bg-surface-inset px-2.5 py-1.5">
              <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10.5px] font-semibold text-white" style={{ background: VARIANT_TONES[i % VARIANT_TONES.length] }}>
                V{i + 1}
              </span>
              <Select size="sm" value={spec.model} onChange={(v) => patch(i, { model: v })} options={MODELS.map((m) => ({ value: m.id, label: m.label, hint: m.hint }))} className="w-[150px]" align="start" />
              <Select size="sm" value={spec.angle} onChange={(v) => patch(i, { angle: v })} options={ANGLES.map((a) => ({ value: a.id, label: t(a.label) }))} className="w-[180px]" align="start" />
              {spec.angle === 'custom' ? <TextInput size="sm" autoFocus value={spec.custom ?? ''} onChange={(e) => patch(i, { custom: e.target.value })} placeholder={t('How should this one approach it?')} className="min-w-0 flex-1" /> : <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted">{t(ANGLES.find((a) => a.id === spec.angle)?.hint ?? '')}</span>}
            </div>
          ))}
        </div>
        <LivingReveal open={dirty > 0}>
          <div className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-[12px] leading-relaxed text-warning">
            <AlertTriangle className="mt-0.5 size-[13px] shrink-0" />
            <span>{dirty === 1 ? t('{n} uncommitted change in {project}: the variants start from the last commit and will not see it.', { n: dirty, project: project?.name ?? '' }) : t('{n} uncommitted changes in {project}: the variants start from the last commit and will not see them.', { n: dirty, project: project?.name ?? '' })}</span>
          </div>
        </LivingReveal>
        <div className="text-[11.5px] leading-relaxed text-muted">{t('Branches arena/… and worktrees beside the project folder; choosing a variant merges its branch into {branch} and clears the rest.', { branch: project?.git?.branch || 'HEAD' })}</div>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" size="sm" type="button" onClick={onDone}>
          {t('Cancel')}
        </Button>
        <Button variant="primary" size="sm" type="submit" disabled={!canGo}>
          {busy ? t('Starting…') : t('Start {n} agents', { n })}
        </Button>
      </DialogFooter>
    </form>
  );
}
