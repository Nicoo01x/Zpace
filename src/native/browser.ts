import { invoke, isTauri, listen } from './bridge';
import { useSettings } from '@/stores/settings';
import { engineById } from '@/features/browser/engines';

/**
 * Embedded browser bridge — a native child webview positioned over a pane.
 * In the browser preview a sandboxed <iframe> is used instead (many sites
 * refuse to be framed; the desktop shell has no such limitation).
 */

export const browserAvailable = isTauri;

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function browserOpen(label: string, url: string, b: Bounds) {
  await invoke('browser_open', { label, url, ...b });
}
export async function browserNavigate(label: string, url: string) {
  await invoke('browser_navigate', { label, url });
}
export async function browserEval(label: string, js: string) {
  await invoke('browser_eval', { label, js });
}
export async function browserSetBounds(label: string, b: Bounds) {
  await invoke('browser_set_bounds', { label, ...b });
}
export async function browserSetVisible(label: string, visible: boolean) {
  await invoke('browser_set_visible', { label, visible });
}
export async function browserClose(label: string) {
  await invoke('browser_close', { label });
}
export async function browserZoom(label: string, factor: number) {
  await invoke('browser_zoom', { label, factor });
}
export async function browserDevtools(label: string) {
  await invoke('browser_devtools', { label });
}

/* ------------------------------------------------------------------ */
/*  Device preview (plugins): shape, emulation, snapshot                */
/* ------------------------------------------------------------------ */

/** A cut-out of a shaped webview, CSS px from its top-left corner (may start outside it). */
export interface ShapeHole {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

/** Clip the webview to a rounded rectangle minus holes. Resolves false where the platform cannot shape it. */
export async function browserSetShape(label: string, width: number, height: number, radius: number, holes: ShapeHole[] = []): Promise<boolean> {
  return invoke('browser_set_shape', { label, width, height, radius, holes });
}

/** What Chrome's device mode pretends, over the DevTools protocol. */
export interface Emulation {
  /** CSS px of the viewport; 0 derives it from the bounds and the scale, as device mode does. */
  width?: number;
  height?: number;
  /** What `screen.width` / `screen.height` report. */
  screenWidth?: number;
  screenHeight?: number;
  /** Keep the view at its own size while `width`/`height` set the layout viewport (drawn at `scale`). */
  keepViewSize?: boolean;
  deviceScaleFactor: number;
  mobile: boolean;
  touch: boolean;
  userAgent?: string;
  platform?: string;
  userAgentMetadata?: unknown;
  colorScheme?: 'light' | 'dark' | '';
  /** Draw the emulated viewport at this factor. */
  scale?: number;
}

/** Emulate a device (or undo it with null). Resolves false where the platform has no protocol access. */
export async function browserEmulate(label: string, emulation: Emulation | null): Promise<boolean> {
  return invoke('browser_emulate', { label, emulation });
}

/** One DevTools protocol call on the webview; resolves with the method's result. */
export async function browserCdp(label: string, method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  return invoke('browser_cdp', { label, method, params });
}

/** A PNG (base64) of what the webview shows right now. */
export async function browserSnapshot(label: string): Promise<string> {
  return invoke('browser_snapshot', { label });
}

export interface BrowserEvents {
  onNavigated?: (url: string) => void;
  onTitle?: (title: string) => void;
  onLoading?: (loading: boolean) => void;
}

export async function browserListen(label: string, handlers: BrowserEvents): Promise<() => void> {
  const offs = await Promise.all([
    listen<{ label: string; url: string }>('browser://navigated', (p) => p.label === label && handlers.onNavigated?.(p.url)),
    listen<{ label: string; title: string }>('browser://title', (p) => p.label === label && handlers.onTitle?.(p.title)),
    listen<{ label: string; loading: boolean }>('browser://loading', (p) => p.label === label && handlers.onLoading?.(p.loading)),
  ]);
  return () => offs.forEach((off) => off());
}

/** Turn what the user typed into a URL (search when it is not one). */
export function normalizeUrl(input: string): string {
  const t = input.trim();
  if (!t) return 'about:blank';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t) || t.startsWith('about:')) return t;
  if (/^localhost(:\d+)?(\/|$)/.test(t) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(t)) return `http://${t}`;
  if (/^[^\s]+\.[a-z]{2,}(\/|$)/i.test(t)) return `https://${t}`;
  return engineById(useSettings.getState().browser.searchEngine).query.replace('%s', encodeURIComponent(t));
}

/** Screenshot of a region of the window (CSS px, relative to the content area). PNG base64; optionally to the clipboard too. */
export async function captureRegion(rect: { x: number; y: number; width: number; height: number }, clipboard: boolean): Promise<{ png: string; width: number; height: number }> {
  return invoke('capture_region', { ...rect, clipboard });
}

export async function captureRegionToFile(rect: { x: number; y: number; width: number; height: number }, path: string): Promise<void> {
  await invoke('capture_region_to_file', { ...rect, path });
}

/** Put a PNG (base64) on the clipboard as an image. */
export async function clipboardWritePng(png: string): Promise<void> {
  await invoke('clipboard_write_png', { png });
}

/** Write a PNG (base64) to disk. */
export async function writePng(path: string, png: string): Promise<void> {
  await invoke('write_png', { path, png });
}
