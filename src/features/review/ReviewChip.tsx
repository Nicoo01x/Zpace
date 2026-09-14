import { FileDiff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useShallow } from 'zustand/react/shallow';
import { springs } from '@/lib/motion';
import { useReview, pendingFor } from '@/stores/review';
import { openReview } from './open-review';
import { Tooltip } from '@/components/ui/Tooltip';
import { t } from '@/i18n';

/** "N files to review" in the session footer, while the agent's writes are still unreviewed. */
export function ReviewChip({ sessionId }: { sessionId: string }) {
  const count = useReview(useShallow((s) => pendingFor(s.pending, sessionId).length));
  return (
    <AnimatePresence initial={false}>
      {count ? (
        <motion.span key="chip" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.12 } }} transition={springs.pop} className="inline-flex items-center">
          <span className="text-muted">·</span>
          <Tooltip content={t('Review what the agent changed: keep or discard per file or per hunk')} side="top">
            <button type="button" onClick={() => openReview(sessionId)} className="ml-2 inline-flex items-center gap-1.5 rounded-[4px] text-accent outline-none transition-colors hover:text-primary">
              <FileDiff className="size-[12px]" strokeWidth={1.75} />
              {t('{n} files to review', { n: count })}
            </button>
          </Tooltip>
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}
