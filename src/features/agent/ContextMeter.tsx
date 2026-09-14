import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { Tooltip } from '@/components/ui/Tooltip';
import { formatNumber } from '@/lib/format';
import { easings } from '@/lib/motion';
import { t } from '@/i18n';

export interface ContextMeterProps {
  used: number;
  max: number;
  segments?: number;
  className?: string;
  showPercent?: boolean;
}

/**
 * Context window meter — ten slanted cells, like ▰▰▱▱▱▱▱▱▱▱ in the reference.
 *  0–60 warm accent · 60–80 warning (quiet) · 80–95 warning · 95+ critical
 */
export function ContextMeter({ used, max, segments = 10, className, showPercent = true }: ContextMeterProps) {
  const ratio = max > 0 ? Math.min(1, used / max) : 0;
  const pct = Math.round(ratio * 100);
  const filled = ratio === 0 ? 0 : Math.max(1, Math.round(ratio * segments));
  const tone = ratio >= 0.95 ? 'critical' : ratio >= 0.8 ? 'warning' : ratio >= 0.6 ? 'soft' : 'normal';
  const color =
    tone === 'critical' ? 'text-danger' : tone === 'warning' ? 'text-warning' : tone === 'soft' ? 'text-warning/90' : 'text-accent-warm';

  return (
    <Tooltip
      content={
        <span className="flex flex-col gap-0.5">
          <span>{t('Context used')}</span>
          <span className="tabular opacity-80">
            {formatNumber(used)} / {formatNumber(max)} {t('tokens')}
          </span>
        </span>
      }
      side="top"
    >
      <span
        className={cn('inline-flex items-center gap-1.5', color, className)}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={t('Context usage')}
      >
        <span className="inline-flex items-center gap-[2px]">
          {Array.from({ length: segments }, (_, i) => {
            const on = i < filled;
            return (
              <motion.span
                key={i}
                initial={false}
                animate={{ opacity: on ? 1 : 0.2 }}
                transition={{ duration: 0.24, delay: on ? i * 0.02 : 0, ease: easings.out }}
                className={cn('block h-[8px] w-[5px] -skew-x-[14deg] rounded-[1.5px]', on ? 'bg-current' : 'bg-primary')}
              />
            );
          })}
        </span>
        {showPercent ? <span className="tabular">{pct}%</span> : null}
      </span>
    </Tooltip>
  );
}
