import { memo, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/cn';
import type { AgentActivity, CompletedEvent } from '@/types/agent';
import { formatClock, formatDuration } from '@/lib/format';
import { AgentGlyph } from '../AgentGlyph';
import { easings } from '@/lib/motion';
import { Row } from './Row';

/** ✱ Brewed for 1m 35s · done 10:43 PM */
export const CompletedStatus = memo(function CompletedStatus({ event }: { event: CompletedEvent }) {
  const verb = event.reason === 'cancelled' ? 'Stopped after' : event.reason === 'error' ? 'Failed after' : 'Brewed for';
  return (
    <Row gutter={<AgentGlyph className="mt-[4px] size-[13px] text-secondary" />}>
      <div className="font-mono text-content leading-[1.6] text-secondary">
        {verb} {formatDuration(event.durationMs)}
        <span className="text-muted"> · </span>
        <span className="text-muted">
          {event.reason === 'done' ? 'done' : event.reason} {formatClock(event.timestamp)}
        </span>
      </div>
    </Row>
  );
});

const activityWord: Record<AgentActivity, string> = {
  idle: 'Brewing',
  thinking: 'Thinking',
  searching: 'Searching',
  reading: 'Reading',
  editing: 'Editing',
  running: 'Running command',
  waiting: 'Waiting for you',
};

/** ✱ Brewing… — shimmering while the agent works, with a live timer. */
export const LiveStatus = memo(function LiveStatus({ activity, startedAt, waiting }: { activity: AgentActivity; startedAt?: number; waiting?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const elapsed = startedAt ? now - startedAt : 0;
  const word = waiting ? activityWord.waiting : (activityWord[activity] ?? 'Brewing');

  return (
    <Row gutter={<AgentGlyph active={!waiting} className={cn('mt-[4px] size-[13px]', waiting ? 'text-warning' : 'text-accent-warm')} />}>
      <div className="flex h-[21px] items-center gap-2 font-mono text-content leading-[1.6]">
        <span className="relative inline-flex items-baseline gap-2">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={word}
              initial={{ opacity: 0, y: 4, filter: 'blur(3px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -4, filter: 'blur(3px)' }}
              transition={{ duration: 0.2, ease: easings.out }}
              className={cn(waiting ? 'text-warning' : 'shimmer-text')}
            >
              {word}…
            </motion.span>
          </AnimatePresence>
          {elapsed > 1500 ? <span className="tabular text-muted">{formatDuration(elapsed)}</span> : null}
        </span>
      </div>
    </Row>
  );
});
