import { useState } from 'react';
import { Users, Plus, Check } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import { useAgents, agentList } from '@/stores/agents';
import { useProjects } from '@/stores/projects';
import { useUI } from '@/stores/ui';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/TextInput';
import { Select } from '@/components/ui/Select';
import { MacFolder } from '@/components/ui/MacFolder';
import { useAgentEditor, useRoomLauncher } from './editor';
import { openRoom } from './room-runtime';
import { AgentAvatar } from './AgentAvatar';

/** A new room: a name, the project it works in, who sits in it. */
export function RoomDialog() {
  const target = useRoomLauncher((s) => s.target);
  const close = useRoomLauncher((s) => s.close);
  return (
    <Dialog open={!!target} onOpenChange={(v) => !v && close()}>
      <DialogContent size="md">{target ? <RoomForm projectId={target.projectId} onDone={close} /> : null}</DialogContent>
    </Dialog>
  );
}

function RoomForm({ projectId, onDone }: { projectId?: string; onDone: () => void }) {
  const projects = useProjects((s) => s.projects);
  const activeProjectId = useUI((s) => s.activeProjectId);
  const agents = useAgents(useShallow((s) => agentList(s.agents)));
  const [pid, setPid] = useState(projectId ?? activeProjectId ?? projects[0]?.id ?? '');
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string[]>(() => agents.slice(0, 2).map((a) => a.id));
  const project = projects.find((p) => p.id === pid);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const valid = !!project && picked.length > 0;
  const submit = () => {
    if (!valid) return;
    const room = useAgents.getState().addRoom({ projectId: pid, name: name.trim() || defaultName(picked.map((id) => agents.find((a) => a.id === id)?.name ?? '')), agentIds: picked });
    useProjects.getState().toggleExpanded(pid, true);
    onDone();
    openRoom(room.id);
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
          <Users className="size-4 text-accent" />
          {t('Multi-agent room')}
        </DialogTitle>
        <DialogDescription>{t('Several agents in one chat. Write @Name to talk to one of them; without a mention, everyone answers. They hear each other and can call one another.')}</DialogDescription>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-3 pb-2">
        <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] text-secondary">{t('Name')}</span>
            <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Optional — "Auth redesign", "Release 2.0"…')} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] text-secondary">{t('Project')}</span>
            <Select size="sm" value={pid} onChange={setPid} options={projects.map((p) => ({ value: p.id, label: p.name }))} align="start" className="w-full" />
          </label>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[11.5px] text-secondary">{t('Agents')}</span>
            <button type="button" onClick={() => useAgentEditor.getState().open()} className="inline-flex items-center gap-1 text-[11.5px] text-accent hover:underline">
              <Plus className="size-3" /> {t('New agent')}
            </button>
          </div>
          {agents.length ? (
            <div className="flex flex-col gap-0.5 rounded-md bg-surface-inset p-1">
              {agents.map((a) => {
                const on = picked.includes(a.id);
                return (
                  <button key={a.id} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(a.id)} className={cn('flex w-full items-center gap-2.5 rounded-[5px] px-2 py-1.5 text-left press', on ? 'bg-surface text-primary shadow-[0_0_0_1px_var(--border)]' : 'text-secondary hover:bg-surface-hover hover:text-primary')}>
                    <AgentAvatar agent={a} size={22} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium">{a.name}</span>
                      {a.instructions ? <span className="block truncate text-[11px] text-muted">{a.instructions.split('\n')[0]}</span> : null}
                    </span>
                    <span className={cn('inline-flex size-4 shrink-0 items-center justify-center rounded-full', on ? 'bg-accent text-white' : 'shadow-[inset_0_0_0_1px_var(--border-strong)]')}>{on ? <Check className="size-2.5" strokeWidth={3} /> : null}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-md bg-surface-inset px-3 py-3 text-[12px] text-muted">{t('No agents yet — create one first.')}</div>
          )}
        </div>
        {project ? (
          <div className="flex items-center gap-2 text-[11.5px] text-muted">
            <MacFolder color={project.color || undefined} size={13} />
            <span className="truncate">{t('They work in {project}: same files, same git.', { project: project.name })}</span>
          </div>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" size="sm" type="button" onClick={onDone}>
          {t('Cancel')}
        </Button>
        <Button variant="primary" size="sm" type="submit" disabled={!valid}>
          {t('Open room')}
        </Button>
      </DialogFooter>
    </form>
  );
}

function defaultName(names: string[]): string {
  const clean = names.filter(Boolean);
  return clean.length <= 3 ? clean.join(' + ') : t('{n} agents', { n: clean.length });
}
