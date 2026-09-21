import { memo, useState } from 'react';
import { motion } from 'motion/react';
import { Check, ChevronRight, Copy, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ShellCommandEvent } from '@/types/agent';
import { Collapsible } from '@/components/ui/Collapsible';
import { Spinner } from '@/components/ui/Spinner';
import { formatDuration } from '@/lib/format';
import { springs } from '@/lib/motion';
import { toast } from '@/features/notifications/toast-store';
import { t } from '@/i18n';
import { copyText } from '@/lib/clipboard';

/**
 * Shell command row.
 *   closed: ✓ npm run build        4.2s
 *   open:   the command's output in a monospace pane with a copy button.
 */
export const CommandExecution = memo(function CommandExecution({ event }: { event: ShellCommandEvent }) {
  const [open, setOpen] = useState(false);
  const running = event.status === 'running' || event.status === 'pending';
  const failed = event.status === 'error';
  const hasOutput = Boolean(event.output && event.output.trim());

  return (
    <div className="min-w-0">
      <button
        type="button"
        aria-expanded={open}
        disabled={!hasOutput && !running}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'group/cmd -ml-1.5 flex h-[22px] w-[calc(100%+6px)] items-center gap-2 rounded-[5px] pl-1.5 pr-2 text-left font-mono text-[12.5px] outline-none transition-colors duration-(--motion-fast)',
          'enabled:hover:bg-surface-hover focus-visible:bg-surface-hover',
        )}
      >
        <span className="inline-flex size-[14px] shrink-0 items-center justify-center">
          {running ? (
            <Spinner size={11} />
          ) : failed ? (
            <X className="size-[12px] text-danger" strokeWidth={2.4} />
          ) : (
            <Check className="size-[12px] text-success" strokeWidth={2.4} />
          )}
        </span>
        <span className="truncate text-primary/90">
          <span className="text-muted">$ </span>
          {event.command}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2 pl-3 tabular text-[11.5px] text-muted">
          {failed && event.exitCode !== undefined ? <span className="text-danger">{t('exit {code}', { code: event.exitCode })}</span> : null}
          {event.durationMs !== undefined ? <span>{formatDuration(event.durationMs)}</span> : running ? <span>{t('running')}</span> : null}
          {hasOutput ? (
            <motion.span animate={{ rotate: open ? 90 : 0 }} transition={springs.snappy} className="inline-flex text-muted opacity-0 transition-opacity group-hover/cmd:opacity-100">
              <ChevronRight className="size-[12px]" />
            </motion.span>
          ) : null}
        </span>
      </button>
      <Collapsible open={open && hasOutput}>
        <div className="group/out relative mt-1 mb-1 max-h-[320px] overflow-auto rounded-md bg-[var(--term-bg)] px-3 py-2 shadow-[inset_0_0_0_1px_var(--border-subtle)]">
          <pre className="selectable whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.55] text-[var(--term-fg)]">{event.output}</pre>
          <button
            type="button"
            aria-label={t('Copy output')}
            onClick={() => {
              void copyText(event.output ?? '');
              toast.neutral(t('Output copied'));
            }}
            className="absolute right-1.5 top-1.5 inline-flex size-6 items-center justify-center rounded-md bg-surface text-muted opacity-0 shadow-[0_0_0_1px_var(--border)] transition-opacity duration-(--motion-fast) hover:text-primary group-hover/out:opacity-100 focus-visible:opacity-100"
          >
            <Copy size={12} />
          </button>
        </div>
      </Collapsible>
    </div>
  );
});
