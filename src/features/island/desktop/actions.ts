import { isTauri } from '@/native/bridge';
import { islandRevealMain } from '@/native/desktop';
import { EV, type IslandAction } from './protocol';

/**
 * What the island asks the main window to do. Every click that means
 * something in the app crosses here; the main window carries it out with
 * its stores (see `bridge.ts`).
 */
export async function act(action: IslandAction): Promise<void> {
  if (!isTauri) return;
  const { emitTo } = await import('@tauri-apps/api/event');
  await emitTo('main', EV.action, action);
}

/** Bring the app back, then do the thing. */
export async function reveal(action?: IslandAction): Promise<void> {
  await islandRevealMain().catch(() => void 0);
  if (action) await act(action);
}
