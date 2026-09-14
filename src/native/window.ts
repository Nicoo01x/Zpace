import { isTauri } from './bridge';

/** Window controls for the custom title bar. No-ops in the browser preview. */

async function win() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  return getCurrentWindow();
}

export async function minimizeWindow() {
  if (!isTauri) return;
  (await win()).minimize();
}

export async function toggleMaximizeWindow() {
  if (!isTauri) return;
  (await win()).toggleMaximize();
}

export async function closeWindow() {
  if (!isTauri) return;
  (await win()).close();
}

export async function isMaximized(): Promise<boolean> {
  if (!isTauri) return false;
  return (await win()).isMaximized();
}

export async function startDragging() {
  if (!isTauri) return;
  (await win()).startDragging();
}

export async function onMaximizedChange(cb: (maximized: boolean) => void): Promise<() => void> {
  if (!isTauri) return () => void 0;
  const w = await win();
  const un = await w.onResized(async () => cb(await w.isMaximized()));
  return un;
}

export async function onFocusChange(cb: (focused: boolean) => void): Promise<() => void> {
  if (!isTauri) {
    const f = () => cb(true);
    const b = () => cb(false);
    window.addEventListener('focus', f);
    window.addEventListener('blur', b);
    return () => {
      window.removeEventListener('focus', f);
      window.removeEventListener('blur', b);
    };
  }
  const w = await win();
  return w.onFocusChanged(({ payload }) => cb(payload));
}
