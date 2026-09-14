import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Gauge, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatCost, formatTokens, formatRelative } from '@/lib/format';
import { useUsage, limitLabel, resetsIn } from '@/stores/usage';
import { useSessions } from '@/stores/sessions';
import { useSettings } from '@/stores/settings';
import { useUI } from '@/stores/ui';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { Tooltip } from '@/components/ui/Tooltip';
import { ClaudeLogo } from './BrandIcon';
import { t } from '@/i18n';
import { CostByProject } from './CostByProject';

/**
 * Title-bar gauge for the AI budget: Claude Code's rate-limit windows as the
 * CLI reports them (5-hour, weekly), the active session's context window and
 * cost, and today's totals across sessions. Optional — Settings › General (a
 * hide button in the panel itself was too easy to hit by accident).
 */
export function UsageChip() {
  const show = useSettings((s) => s.showUsage);
  const limits = useUsage(useShallow((s) => Object.values(s.limits).sort((a, b) => a.type.localeCompare(b.type))));
  const activeSessionId = useUI((s) => s.activeSessionId);
  const active = useSessions((s) => (activeSessionId ? s.sessions[activeSessionId] : undefined));
  const today = useSessions(
    useShallow((s) => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      let cost = 0;
      let input = 0;
      let output = 0;
      for (const x of Object.values(s.sessions)) {
        if (x.updatedAt < start.getTime()) continue;
        cost += x.usage.costUsd;
        input += x.usage.inputTokens;
        output += x.usage.outputTokens;
      }
      return { cost, input, output };
    }),
  );
  const [open, setOpen] = useState(false);
  const plan = useUsage((s) => s.plan);
  const fetchedAt = useUsage((s) => s.fetchedAt);
  const error = useUsage((s) => s.error);
  const loading = useUsage((s) => s.loading);
  const refresh = useUsage((s) => s.refresh);
  // Real numbers: a reading when the chip appears, every five minutes after (skipped while the window is hidden), and whenever the panel opens.
  useEffect(() => {
    if (!show) return;
    void refresh();
    const id = window.setInterval(() => { if (!document.hidden) void refresh(); }, 5 * 60_000);
    return () => window.clearInterval(id);
  }, [show, refresh]);
  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);
  if (!show) return null;

  const shown = limits.filter((l) => ['five_hour', 'seven_day', 'seven_day_opus', 'seven_day_sonnet', 'seven_day_oauth_apps'].includes(l.type) || (l.utilization ?? 0) > 0);
  const primary = shown.find((l) => l.type === 'five_hour') ?? shown[0];
  const pct = primary?.utilization !== undefined ? Math.round(primary.utilization * 100) : null;
  const ctx = active ? Math.round((active.usage.contextUsed / Math.max(1, active.usage.contextMax)) * 100) : null;
  const tone = pct === null ? 'text-secondary' : pct >= 90 ? 'text-danger' : pct >= 70 ? 'text-warning' : 'text-secondary';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip content={t('AI usage and limits')}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t('Usage and limits')}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-md px-1.5 text-[12.5px] transition-colors duration-(--motion-fast) hover:bg-surface-hover hover:text-primary data-[state=open]:bg-surface-active data-[state=open]:text-primary',
              tone,
            )}
          >
            <Gauge className="size-[15px]" strokeWidth={1.75} />
            {pct !== null ? <span className="tabular">{pct}%</span> : ctx !== null ? <span className="tabular">{ctx}% {t('ctx')}</span> : null}
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="start" sideOffset={4} className="w-[320px] p-0">
        <div className="flex h-10 items-center gap-2 pl-3.5 pr-2 hairline-b">
          <ClaudeLogo size={14} />
          <span className="text-[12.5px] font-semibold text-primary">{t('Claude Code limits')}</span>
          {plan ? <span className="rounded-md bg-claude-soft px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-[0.04em] text-claude">{plan}</span> : null}
          <span className="flex-1" />
          <button type="button" aria-label={t('Refresh')} onClick={() => void refresh()} className="inline-flex size-6 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-primary">
            <RefreshCw className={cn('size-[12px]', loading && 'animate-spin')} />
          </button>
        </div>
        <div className="flex flex-col gap-3 px-3.5 py-3">
          {error && shown.length === 0 ? (
            <div className="text-[12px] leading-relaxed text-danger" title={error}>{/429|rate/i.test(error) ? t('Anthropic is rate-limiting the usage check; it retries in a minute.') : error}</div>
          ) : shown.length === 0 ? (
            <div className="text-[12px] leading-relaxed text-muted">{loading ? t('Reading your plan limits…') : t('No limit data yet. Claude reports its 5-hour and weekly windows during chat sessions (Ctrl+N); they show here after the first turn.')}</div>
          ) : (
            shown.map((l) => {
              const p = l.utilization !== undefined ? Math.round(l.utilization * 100) : null;
              return (
                <div key={l.type}>
                  <div className="flex items-baseline justify-between text-[12px]">
                    <span className="text-primary">{t(limitLabel(l.type))}</span>
                    <span className={cn('tabular text-muted', l.status === 'rejected' && 'text-danger', l.status === 'allowed_warning' && 'text-warning')}>
                      {p !== null ? `${p}%` : l.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-inset">
                    <div className={cn('h-full rounded-full', (p ?? 0) >= 90 || l.status === 'rejected' ? 'bg-danger' : (p ?? 0) >= 70 ? 'bg-warning' : 'bg-accent')} style={{ width: `${p ?? (l.status === 'rejected' ? 100 : 0)}%` }} />
                  </div>
                  <div className="mt-1 text-[11px] text-muted">{resetsIn(l.resetsAt)}</div>
                </div>
              );
            })
          )}
          {fetchedAt ? (
            <div className="-mt-1 text-[11px] text-muted">
              {t('From Anthropic · {when}', { when: formatRelative(fetchedAt) })}
              {error ? <span className="text-warning" title={error}> · {/429|rate/i.test(error) ? t('Anthropic is rate-limiting the usage check; it retries in a minute.') : error}</span> : null}
            </div>
          ) : null}
          <div className="hairline-t pt-3">
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.05em] text-muted">{t('This session')}</div>
            {active ? (
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
                <span className="text-secondary">{t('Context')}</span>
                <span className="tabular text-right text-primary">
                  {formatTokens(active.usage.contextUsed)} / {formatTokens(active.usage.contextMax)} · {ctx}%
                </span>
                <span className="text-secondary">{t('Cost')}</span>
                <span className="tabular text-right text-primary">{formatCost(active.usage.costUsd)}</span>
                <span className="text-secondary">{t('Model')}</span>
                <span className="truncate text-right text-primary">{active.modelLabel ?? active.model}</span>
              </div>
            ) : (
              <div className="text-[12px] text-muted">{t('No active chat session.')}</div>
            )}
          </div>
          <div className="hairline-t pt-3">
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.05em] text-muted">{t('Today, all sessions')}</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
              <span className="text-secondary">{t('Tokens')}</span>
              <span className="tabular text-right text-primary">
                {formatTokens(today.input)} {t('in')} · {formatTokens(today.output)} {t('out')}
              </span>
              <span className="text-secondary">{t('Cost')}</span>
              <span className="tabular text-right text-primary">{formatCost(today.cost)}</span>
            </div>
          </div>
          <div className="hairline-t pt-3">
            <div className="mb-1.5 flex items-center text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
              {t('By project')}
              <span className="flex-1" />
              <button type="button" onClick={() => { setOpen(false); useUI.getState().setSummaryOpen(true); }} className="rounded px-1 normal-case tracking-normal text-accent hover:bg-surface-hover">
                {t('Day summary')}
              </button>
            </div>
            <CostByProject compact />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
