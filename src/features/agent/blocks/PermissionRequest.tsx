import { memo } from 'react';
import { motion } from 'motion/react';
import { ShieldAlert, Check, X } from 'lucide-react';
import type { PermissionDecision, PermissionRequestEvent } from '@/types/agent';
import { Button } from '@/components/ui/Button';
import { Shortcut } from '@/components/ui/Shortcut';
import { springs } from '@/lib/motion';
import { Row } from './Row';
import { t } from '@/i18n';

/**
 * Inline permission prompt. A warm hairline — noticeable, never alarming.
 * Once answered it collapses into a one-line receipt.
 */
export const PermissionRequest = memo(function PermissionRequest({
  event,
  onDecide,
}: {
  event: PermissionRequestEvent;
  onDecide: (decision: PermissionDecision) => void;
}) {
  const decided = event.decision;
  if (decided) {
    return (
      <Row gutter={decided === 'deny' ? <X className="mt-[4px] size-[13px] text-danger" /> : <Check className="mt-[4px] size-[13px] text-success" />}>
        <div className="font-mono text-content leading-[1.6] text-secondary">
          {decided === 'deny' ? t('Denied') : decided === 'allow_always' ? t('Always allowed') : t('Allowed')} · <span className="text-primary/80">{event.detail.split('\n')[0]}</span>
        </div>
      </Row>
    );
  }
  return (
    <Row gutter={<ShieldAlert className="mt-[4px] size-[13px] text-warning" />}>
      <motion.div
        initial={{ opacity: 0, y: 6, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={springs.pop}
        role="group"
        aria-label={t('Permission request')}
        className="-mx-2 rounded-[8px] bg-surface px-3 py-2.5 shadow-[0_0_0_1px_color-mix(in_srgb,var(--warning)_35%,transparent),0_1px_2px_rgba(0,0,0,0.04)]"
        onKeyDown={(e) => {
          if (e.key === 'y' || e.key === 'Enter') onDecide('allow_once');
          if (e.key === 'a') onDecide('allow_always');
          if (e.key === 'n' || e.key === 'Escape') onDecide('deny');
        }}
      >
        <div className="font-mono text-content leading-[1.6] text-primary">{event.summary}</div>
        <pre className="selectable mt-2 max-h-40 overflow-auto rounded-md bg-[var(--term-bg)] px-3 py-2 font-mono text-[12.5px] leading-[1.55] text-[var(--term-fg)] shadow-[inset_0_0_0_1px_var(--border-subtle)]">
          {event.detail}
        </pre>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="primary" autoFocus onClick={() => onDecide('allow_once')}>
            {t('Allow once')}
          </Button>
          <Button size="sm" onClick={() => onDecide('allow_always')}>
            {t('Always allow')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDecide('deny')}>
            {t('Deny')}
          </Button>
          <span className="ml-auto hidden items-center gap-2 text-[11px] text-muted sm:flex">
            <Shortcut combo="y" /> {t('allow')}
            <Shortcut combo="n" /> {t('deny')}
          </span>
        </div>
      </motion.div>
    </Row>
  );
});
