export type Platform = 'windows' | 'macos' | 'linux';

export function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'windows';
  const ua = navigator.userAgent.toLowerCase();
  const plat = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform?.toLowerCase() ?? navigator.platform.toLowerCase();
  if (plat.includes('mac') || ua.includes('mac os')) return 'macos';
  if (plat.includes('win') || ua.includes('windows')) return 'windows';
  return 'linux';
}

export const platform: Platform = detectPlatform();
export const isMac = platform === 'macos';
export const isWindows = platform === 'windows';

/** True when running inside the Tauri webview. */
export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** Symbol for the primary modifier key: ⌘ on macOS, Ctrl elsewhere. */
export const modKey = isMac ? '⌘' : 'Ctrl';
export const altKey = isMac ? '⌥' : 'Alt';
export const shiftKey = isMac ? '⇧' : 'Shift';

/** Format a shortcut like "mod+shift+p" into display keys. */
export function formatShortcut(combo: string): string[] {
  return combo.split('+').map((k) => {
    switch (k.toLowerCase()) {
      case 'mod':
        return modKey;
      case 'ctrl':
        return isMac ? '⌃' : 'Ctrl';
      case 'alt':
        return altKey;
      case 'shift':
        return shiftKey;
      case 'enter':
        return '↵';
      case 'space':
        return 'Space';
      case 'tab':
        return 'Tab';
      case 'escape':
      case 'esc':
        return 'Esc';
      case 'backspace':
        return '⌫';
      case 'up':
        return '↑';
      case 'down':
        return '↓';
      case 'left':
        return '←';
      case 'right':
        return '→';
      case 'comma':
        return ',';
      case 'backquote':
      case '`':
        return '`';
      default:
        return k.length === 1 ? k.toUpperCase() : k;
    }
  });
}

/** Does the keyboard event match the combo ("mod+k", "mod+shift+f", "escape")? */
export function matchesShortcut(e: KeyboardEvent, combo: string): boolean {
  const parts = combo.toLowerCase().split('+');
  const key = parts[parts.length - 1];
  const wantMod = parts.includes('mod');
  const wantCtrl = parts.includes('ctrl');
  const wantAlt = parts.includes('alt');
  const wantShift = parts.includes('shift');
  const mod = isMac ? e.metaKey : e.ctrlKey;
  if (wantMod !== mod) return false;
  if (wantCtrl && !e.ctrlKey) return false;
  if (wantAlt !== e.altKey) return false;
  if (wantShift !== e.shiftKey) return false;
  const k = e.key.toLowerCase();
  const code = e.code.toLowerCase();
  switch (key) {
    case 'comma':
      return k === ',' || code === 'comma';
    case 'backquote':
    case '`':
      return k === '`' || code === 'backquote';
    case 'escape':
    case 'esc':
      return k === 'escape';
    case 'enter':
      return k === 'enter';
    case 'space':
      return k === ' ' || code === 'space';
    default:
      return k === key || code === `key${key}` || code === `digit${key}`;
  }
}
