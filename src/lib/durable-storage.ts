import { createJSONStorage, type StateStorage } from 'zustand/middleware';
import { isTauri } from './platform';

/**
 * Persistence that outlives the WebView2 profile: a JSON file in the app data
 * folder through tauri-plugin-store (`zorynq-state.json`), one key per zustand
 * store. The first read of a key falls back to its localStorage twin and
 * copies it over, so nothing saved before this existed is lost. In the
 * browser preview it is plain localStorage.
 *
 * A key is never written before its first read has finished: zustand's
 * persist writes on every set, including sets that happen while the file
 * is still being read, and such a write would replace what is on disk
 * with the store's empty initial state.
 */
type StoreLike = { get<T>(key: string): Promise<T | null | undefined>; set(key: string, value: unknown): Promise<void>; delete(key: string): Promise<boolean>; save(): Promise<void> };

let opening: Promise<StoreLike> | null = null;
function file(): Promise<StoreLike> {
  opening ??= import('@tauri-apps/plugin-store').then(({ load }) => load('zorynq-state.json', { autoSave: 400 }) as Promise<StoreLike>);
  return opening;
}

const local = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* quota */
    }
  },
  remove: (k: string) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

const read = new Set<string>();

export const durable: StateStorage = {
  getItem: async (name) => {
    if (!isTauri) {
      read.add(name);
      return local.get(name);
    }
    try {
      const s = await file();
      const v = await s.get<string>(name);
      if (typeof v === 'string') return v;
      const old = local.get(name);
      if (old) {
        await s.set(name, old);
        return old;
      }
      return null;
    } catch {
      return local.get(name);
    } finally {
      read.add(name);
    }
  },
  setItem: async (name, value) => {
    if (!read.has(name)) return;
    // localStorage stays a mirror: a quick read at boot and a fallback if the file is unavailable.
    local.set(name, value);
    if (!isTauri) return;
    try {
      const s = await file();
      await s.set(name, value);
    } catch {
      /* file unavailable */
    }
  },
  removeItem: async (name) => {
    local.remove(name);
    if (!isTauri) return;
    try {
      const s = await file();
      await s.delete(name);
    } catch {
      /* ignore */
    }
  },
};

export const durableStorage = () => createJSONStorage(() => durable);

/** Writes the state file now (it normally saves 400 ms after a change) — before an update restarts the app. */
export async function flushDurable(): Promise<void> {
  if (!isTauri) return;
  try {
    await (await file()).save();
  } catch {
    /* file unavailable */
  }
}
