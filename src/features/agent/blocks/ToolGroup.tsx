import { memo, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight, Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ToolEvent } from '../blocks';
import { sectionize } from '../blocks';
import { Collapsible } from '@/components/ui/Collapsible';
import { Spinner } from '@/components/ui/Spinner';
import { CommandExecution } from './CommandExecution';
import { springs } from '@/lib/motion';
import { truncateMiddle } from '@/lib/format';
import { Row } from './Row';
import { t } from '@/i18n';

/**
 * ToolGroup — "Searched for 10 patterns, listed 4 directories, ran 6 shell
 * commands". A quiet grey line at the text column; click unfolds the
 * sections with a spring so they feel attached to the summary.
 * While a command is still running the group shows it inline.
 */
export const ToolGroup = memo(function ToolGroup({ events, summary, running }: { events: ToolEvent[]; summary: string; running: boolean }) {
  const [open, setOpen] = useState(false);
  // Running → done: flash a check next to the summary for a moment.
  const [wasRunning, setWasRunning] = useState(running);
  const [justDone, setJustDone] = useState(false);
  if (wasRunning !== running) {
    setWasRunning(running);
    if (!running) setJustDone(true);
  }
  useEffect(() => {
    if (!justDone) return;
    const id = window.setTimeout(() => setJustDone(false), 1400);
    return () => window.clearTimeout(id);
  }, [justDone]);
  const sections = sectionize(events);
  const live = running ? events.find((e) => (e.type === 'shell_command' || e.type === 'tool_call') && e.status === 'running') : undefined;

  return (
    <div className="group/tools">
      <Row
        gutter={
          <motion.span
            animate={{ rotate: open ? 90 : 0 }}
            transition={springs.snappy}
            className={cn('inline-flex h-[21px] items-center text-muted transition-opacity duration-(--motion-fast)', open ? 'opacity-100' : 'opacity-0 group-hover/tools:opacity-100')}
          >
            <ChevronRight className="size-[13px]" strokeWidth={2} />
          </motion.span>
        }
      >
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            '-mx-1.5 inline-flex max-w-full items-center gap-2 rounded-[5px] px-1.5 text-left font-mono text-content leading-[1.6] text-secondary outline-none transition-colors duration-(--motion-fast)',
            'hover:bg-surface-hover hover:text-primary focus-visible:bg-surface-hover',
            open && 'text-primary',
          )}
        >
          <span className="truncate">{summary}</span>
          {running ? <Spinner size={11} /> : null}
          <AnimatePresence>
            {justDone ? (
              <motion.span
                key="done"
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0, transition: { duration: 0.15 } }}
                transition={springs.pop}
                className="inline-flex text-success"
              >
                <Check className="size-[13px]" strokeWidth={2.5} />
              </motion.span>
            ) : null}
          </AnimatePresence>
        </button>

        {live && !open ? (
          <div className="mt-1">
            {live.type === 'shell_command' ? (
              <CommandExecution event={live} />
            ) : (
              <div className="flex items-center gap-2 font-mono text-[12.5px] text-secondary">
                <Spinner size={11} />
                <span>{t('Using {tool}…', { tool: live.type === 'tool_call' ? live.label : t('tool') })}</span>
              </div>
            )}
          </div>
        ) : null}

        <Collapsible open={open}>
          <div className="mt-2 flex flex-col gap-3 pb-1 font-mono">
            {sections.search.length ? (
              <Section title={t('Search')}>
                {sections.search.map((s) => (
                  <Line key={s.id}>
                    <span className="w-[44px] shrink-0 text-muted">{s.kind === 'pattern' ? 'grep' : s.kind === 'glob' ? 'glob' : 'ls'}</span>
                    <span className="truncate text-primary/90">{s.query}</span>
                    {s.path ? <span className="truncate text-muted">{t('in {path}', { path: s.path })}</span> : null}
                    {typeof s.matches === 'number' ? <span className="ml-auto shrink-0 pl-3 tabular text-muted">{s.matches}</span> : null}
                  </Line>
                ))}
              </Section>
            ) : null}
            {sections.commands.length ? (
              <Section title={t('Commands')}>
                <div className="flex flex-col gap-0.5">
                  {sections.commands.map((c) => (
                    <CommandExecution key={c.id} event={c} />
                  ))}
                </div>
              </Section>
            ) : null}
            {sections.reads.length ? (
              <Section title={t('Files inspected')}>
                {sections.reads.map((r) => (
                  <Line key={r.id}>
                    <span className="truncate text-primary/90">{truncateMiddle(r.path, 72)}</span>
                    {r.lines ? <span className="ml-auto shrink-0 pl-3 tabular text-muted">{t('{n} lines', { n: r.lines })}</span> : null}
                  </Line>
                ))}
              </Section>
            ) : null}
            {sections.other.length ? (
              <Section title={t('Tools')}>
                {sections.other.map((x) => (
                  <Line key={x.id}>
                    <span className="shrink-0 text-primary/90">{x.label}</span>
                    <span className="truncate text-muted">{summarizeInput(x.input)}</span>
                    {x.status === 'running' ? <Spinner size={10} className="ml-auto" /> : null}
                  </Line>
                ))}
              </Section>
            ) : null}
          </div>
        </Collapsible>
      </Row>
    </div>
  );
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-0.5 text-[12px] text-muted">{title}</div>
      <div className="flex flex-col pl-4">{children}</div>
    </div>
  );
}

function Line({ children }: { children: React.ReactNode }) {
  return <div className="flex h-[21px] items-center gap-2 text-[12.5px] leading-none">{children}</div>;
}

function summarizeInput(input: Record<string, unknown>): string {
  const entries = Object.entries(input);
  if (!entries.length) return '';
  return entries
    .slice(0, 2)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v.slice(0, 48) : JSON.stringify(v).slice(0, 48)}`)
    .join(' · ');
}
