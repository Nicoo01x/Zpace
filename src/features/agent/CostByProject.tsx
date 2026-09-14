import { useMemo } from 'react';
import { useLedger, byProject, byDay } from '@/stores/ledger';
import { useProjects } from '@/stores/projects';
import { MacFolder } from '@/components/ui/MacFolder';
import { formatCost } from '@/lib/format';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';

/**
 * Spend by project for the last week (bars, biggest first) and the last
 * fourteen days as a small column chart — from the ledger, so it survives
 * closed sessions.
 */
export function CostByProject({ days = 7, compact }: { days?: number; compact?: boolean }) {
  // Select the raw days and derive here: a selector that builds fresh objects never compares equal and loops the render.
  const daysMap = useLedger((s) => s.days);
  const rows = useMemo(() => byProject(daysMap, days), [daysMap, days]);
  const series = useMemo(() => byDay(daysMap, 14), [daysMap]);
  const projects = useProjects((s) => s.projects);
  const total = rows.reduce((n, r) => n + r.costUsd, 0);
  const max = Math.max(0.0001, ...rows.map((r) => r.costUsd));
  const peak = Math.max(0.0001, ...series.map((d) => d.costUsd));
  const nameOf = (id: string) => projects.find((p) => p.id === id)?.name ?? t('Removed project');
  const colorOf = (id: string) => projects.find((p) => p.id === id)?.color ?? undefined;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="text-secondary">{t('Last {n} days', { n: days })}</span>
        <span className="tabular font-medium text-primary">{formatCost(total)}</span>
      </div>
      {rows.length === 0 ? (
        <div className="text-[12px] text-muted">{t('Nothing spent yet.')}</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {rows.slice(0, compact ? 4 : 8).map((r) => (
            <div key={r.projectId}>
              <div className="flex items-center gap-1.5 text-[12px]">
                <MacFolder color={colorOf(r.projectId)} size={13} />
                <span className="min-w-0 flex-1 truncate text-primary">{nameOf(r.projectId)}</span>
                <span className="tabular text-muted">
                  {r.turns ? `${r.turns} ${t(r.turns === 1 ? 'turn' : 'turns')} · ` : ''}
                  {formatCost(r.costUsd)}
                </span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-inset">
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, (r.costUsd / max) * 100)}%`, background: colorOf(r.projectId) }} />
              </div>
            </div>
          ))}
        </div>
      )}
      {!compact ? (
        <div>
          <div className="mb-1 text-[11px] text-muted">{t('Per day, last two weeks')}</div>
          <div className="flex h-12 items-end gap-[3px]" role="img" aria-label={t('Cost per day')}>
            {series.map((d) => (
              <div key={d.day} className="group/bar relative flex-1" title={`${d.day} · ${formatCost(d.costUsd)}${d.turns ? ` · ${d.turns} ${t(d.turns === 1 ? 'turn' : 'turns')}` : ''}`}>
                <div className={cn('mx-auto w-full rounded-[2px] transition-colors', d.costUsd > 0 ? 'bg-accent group-hover/bar:bg-primary' : 'bg-surface-inset')} style={{ height: `${Math.max(d.costUsd > 0 ? 8 : 3, (d.costUsd / peak) * 48)}px` }} />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
