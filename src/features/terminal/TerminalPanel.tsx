import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Plus, X, ChevronDown, SplitSquareHorizontal, Trash2, Pencil, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Swap } from '@/components/ui/Living';
import { useTerminals } from '@/stores/terminals';
import { useUI } from '@/stores/ui';
import { useEnvironment } from '@/stores/environment';
import { XTerminal } from './XTerminal';
import { IconButton } from '@/components/ui/IconButton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/ContextMenu';
import { useWorkspaceActions } from '@/features/sessions/useWorkspaceActions';
import { springs } from '@/lib/motion';
import { ShellIcon } from './ShellIcon';
import { PixelGrid } from '@/components/ui/LoadingState';
import { useTerminalActivity } from './activity';
import type { ShellInfo } from '@/types/workspace';
import { t as tr } from '@/i18n';

const NO_SHELLS: ShellInfo[] = [];

/** Bottom terminal drawer with tabs. Ctrl+` toggles it. */
export function TerminalPanel() {
  const tabs = useTerminals((s) => s.tabs);
  const activeTabId = useTerminals((s) => s.activeTabId);
  const setActive = useTerminals((s) => s.setActive);
  const closeTab = useTerminals((s) => s.closeTab);
  const renameTab = useTerminals((s) => s.renameTab);
  const toggleTerminalPanel = useUI((s) => s.toggleTerminalPanel);
  const shells = useEnvironment((s) => s.report?.shells ?? NO_SHELLS);
  const { openTerminal, splitActive } = useWorkspaceActions();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const busyTabs = useTerminalActivity((s) => s.busy);

  useEffect(() => {
    // Read the store directly: StrictMode runs effects twice and the closure would be stale.
    if (useTerminals.getState().tabs.length === 0) openTerminal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--term-bg)]">
      <div className="flex h-8 shrink-0 items-center gap-0.5 bg-background pl-1 pr-1 hairline-b">
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {tabs.map((t) => {
            const isActive = t.id === active?.id;
            return (
              <ContextMenu key={t.id}>
                <ContextMenuTrigger asChild>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActive(t.id)}
                    onDoubleClick={() => {
                      setDraft(t.title);
                      setEditing(t.id);
                    }}
                    className={cn(
                      'group/tab relative flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px] outline-none transition-colors duration-(--motion-fast)',
                      isActive ? 'text-primary' : 'text-secondary hover:bg-surface-hover hover:text-primary',
                    )}
                  >
                    {isActive ? <motion.span layoutId="terminal-tab" transition={springs.layout} className="absolute inset-0 -z-10 rounded-md bg-surface-active" /> : null}
                    {busyTabs[t.id] ? <PixelGrid className="text-primary" /> : <ShellIcon shellId={t.shellId} className="size-[12px] text-muted" />}
                    <Swap k={editing === t.id ? 'edit' : 'label'} className="flex min-w-0 flex-1 items-center">
                      {editing === t.id ? (
                        <input
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => {
                            if (draft.trim()) renameTab(t.id, draft.trim());
                            setEditing(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                            if (e.key === 'Escape') setEditing(null);
                          }}
                          className="w-28 bg-transparent outline-none"
                        />
                      ) : (
                        <span className="max-w-[160px] truncate">{t.title === t.shellId ? (shells.find((sh) => sh.id === t.shellId)?.label ?? t.title) : t.title}</span>
                      )}
                    </Swap>
                    <span
                      role="button"
                      aria-label={tr('Close terminal')}
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(t.id);
                      }}
                      className="ml-0.5 inline-flex size-4 items-center justify-center rounded-[3px] text-muted opacity-0 transition-opacity hover:bg-surface-active hover:text-primary group-hover/tab:opacity-100"
                    >
                      <X className="size-[11px]" />
                    </span>
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem
                    icon={<Pencil />}
                    onSelect={() => {
                      setDraft(t.title);
                      setEditing(t.id);
                    }}
                  >
                    {tr('Rename')}
                  </ContextMenuItem>
                  <ContextMenuItem icon={<SplitSquareHorizontal />} onSelect={() => openTerminal({ split: 'horizontal', shellId: t.shellId, cwd: t.cwd })}>
                    {tr('Split terminal')}
                  </ContextMenuItem>
                  <ContextMenuItem icon={<Maximize2 />} onSelect={() => { splitActive('horizontal', { kind: 'terminal', terminalId: t.id }); toggleTerminalPanel(); }}>
                    {tr('Move to editor area')}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem icon={<Trash2 />} danger onSelect={() => closeTab(t.id)}>
                    {tr('Kill terminal')}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={tr('New terminal')}
              className="inline-flex h-7 items-center gap-0.5 rounded-md px-1.5 text-secondary transition-colors hover:bg-surface-hover hover:text-primary data-[state=open]:bg-surface-hover"
            >
              <Plus className="size-[14px]" />
              <ChevronDown className="size-[11px] text-muted" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{tr('New terminal')}</DropdownMenuLabel>
            {shells.map((s) => (
              <DropdownMenuItem key={s.id} icon={<ShellIcon shellId={s.id} />} onSelect={() => openTerminal({ shellId: s.id })}>
                {s.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <IconButton label={tr('Split terminal')} onClick={() => openTerminal({ split: 'horizontal' })}>
          <SplitSquareHorizontal />
        </IconButton>
        <IconButton label={tr('Close panel')} shortcut="mod+`" onClick={toggleTerminalPanel}>
          <X />
        </IconButton>
      </div>
      <div className="relative min-h-0 flex-1">
        {tabs.map((t) => (
          <div key={t.id} className={cn('absolute inset-0', t.id === active?.id ? 'visible' : 'invisible')}>
            <XTerminal tab={t} focused={t.id === active?.id} onExit={(code) => code === 0 && closeTab(t.id)} />
          </div>
        ))}
      </div>
    </div>
  );
}
