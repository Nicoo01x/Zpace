import { FileDiff } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/cn';
import { useReview, allFor, pendingFor } from '@/stores/review';
import { IconButton } from '@/components/ui/IconButton';
import { openReview } from './open-review';
import { t } from '@/i18n';

/** In a session pane's header: everything the agent changed in it, one click away (badge = files still to review, else the total). */
export function ChangesButton({ sessionId }: { sessionId: string }) {
  const { total, pending } = useReview(useShallow((s) => ({ total: allFor(s.pending, sessionId).length, pending: pendingFor(s.pending, sessionId).length })));
  if (!total) return null;
  return (
    <span className="relative inline-flex">
      <IconButton label={pending ? t('{n} files to review · see all changes', { n: pending }) : t('All changes in this session')} size="md" onClick={() => openReview(sessionId)} active={pending > 0}>
        <FileDiff />
      </IconButton>
      <span className={cn('pointer-events-none absolute -right-0.5 -top-0.5 min-w-[14px] rounded-full px-1 text-center text-[9.5px] font-semibold leading-[14px] tabular', pending ? 'bg-accent text-inverse' : 'bg-surface-active text-secondary')}>{pending || total}</span>
    </span>
  );
}
