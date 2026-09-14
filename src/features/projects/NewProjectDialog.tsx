import { useState } from 'react';
import { motion } from 'motion/react';
import { Folder, Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { MacFolder } from '@/components/ui/MacFolder';
import { ColorDot } from '@/components/ui/ColorDot';
import { useUI } from '@/stores/ui';
import { useProjects } from '@/stores/projects';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { TextInput } from '@/components/ui/TextInput';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { useWorkspaceActions } from '@/features/sessions/useWorkspaceActions';
import { basename } from '@/lib/format';
import { springs } from '@/lib/motion';
import { PROJECT_COLORS } from './colors';
import { t } from '@/i18n';

/**
 * After a folder is picked: its name (editable) and the colour its folder
 * glyph wears in the sidebar. Enter adds it straight away with the defaults.
 */
export function NewProjectDialog() {
  const pending = useUI((s) => s.newProject);
  const setPending = useUI((s) => s.setNewProject);
  return (
    <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
      <DialogContent size="md">{pending ? <NewProjectForm path={pending.path} onDone={() => setPending(null)} /> : null}</DialogContent>
    </Dialog>
  );
}

function NewProjectForm({ path, onDone }: { path: string; onDone: () => void }) {
  const { addProjectPath } = useWorkspaceActions();
  const [name, setName] = useState(basename(path));
  const [color, setColor] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const p = await addProjectPath(path, name.trim() || basename(path));
      if (color) useProjects.getState().setColor(p.id, color);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) void submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>{t('New project')}</DialogTitle>
        <DialogDescription className="truncate font-mono text-[12px]">{path}</DialogDescription>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-4 pb-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] text-secondary">{t('Name')}</span>
          <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} onFocus={(e) => e.currentTarget.select()} />
        </label>
        <div className="flex flex-col gap-2">
          <span className="text-[12px] text-secondary">{t('Folder colour')}</span>
          <div className="flex items-center gap-3">
            <motion.span
              key={color ?? 'none'}
              initial={{ scale: 0.85 }}
              animate={{ scale: 1 }}
              transition={springs.pop}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-inset"
              style={color ? { color } : undefined}
            >
              <MacFolder color={color || undefined} size={22} />
            </motion.span>
            <div role="group" aria-label={t('Folder colour')} className="flex flex-wrap items-center gap-2">
              <Tooltip content={t('None')} side="bottom">
                <button
                  type="button"
                  aria-pressed={!color}
                  aria-label={t('None')}
                  onClick={() => setColor(undefined)}
                  className={cn('inline-flex size-6 items-center justify-center rounded-full bg-surface-inset text-muted transition-transform hover:scale-110', !color && 'ring-2 ring-[var(--text-primary)] ring-offset-2 ring-offset-[var(--surface-raised)]')}
                >
                  <Folder className="size-3.5" strokeWidth={1.75} />
                </button>
              </Tooltip>
              {PROJECT_COLORS.map((c) => (
                <Tooltip key={c.id} content={t(c.label)} side="bottom">
                  <button
                    type="button"
                    aria-pressed={color === c.value}
                    aria-label={t(c.label)}
                    onClick={() => setColor(c.value)}
                    style={{ backgroundColor: c.value }}
                    className={cn('inline-flex size-6 items-center justify-center rounded-full text-white transition-transform hover:scale-110', color === c.value && 'ring-2 ring-[var(--text-primary)] ring-offset-2 ring-offset-[var(--surface-raised)]')}
                  >
                    {color === c.value ? <Check className="size-3.5" strokeWidth={3} /> : null}
                  </button>
                </Tooltip>
              ))}
              <ColorDot value={color} custom={!!color && !PROJECT_COLORS.some((c) => c.value === color)} onChange={setColor} size={24} />
            </div>
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" size="sm" type="button" onClick={onDone}>
          {t('Cancel')}
        </Button>
        <Button variant="primary" size="sm" type="submit" loading={busy}>
          {t('Add project')}
        </Button>
      </DialogFooter>
    </form>
  );
}
