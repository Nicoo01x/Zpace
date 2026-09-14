import { memo, useState } from 'react';
import { motion } from 'motion/react';
import { ChevronRight, AlertTriangle } from 'lucide-react';
import type { ErrorEvent, ImageEvent, ThinkingEvent } from '@/types/agent';
import { Collapsible } from '@/components/ui/Collapsible';
import { AttachmentStrip } from './AttachmentStrip';
import { springs } from '@/lib/motion';
import { cn } from '@/lib/cn';
import { Row } from './Row';
import { t } from '@/i18n';

/** Collapsed "Thinking" line; expands to the raw reasoning in a quiet italic. */
export const ThinkingState = memo(function ThinkingState({ event }: { event: ThinkingEvent }) {
  const [open, setOpen] = useState(false);
  return (
    <Row
      gutter={
        <motion.span animate={{ rotate: open ? 90 : 0 }} transition={springs.snappy} className="inline-flex h-[21px] items-center text-muted">
          <ChevronRight className="size-[13px]" strokeWidth={2} />
        </motion.span>
      }
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          '-mx-1.5 inline-flex items-center rounded-[5px] px-1.5 font-mono text-content leading-[1.6] text-secondary outline-none transition-colors duration-(--motion-fast) hover:bg-surface-hover hover:text-primary',
          event.streaming && 'shimmer-text',
        )}
      >
        {event.streaming ? t('Thinking…') : t('Thought for a moment')}
      </button>
      <Collapsible open={open}>
        <div className="selectable mt-1 whitespace-pre-wrap font-mono text-[12.5px] italic leading-[1.6] text-secondary">{event.text || '…'}</div>
      </Collapsible>
    </Row>
  );
});

export const ErrorBlock = memo(function ErrorBlock({ event }: { event: ErrorEvent }) {
  return (
    <Row gutter={<AlertTriangle className="mt-[4px] size-[13px] text-danger" />}>
      <div className="font-mono text-content leading-[1.6]">
        <div className="text-danger">{event.message}</div>
        {event.detail ? <pre className="selectable mt-1 whitespace-pre-wrap text-[12.5px] leading-[1.5] text-secondary">{event.detail}</pre> : null}
      </div>
    </Row>
  );
});

export const ImageBlock = memo(function ImageBlock({ event }: { event: ImageEvent }) {
  return (
    <Row>
      <AttachmentStrip attachments={event.attachments} />
    </Row>
  );
});
