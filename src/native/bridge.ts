import { isTauri } from '@/lib/platform';

/**
 * Thin bridge over Tauri's `invoke` / `listen`.
 * In the browser preview (plain `vite`), commands resolve with mock data so
 * the interface can be evaluated without the native shell.
 */

type Unlisten = () => void;

export class NativeUnavailable extends Error {
  constructor(cmd: string) {
    super(`Native command "${cmd}" is unavailable outside the desktop shell`);
    this.name = 'NativeUnavailable';
  }
}

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) throw new NativeUnavailable(cmd);
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
  return tauriInvoke<T>(cmd, args);
}

export async function listen<T>(event: string, handler: (payload: T) => void): Promise<Unlisten> {
  if (!isTauri) return () => void 0;
  const { listen: tauriListen } = await import('@tauri-apps/api/event');
  const un = await tauriListen<T>(event, (e) => handler(e.payload));
  return un;
}

export { isTauri };
