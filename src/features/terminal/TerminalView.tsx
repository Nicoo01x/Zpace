import { memo } from 'react';
import { useTerminals } from '@/stores/terminals';
import { XTerminal } from './XTerminal';
import { TerminalFindBar } from './TerminalFindBar';
import { t } from '@/i18n';

/** A terminal living in a workspace pane (split view). */
export const TerminalView = memo(function TerminalView({ terminalId, focused, onExit }: { terminalId: string; focused: boolean; onExit?: () => void }) {
  const tab = useTerminals((s) => s.tabs.find((t) => t.id === terminalId));
  const closeTab = useTerminals((s) => s.closeTab);
  if (!tab) return <div className="flex h-full items-center justify-center text-[12.5px] text-muted">{t('Terminal closed')}</div>;
  return (
    <div className="relative h-full min-h-0">
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
  );
});
