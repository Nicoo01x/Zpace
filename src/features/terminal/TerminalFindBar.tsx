import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowDown, ArrowUp, CaseSensitive, Regex, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { IconButton } from '@/components/ui/IconButton';
import { springs } from '@/lib/motion';
import { useTerminalFind } from './find-store';
import { getTerminal, getTerminalSearch } from './registry';
import { t } from '@/i18n';

/**
 * Find-in-terminal bar (Ctrl+F while a terminal is focused, or the pane's
 * search button). Floats over the top-right corner of the terminal like an
 * editor find widget: query, match counter, previous / next, case, regex.
 */
export function TerminalFindBar({ terminalId }: { terminalId: string }) {
  const open = useTerminalFind((s) => s.openFor === terminalId);
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="find"
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.12 } }}
          transition={springs.snappy}
          className="absolute right-3 top-2 z-20"
        >
          <FindBody terminalId={terminalId} />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function FindBody({ terminalId }: { terminalId: string }) {
  const query = useTerminalFind((s) => s.query);
  const caseSensitive = useTerminalFind((s) => s.caseSensitive);
  const regex = useTerminalFind((s) => s.regex);
  const setQuery = useTerminalFind((s) => s.setQuery);
  const toggleCase = useTerminalFind((s) => s.toggleCase);
  const toggleRegex = useTerminalFind((s) => s.toggleRegex);
  const close = useTerminalFind((s) => s.close);
  const inputRef = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<{ index: number; count: number } | null>(null);

  const options = () => ({
    caseSensitive,
    regex,
    incremental: true,
    decorations: {
      matchBackground: 'rgba(255, 196, 0, 0.35)',
      matchBorder: 'rgba(255, 196, 0, 0.9)',
      matchOverviewRuler: '#ffc400',
      activeMatchBackground: 'rgba(255, 140, 0, 0.6)',
      activeMatchBorder: '#ff8c00',
      activeMatchColorOverviewRuler: '#ff8c00',
    },
  });

  const next = () => getTerminalSearch(terminalId)?.findNext(query, options());
  const prev = () => getTerminalSearch(terminalId)?.findPrevious(query, options());

  // Live results counter from the addon; cleared when the bar closes.
  useEffect(() => {
    const search = getTerminalSearch(terminalId);
    if (!search) return;
    const d = search.onDidChangeResults((e) => setResults(e.resultCount >= 0 ? { index: e.resultIndex, count: e.resultCount } : null));
    return () => {
      d.dispose();
      search.clearDecorations();
      getTerminal(terminalId)?.clearSelection();
    };
  }, [terminalId]);

  // Search as you type (incremental keeps the current match while the query grows).
  useEffect(() => {
    const search = getTerminalSearch(terminalId);
    if (!search) return;
    if (!query) {
      search.clearDecorations();
      return;
    }
    search.findNext(query, { caseSensitive, regex, incremental: true, decorations: options().decorations });
    // options() is derived from the same deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, caseSensitive, regex, terminalId]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const dismiss = () => {
    close();
    getTerminal(terminalId)?.focus();
  };

  // The counter only means something while there is a query; an empty query shows nothing.
  const counter = !query || results === null ? '' : results.count === 0 ? 'No results' : `${results.index + 1} of ${results.count}`;

  return (
    <div className="flex h-8 items-center gap-0.5 rounded-lg bg-surface-raised pl-2 pr-1 shadow-(--shadow-popover)" role="search" aria-label={t('Find in terminal')}>
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('Find')}
        spellCheck={false}
        className="h-7 w-[180px] min-w-0 bg-transparent font-mono text-[12.5px] text-primary outline-none placeholder:text-muted"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) prev();
            else next();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            dismiss();
          }
          e.stopPropagation();
        }}
      />
      <span className={cn('w-[64px] shrink-0 truncate text-right text-[11px] tabular-nums', results?.count === 0 && query ? 'text-danger' : 'text-muted')}>{counter}</span>
      <IconButton label={t('Match case')} size="xs" active={caseSensitive} onClick={toggleCase} className={cn(caseSensitive && 'bg-surface-active text-primary')}>
        <CaseSensitive />
      </IconButton>
      <IconButton label={t('Regular expression')} size="xs" active={regex} onClick={toggleRegex} className={cn(regex && 'bg-surface-active text-primary')}>
        <Regex />
      </IconButton>
      <IconButton label={t('Previous match')} shortcut="shift+enter" size="xs" onClick={prev} disabled={!query}>
        <ArrowUp />
      </IconButton>
      <IconButton label={t('Next match')} shortcut="enter" size="xs" onClick={next} disabled={!query}>
        <ArrowDown />
      </IconButton>
      <IconButton label={t('Close')} shortcut="esc" size="xs" onClick={dismiss}>
        <X />
      </IconButton>
    </div>
  );
}
