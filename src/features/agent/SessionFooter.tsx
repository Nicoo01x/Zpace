import { memo, useEffect, useState } from 'react';
import { Folder, Clock, GitBranch, Users, ChevronsRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useSessions } from '@/stores/sessions';
import { useProjects } from '@/stores/projects';
import { useSettings } from '@/stores/settings';
import { useUI } from '@/stores/ui';
import { Tooltip } from '@/components/ui/Tooltip';
import { PERMISSION_MODES, cyclePermissionMode } from './permissionMode';
import { ModelPicker } from './ModelPicker';
import { ContextMeter } from './ContextMeter';
import { AgentGlyph } from './AgentGlyph';
import { CapabilitiesChip } from './CapabilitiesPanel';
import { ReviewChip } from '@/features/review/ReviewChip';
import { formatCost, formatDuration, formatNumber, formatTokens } from '@/lib/format';
import type { Session } from '@/types/workspace';
import { t } from '@/i18n';

function Sep() {
  return <span className="mx-2 text-muted/70">|</span>;
}

/**
 * Two-line monospace footer inside the session pane — the reference's
 * status bar:
 *   [Opus 5 (1M context)] | melon-mind | ▰▱▱▱ 10% | 102k/1M | $2.33 | 14m 12s
 *   ▶▶ auto mode on (shift+tab to cycle) · @ mention · / commands
 */
export const SessionFooter = memo(function SessionFooter({ session }: { session: Session }) {
  const activeAgents = useSessions((s) => Object.values(s.sessions).filter((x) => x.status === 'running' || x.status === 'waiting').length);
  const project = useProjects((s) => s.projects.find((p) => p.id === session.projectId));
  const permissionMode = useSettings((s) => s.claude.permissionMode);
  const toggleGitPanel = useUI((s) => s.toggleGitPanel);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!session.runStartedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [session.runStartedAt]);
  const runtimeMs = session.runtimeMs + (session.runStartedAt ? now - session.runStartedAt : 0);
  const mode = PERMISSION_MODES.find((m) => m.id === permissionMode) ?? PERMISSION_MODES[0];

  return (
    <footer className="shrink-0 select-none px-(--content-padding) pb-3 pt-2 font-mono text-[12.5px] leading-[1.7] text-secondary">
      <div className="flex min-w-0 items-center whitespace-nowrap overflow-hidden">
        <ModelPicker session={session}>
          <button
            type="button"
            aria-label={t('Model')}
            className="rounded-[4px] text-accent outline-none transition-colors duration-(--motion-fast) hover:bg-accent-soft data-[state=open]:bg-accent-soft"
          >
            [{session.modelLabel}]
          </button>
        </ModelPicker>

        <Sep />
        <Tooltip content={project?.path ?? ''} side="top">
          <span className="inline-flex items-center gap-1.5 text-accent">
            <Folder className="size-[13px] text-muted" strokeWidth={1.75} />
            {project?.name ?? '—'}
            {project?.runtime === 'wsl' ? <span className="text-muted">wsl</span> : null}
          </span>
        </Tooltip>

        <Sep />
        <ContextMeter used={session.usage.contextUsed} max={session.usage.contextMax} />

        <Sep />
        <Tooltip
          side="top"
          content={
            <span className="flex flex-col gap-0.5 tabular">
              <span>{t('Input')} {formatNumber(session.usage.inputTokens)} · {t('Output')} {formatNumber(session.usage.outputTokens)}</span>
              <span className="opacity-80">{t('Cache read')} {formatNumber(session.usage.cacheReadTokens)} · {t('write')} {formatNumber(session.usage.cacheWriteTokens)}</span>
            </span>
          }
        >
          <span className="inline-flex items-center gap-1.5 text-accent">
            <AgentGlyph className="size-[12px] text-muted" />
            {formatTokens(session.usage.contextUsed)}/{formatTokens(session.usage.contextMax)}
          </span>
        </Tooltip>

        <Sep />
        <Tooltip content={t('Estimated cost for this session')} side="top">
          <span className="tabular">{formatCost(session.usage.costUsd)}</span>
        </Tooltip>

        <Sep />
        <Tooltip content={t('Time the agent spent working')} side="top">
          <span className="inline-flex items-center gap-1.5 tabular">
            <Clock className="size-[12px] text-muted" strokeWidth={1.75} />
            {formatDuration(runtimeMs)}
          </span>
        </Tooltip>
      </div>

      <div className="flex min-w-0 items-center gap-3 whitespace-nowrap overflow-hidden">
        <Tooltip content={t(mode.hint)} side="top">
          <button
            type="button"
            onClick={() => cyclePermissionMode()}
            className="inline-flex items-center gap-1.5 rounded-[4px] outline-none transition-colors duration-(--motion-fast) hover:text-primary"
          >
            <ChevronsRight className={cn('size-[13px]', permissionMode === 'bypassPermissions' ? 'text-danger' : permissionMode === 'plan' ? 'text-accent' : 'text-accent-warm')} strokeWidth={2} />
            {t('{mode} on', { mode: t(mode.label) })} <span className="text-muted">{t('(shift+tab to cycle)')}</span>
          </button>
        </Tooltip>
        <span className="text-muted">·</span>
        <span className="text-muted">
          <span className="text-secondary">@</span> {t('mention')} · <span className="text-secondary">/</span> {t('commands')}
        </span>
        <span className="text-muted">·</span>
        {session.worktree ? (
          <Tooltip content={session.worktree.path} side="top">
            <span className="inline-flex items-center gap-1 text-accent">
              <GitBranch className="size-[12px]" strokeWidth={1.75} /> {session.worktree.branch}
            </span>
          </Tooltip>
        ) : null}
        <CapabilitiesChip sessionId={session.id} projectPath={project?.path} />
        <ReviewChip sessionId={session.id} />
        <span className="flex-1" />
        {activeAgents > 1 ? (
          <Tooltip content={t('Agents running in parallel')} side="top">
            <span className="inline-flex items-center gap-1.5 tabular">
              <Users className="size-[12px] text-muted" strokeWidth={1.75} />
              {t('{n} agents', { n: activeAgents })}
            </span>
          </Tooltip>
        ) : null}
        {project?.git?.isRepo ? (
          <Tooltip content={t('Open git panel')} side="top">
            <button type="button" onClick={toggleGitPanel} className="inline-flex items-center gap-1.5 rounded-[4px] outline-none transition-colors hover:text-primary">
              <GitBranch className="size-[12px] text-muted" strokeWidth={1.75} />
              <span className="max-w-[200px] truncate">{project.git.branch}</span>
              {project.git.dirty > 0 ? <span className="text-muted">·{project.git.dirty}</span> : null}
              {project.git.ahead > 0 ? <span className="text-muted">↑{project.git.ahead}</span> : null}
              {project.git.behind > 0 ? <span className="text-muted">↓{project.git.behind}</span> : null}
            </button>
          </Tooltip>
        ) : null}
      </div>
    </footer>
  );
});
