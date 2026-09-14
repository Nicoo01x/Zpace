import { motion } from 'motion/react';
import { useShallow } from 'zustand/react/shallow';
import { useUsage, limitLabel, resetsIn } from '@/stores/usage';
import { useSettings } from '@/stores/settings';
import { t } from '@/i18n';

/**
 * A hairline of colour along the very top of the window: how much of the
 * 5-hour window is used (and, fainter, the weekly one) — green while there
 * is room, amber past 70 %, red past 90 %. Reads the same real numbers as
 * the usage chip; hidden with it.
 */
function tone(pct: number): string {
  return pct >= 90 ? 'var(--danger)' : pct >= 70 ? 'var(--warning)' : 'var(--success)';
}

export function UsageBar() {
  const show = useSettings((s) => s.showUsage);
  const limits = useUsage(useShallow((s) => ({ five: s.limits.five_hour, week: s.limits.seven_day })));
  if (!show) return null;
  const five = limits.five?.utilization;
  const week = limits.week?.utilization;
  if (five === undefined && week === undefined) return null;
  const pctFive = Math.round((five ?? 0) * 100);
  const pctWeek = Math.round((week ?? 0) * 100);
  const title = [five !== undefined ? `${t(limitLabel('five_hour'))} ${pctFive}% · ${resetsIn(limits.five?.resetsAt)}` : '', week !== undefined ? `${t(limitLabel('seven_day'))} ${pctWeek}% · ${resetsIn(limits.week?.resetsAt)}` : ''].filter(Boolean).join('\n');
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col" title={title} aria-hidden>
      {five !== undefined ? (
        <div className="h-[2px] w-full bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)]">
          <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, pctFive)}%` }} transition={{ type: 'spring', stiffness: 120, damping: 24 }} className="h-full rounded-r-full" style={{ background: tone(pctFive) }} />
        </div>
      ) : null}
      {week !== undefined ? (
        <div className="h-[1px] w-full">
          <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, pctWeek)}%` }} transition={{ type: 'spring', stiffness: 120, damping: 24 }} className="h-full opacity-60" style={{ background: tone(pctWeek) }} />
        </div>
      ) : null}
    </div>
  );
}
