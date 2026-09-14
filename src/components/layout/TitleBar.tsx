import { useEffect, useState } from 'react';
import { PanelLeft, GitCompareArrows, FolderTree } from 'lucide-react';
import { cn } from '@/lib/cn';
import { isMac, isTauri } from '@/lib/platform';
import { useUI } from '@/stores/ui';
import { useSessions } from '@/stores/sessions';
import { useProjects } from '@/stores/projects';
import { IconButton } from '@/components/ui/IconButton';
import { Tooltip } from '@/components/ui/Tooltip';
import { NotesChip } from '@/features/notes/NotesChip';
import { UsageChip } from '@/features/agent/UsageChip';
import { UsageBar } from '@/features/agent/UsageBar';
import { MascotTitleBar } from '@/features/mascot/MascotView';
import { Island } from '@/features/island/Island';
import { closeWindow, isMaximized, minimizeWindow, onMaximizedChange, toggleMaximizeWindow } from '@/native/window';
import { t } from '@/i18n';

/**
 * Title bar.
 *
 * Reference composition: the window canvas is the sidebar's grey; the
 * workspace card carries its own header. On Windows a slim strip hosts the
 * caption buttons; on macOS the traffic lights sit inside the sidebar column
 * and this strip is not rendered (see `SidebarTop`).
 */
export function TitleBar() {
  const welcomeOpen = useUI((s) => s.welcomeOpen);
  if (isMac) return null;
  return (
    <header data-tauri-drag-region className={cn('titlebar relative flex h-(--titlebar-height) shrink-0 select-none items-center pl-2', welcomeOpen ? 'z-[925] bg-transparent' : 'z-20')}>
      <UsageBar />
      <Island />
      <SidebarControls />
      <div data-tauri-drag-region className="flex-1" />
      <MascotTitleBar />
      <WindowControls />
    </header>
  );
}

/** Sidebar toggle, notes chip and pending-changes chip. Shared by the Windows strip and the macOS sidebar top. */
export function SidebarControls() {
  const sidebarOpen = useUI((s) => s.sidebarOpen);
  const toggleSidebar = useUI((s) => s.toggleSidebar);
  const toggleGitPanel = useUI((s) => s.toggleGitPanel);
  const explorerOpen = useUI((s) => s.explorerOpen);
  const toggleExplorer = useUI((s) => s.toggleExplorer);
  const activeSessionId = useUI((s) => s.activeSessionId);
  const session = useSessions((s) => (activeSessionId ? s.sessions[activeSessionId] : undefined));
  const project = useProjects((s) => s.projects.find((p) => p.id === session?.projectId) ?? s.projects[0]);
  const changes = (project?.git?.dirty ?? 0) || (session?.dirtyFiles ?? 0);

  return (
    <div className="titlebar-group flex items-center gap-0.5 no-drag">
      <IconButton label={sidebarOpen ? t('Hide sidebar') : t('Show sidebar')} shortcut="mod+b" size="md" onClick={toggleSidebar}>
        <PanelLeft />
      </IconButton>
      <IconButton label={t(explorerOpen ? 'Hide file explorer' : 'Show file explorer')} shortcut="mod+shift+e" size="md" active={explorerOpen} onClick={toggleExplorer}>
        <FolderTree />
      </IconButton>
      <NotesChip />
      <UsageChip />
      {changes > 0 ? (
        <Tooltip content={`${changes} changed ${changes === 1 ? 'file' : 'files'} · open git panel`} shortcut="mod+shift+g">
          <button
            type="button"
            onClick={toggleGitPanel}
            className="inline-flex h-8 items-center gap-1 rounded-md px-1.5 text-[12.5px] text-secondary transition-colors duration-(--motion-fast) hover:bg-surface-hover hover:text-primary"
          >
            <GitCompareArrows className="size-[15px]" />
            <span className="tabular">{changes}</span>
          </button>
        </Tooltip>
      ) : null}
    </div>
  );
}

/** Windows 11-style caption buttons. */
export function WindowControls() {
  const [max, setMax] = useState(false);
  useEffect(() => {
    if (!isTauri) return;
    let un: (() => void) | undefined;
    void isMaximized().then(setMax);
    void onMaximizedChange(setMax).then((u) => (un = u));
    return () => un?.();
  }, []);

  const btn =
    'inline-flex h-(--titlebar-height) w-[46px] items-center justify-center text-primary/80 transition-colors duration-(--motion-instant) hover:bg-surface-hover active:bg-surface-active no-drag';

  return (
    <div className="flex h-full items-stretch no-drag">
      <button type="button" aria-label={t('Minimize')} className={btn} onClick={() => void minimizeWindow()}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
      <button type="button" aria-label={max ? t('Restore') : t('Maximize')} className={btn} onClick={() => void toggleMaximizeWindow().then(() => isMaximized().then(setMax))}>
        {max ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
            <path d="M2.5 2.5V1.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1" stroke="currentColor" strokeWidth="1" />
            <rect x="0.5" y="2.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
            <rect x="0.5" y="0.5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1" />
          </svg>
        )}
      </button>
      <button type="button" aria-label={t('Close')} className={cn(btn, 'hover:bg-[#c42b1c] hover:text-white active:bg-[#b3271a]')} onClick={() => void closeWindow()}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
    </div>
  );
}
