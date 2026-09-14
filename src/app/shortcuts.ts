export interface ShortcutDef {
  combo: string;
  label: string;
  id: string;
}

/** Single source of truth for global shortcuts (used by the handler and the settings page). */
export const SHORTCUTS: ShortcutDef[] = [
  { id: 'spotlight', combo: 'mod+space', label: 'Spotlight: files, commands, notes, web' },
  { id: 'stack', combo: 'ctrl+tab', label: 'Window stack: cycle open panes' },
  { id: 'palette', combo: 'mod+k', label: 'Command palette' },
  { id: 'commands', combo: 'mod+shift+p', label: 'Commands' },
  { id: 'quickopen', combo: 'mod+p', label: 'Quick open file' },
  { id: 'terminal', combo: 'mod+`', label: 'Toggle terminal' },
  { id: 'newsession', combo: 'mod+n', label: 'New structured Claude session (chat view)' },
  { id: 'newterminal', combo: 'mod+shift+t', label: 'New terminal' },
  { id: 'newnote', combo: 'mod+shift+n', label: 'New note' },
  { id: 'closepane', combo: 'mod+w', label: 'Close pane / session' },
  { id: 'zoom', combo: 'mod+shift+enter', label: 'Maximize / restore the pane' },
  { id: 'search', combo: 'mod+shift+f', label: 'Global search' },
  { id: 'find', combo: 'mod+f', label: 'Find in terminal' },
  { id: 'sidebar', combo: 'mod+b', label: 'Toggle sidebar' },
  { id: 'explorer', combo: 'mod+shift+e', label: 'Toggle file explorer' },
  { id: 'git', combo: 'mod+shift+g', label: 'Git panel' },
  { id: 'settings', combo: 'mod+comma', label: 'Settings' },
  { id: 'openproject', combo: 'mod+o', label: 'Open project' },
  { id: 'focus-toast', combo: 'alt+t', label: 'Focus latest notification' },
  { id: 'filter', combo: 'mod+shift+s', label: 'Filter sidebar' },
  { id: 'layouts', combo: 'mod+alt+1', label: 'Saved layouts 1…9 (this project first)' },
];
