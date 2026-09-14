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
