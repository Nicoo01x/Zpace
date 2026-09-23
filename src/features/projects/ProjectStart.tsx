import { useState } from 'react';
import { ArrowUp, GitBranch, SlidersHorizontal } from 'lucide-react';
import { motion } from 'motion/react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/cn';
import { easings } from '@/lib/motion';
import { useProjects } from '@/stores/projects';
import { useSettings } from '@/stores/settings';
import { useTerminals } from '@/stores/terminals';
import { useUI } from '@/stores/ui';
import { Textarea } from '@/components/ui/Textarea';
import { IconButton } from '@/components/ui/IconButton';
import { AgentLogo } from '@/features/agent/BrandIcon';
import { claudeLaunchDefaults, useWorkspaceActions } from '@/features/sessions/useWorkspaceActions';
import { terminalName, useClaudeLive } from '@/features/terminal/claude-live';
import { useClaudeWorking } from '@/features/terminal/claude-watch';
import { t } from '@/i18n';

/**
 * A project's front door: one box that asks what you want to do today. What
 * you write starts Claude Code in a terminal with it as the first prompt, and
 * the tab takes the conversation's name as soon as Claude gives it one (the
 * prompt's first words stand in until then). Below, the Claude terminals
 * already open in the project, to go back to one.
 */
export function ProjectStart({ projectId }: { projectId: string }) {
  const project = useProjects((s) => s.projects.find((p) => p.id === projectId));
  const { launchClaude, focusTerminal } = useWorkspaceActions();
  const [draft, setDraft] = useState('');
  const tabs = useTerminals(useShallow((s) => s.tabs.filter((x) => x.projectId === projectId && x.program?.agent === 'claude')));
  const liveIds = useClaudeLive(useShallow((s) => Object.keys(s.byTab)));
  const shellClaude = useTerminals(useShallow((s) => s.tabs.filter((x) => x.projectId === projectId && !x.program && liveIds.includes(x.id))));
  const open = [...tabs, ...shellClaude].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);

  if (!project) return <div className="flex h-full items-center justify-center text-[12.5px] text-muted">{t('Project not found')}</div>;

  const send = () => {
    const prompt = draft.trim();
    if (!prompt) return;
    const tab = launchClaude(project.id, { ...claudeLaunchDefaults(useSettings.getState().claude), continueLast: false, prompt });
    if (!tab) return;
    // Until Claude names the conversation, its first words do.
    useClaudeLive.getState().setTitle(tab.id, prompt.replace(/\s+/g, ' ').slice(0, 48));
    setDraft('');
  };

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto px-8 py-10">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: easings.out }} className="w-full max-w-[600px]">
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
          {project.name}
          {project.git?.branch ? (
            <span className="inline-flex items-center gap-1 normal-case tracking-normal">
              <GitBranch className="size-3" />
              {project.git.branch}
            </span>
          ) : null}
        </div>
        <h1 className="mb-5 text-[22px] font-semibold tracking-[-0.02em] text-primary">{t('What do you want to do today?')}</h1>
        <div className="rounded-[14px] bg-surface p-2 shadow-[0_0_0_1px_var(--border)] focus-within:shadow-[0_0_0_1px_var(--accent)]">
          <Textarea
            bare
            autoFocus
            minRows={3}
            maxRows={12}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={t('Describe the task. Claude Code starts in a terminal with it.')}
            className="w-full resize-none bg-transparent px-2 py-1.5 text-content text-primary outline-none placeholder:text-muted"
          />
          <div className="flex items-center gap-1 pl-1.5">
            <AgentLogo agent="claude" size={14} />
            <span className="text-[12px] text-secondary">{t('Claude Code in a terminal')}</span>
            <span className="flex-1" />
            <IconButton label={t('Claude Code with arguments…')} size="sm" onClick={() => useUI.getState().setClaudeLaunch({ projectId: project.id })}>
              <SlidersHorizontal />
            </IconButton>
            <IconButton label={t('Start')} shortcut="enter" size="sm" variant="default" disabled={!draft.trim()} onClick={send} className={cn(draft.trim() && 'bg-accent text-inverse hover:bg-accent hover:text-inverse')}>
              <ArrowUp />
            </IconButton>
          </div>
        </div>
        {open.length ? (
          <div className="mt-8">
            <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.05em] text-muted">{t('Open in this project')}</div>
            <div className="flex flex-col">
              {open.map((tab) => (
                <OpenRow key={tab.id} id={tab.id} title={tab.title} shellId={tab.shellId} onOpen={() => focusTerminal(tab.id)} />
              ))}
            </div>
          </div>
        ) : null}
      </motion.div>
    </div>
  );
}

function OpenRow({ id, title, shellId, onOpen }: { id: string; title: string; shellId: string; onOpen: () => void }) {
  const claudeTitle = useClaudeLive((s) => s.titles[id]);
  const working = useClaudeWorking((s) => !!s.byTab[id]);
  return (
    <button type="button" onClick={onOpen} className="flex h-(--row-height) items-center gap-2.5 rounded-lg px-2 text-left text-ui text-primary hover:bg-surface-hover">
      <AgentLogo agent="claude" size={14} />
      <span className="min-w-0 flex-1 truncate">{terminalName({ title, shellId }, claudeTitle)}</span>
      <span className={cn('text-[11.5px]', working ? 'text-accent' : 'text-muted')}>{working ? t('Working') : t('Waiting for you')}</span>
    </button>
  );
}
