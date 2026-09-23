import { memo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useTerminals } from '@/stores/terminals';
import { springs } from '@/lib/motion';
import { XTerminal } from './XTerminal';
import { TerminalFindBar } from './TerminalFindBar';
import { ClaudeChanges } from './ClaudeChanges';
import { useClaudeLive } from './claude-live';
import { useChangesWatch } from './claude-changes';
import { t } from '@/i18n';

/** A terminal living in a workspace pane (split view); with Claude Code running in it, its changes sit on the right. */
export const TerminalView = memo(function TerminalView({ terminalId, focused, onExit }: { terminalId: string; focused: boolean; onExit?: () => void }) {
  const tab = useTerminals((s) => s.tabs.find((t) => t.id === terminalId));
  const closeTab = useTerminals((s) => s.closeTab);
  const since = useClaudeLive((s) => s.byTab[terminalId]?.since ?? null);
  const panelOpen = useClaudeLive((s) => s.panelOpen);
  useChangesWatch(terminalId, tab?.cwd ?? '', tab?.cwd ? since : null);
  if (!tab) return <div className="flex h-full items-center justify-center text-[12.5px] text-muted">{t('Terminal closed')}</div>;
  const showChanges = since !== null && panelOpen && !!tab.cwd;
  return (
    <div className="flex h-full min-h-0">
      <div className="relative h-full min-h-0 min-w-0 flex-1">
        <TerminalFindBar terminalId={tab.id} />
        <XTerminal
          tab={tab}
          focused={focused}
          onExit={(code) => {
            // Keep the pane on failure so the exit message stays readable.
            if (code !== 0) return;
            closeTab(tab.id);
            onExit?.();
          }}
        />
      </div>
      <AnimatePresence initial={false}>
        {showChanges ? (
          <motion.div key="changes" className="h-full" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={springs.snappy}>
            {/* Keyed by tab: the pane can switch terminals, and the last one's rows must not linger on their way out. */}
            <ClaudeChanges key={tab.id} tabId={tab.id} cwd={tab.cwd} since={since} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
});
