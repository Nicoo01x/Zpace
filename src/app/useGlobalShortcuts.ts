import { useEffect } from 'react';
import { matchesShortcut, isMac } from '@/lib/platform';
import { useLayouts, layoutsFor } from '@/stores/layouts';
import { listen } from '@/native/bridge';
import { useUI, collectLeaves } from '@/stores/ui';
import { useWorkspaceActions } from '@/features/sessions/useWorkspaceActions';
import { bindWorkspaceActions } from '@/features/sessions/actions-ref';
import { startVoice } from '@/features/voice/agent';

let keyRelay: Promise<() => void> | null = null;

/** Application-wide keyboard shortcuts (see app/shortcuts.ts for the list). */
export function useGlobalShortcuts() {
  const actions = useWorkspaceActions();
  const { newSession, openProject, closeActivePane, openTerminalPane, newNote, currentProject } = actions;
  // The voice assistant's tools act through the same actions, outside React.
  useEffect(() => bindWorkspaceActions(actions), [actions]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUI.getState();
      const inEditable = (e.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable="true"], .xterm');
      if (matchesShortcut(e, 'mod+k') || matchesShortcut(e, 'mod+shift+p')) {
        e.preventDefault();
        if (ui.paletteOpen && ui.paletteMode === 'commands') ui.closePalette();
        else ui.openPalette('commands');
      } else if (matchesShortcut(e, 'mod+p')) {
        e.preventDefault();
        ui.openPalette('files');
      } else if (matchesShortcut(e, 'mod+shift+enter')) {
        e.preventDefault();
        ui.toggleZoom();
      } else if (matchesShortcut(e, 'mod+shift+f')) {
        e.preventDefault();
        ui.setSearchOpen(true);
      } else if (matchesShortcut(e, 'mod+shift+s')) {
        e.preventDefault();
        ui.setSidebarFilterOpen(!ui.sidebarFilterOpen);
      } else if (matchesShortcut(e, 'mod+b')) {
        e.preventDefault();
        ui.toggleSidebar();
      } else if (matchesShortcut(e, 'mod+shift+e')) {
        e.preventDefault();
        ui.toggleExplorer();
      } else if (matchesShortcut(e, 'mod+shift+g')) {
        e.preventDefault();
        ui.toggleGitPanel();
      } else if (e.altKey && (isMac ? e.metaKey : e.ctrlKey) && /^[1-9]$/.test(e.key)) {
        // Ctrl+Alt+1…9: the saved layouts of this project (then the global ones), in the order the palette lists them.
        const list = layoutsFor(useLayouts.getState().layouts, currentProject()?.id);
        const item = list[Number(e.key) - 1];
        if (item) {
          e.preventDefault();
          useLayouts.getState().apply(item.id);
        }
      } else if (matchesShortcut(e, 'mod+`')) {
        e.preventDefault();
        ui.toggleTerminalPanel();
      } else if (matchesShortcut(e, 'mod+shift+space')) {
        e.preventDefault();
        startVoice();
      } else if (matchesShortcut(e, 'mod+shift+t')) {
        e.preventDefault();
        openTerminalPane();
      } else if (matchesShortcut(e, 'mod+shift+n')) {
        e.preventDefault();
        newNote();
      } else if (matchesShortcut(e, 'mod+n')) {
        e.preventDefault();
        newSession();
      } else if (matchesShortcut(e, 'mod+o')) {
        e.preventDefault();
        void openProject();
      } else if (matchesShortcut(e, 'mod+comma')) {
        e.preventDefault();
        if (ui.settingsOpen) ui.closeSettings();
        else ui.openSettings();
      } else if (matchesShortcut(e, 'mod+w')) {
        // Never let the webview close the window.
        e.preventDefault();
        if (ui.settingsOpen) ui.closeSettings();
        else if (ui.diffViewer) ui.closeDiff();
        else closeActivePane();
      } else if (e.key === 'Escape' && !inEditable) {
        if (ui.searchOpen) ui.setSearchOpen(false);
      }
    };
    // Spotlight and the window stack are caught before the editor / terminal see the key.
    const onSpotlight = (e: KeyboardEvent) => {
      const ui = useUI.getState();
      if (e.key === 'Tab' && e.ctrlKey && !e.altKey && !ui.stackOpen && collectLeaves(ui.layout).filter((l) => l.content.kind !== 'empty').length > 1) {
        e.preventDefault();
        e.stopPropagation();
        ui.setStackOpen(true);
        return;
      }
      if (!matchesShortcut(e, 'mod+space')) return;
      e.preventDefault();
      e.stopPropagation();
      ui.setSpotlightOpen(!ui.spotlightOpen);
    };
    window.addEventListener('keydown', onSpotlight, true);
    window.addEventListener('keydown', onKey);
    // Shortcuts pressed inside an embedded browser page arrive from Rust; replay them here as if typed in the host.
    // One listener for the app (the effect re-runs, StrictMode double-mounts): a second copy would toggle things twice.
    if (!keyRelay) {
      keyRelay = listen<{ key: string; code: string; shift: boolean; alt: boolean }>('browser://key', (k) => {
        const key = k.key === 'space' ? ' ' : k.key === 'escape' ? 'Escape' : k.key;
        const mod = key !== 'Escape';
        const ev = new KeyboardEvent('keydown', { key, code: k.code, ctrlKey: mod && !isMac, metaKey: mod && isMac, shiftKey: k.shift, altKey: k.alt, bubbles: true, cancelable: true });
        (document.activeElement ?? document.body).dispatchEvent(ev);
      });
    }
    return () => {
      window.removeEventListener('keydown', onSpotlight, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [closeActivePane, newSession, openProject, openTerminalPane, newNote, currentProject]);
}
