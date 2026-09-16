import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { durableStorage } from '@/lib/durable-storage';
import type { PluginFloatSpec } from '@/features/plugins/manifest';

/**
 * Floating plugin windows: a plugin pane declared with `float` opens over the
 * workspace instead of in a tile — a device preview, a timer, anything that
 * should stay in view while the tiles change. This keeps where each one is,
 * how big, and its place in the stack, across launches, so a phone that was
 * open comes back where it was.
 */
export interface FloatWindow {
  pluginId: string;
  paneId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  /** Stack order — higher is in front. */
  z: number;
}

export interface FloatGeometry {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

interface FloatsState {
  floats: Record<string, FloatWindow>;
  nextZ: number;
  /** Bumped when a float finished moving on its own (an entrance animation): whatever follows it re-places itself. Not persisted. */
  settled: number;
  nudge: () => void;
  /** Open (or bring to the front) the pane's float; a first open takes the spec's size and lands top-right. */
  open: (pluginId: string, paneId: string, spec: PluginFloatSpec) => void;
  close: (key: string) => void;
  /** Close every float of a plugin (it was switched off or removed). */
  closePlugin: (pluginId: string) => void;
  raise: (key: string) => void;
  /** Move / resize, kept inside the app window and above the minimum size. */
  set: (key: string, geometry: FloatGeometry) => void;
  /** After the app window changed size: nothing stays out of reach. */
  clampAll: () => void;
}

export const floatKey = (pluginId: string, paneId: string) => `${pluginId}/${paneId}`;

/** The area floats live in, and what their coordinates are relative to: the app window below the title bar. */
function arena() {
  const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--titlebar-height')) || 34;
  return { width: window.innerWidth, height: window.innerHeight - bar };
}

/** A float stays reachable: its top edge inside the window, at least 80px of it visible horizontally. */
function clamp(f: FloatWindow, a = arena()): FloatWindow {
  const width = Math.max(f.minWidth, Math.min(f.width, a.width));
  const height = Math.max(f.minHeight, Math.min(f.height, a.height));
  const x = Math.min(Math.max(f.x, 80 - width), a.width - 80);
  const y = Math.min(Math.max(f.y, 0), Math.max(0, a.height - 60));
  if (width === f.width && height === f.height && x === f.x && y === f.y) return f;
  return { ...f, x, y, width, height };
}

export const useFloats = create<FloatsState>()(
  persist(
    (set, get) => ({
      floats: {},
      nextZ: 1,
      settled: 0,
      nudge: () => set((s) => ({ settled: s.settled + 1 })),
      open: (pluginId, paneId, spec) => {
        const key = floatKey(pluginId, paneId);
        const cur = get().floats[key];
        const z = get().nextZ;
        if (cur) {
          set((s) => ({ floats: { ...s.floats, [key]: clamp({ ...cur, minWidth: spec.minWidth ?? 200, minHeight: spec.minHeight ?? 120, z }) }, nextZ: z + 1 }));
          return;
        }
        const a = arena();
        const width = Math.min(spec.width, a.width - 48);
        const height = Math.min(spec.height, a.height - 48);
        const f: FloatWindow = { pluginId, paneId, x: Math.max(24, a.width - width - 32), y: 24, width, height, minWidth: spec.minWidth ?? 200, minHeight: spec.minHeight ?? 120, z };
        set((s) => ({ floats: { ...s.floats, [key]: clamp(f, a) }, nextZ: z + 1 }));
      },
      close: (key) =>
        set((s) => {
          if (!s.floats[key]) return s;
          const floats = { ...s.floats };
          delete floats[key];
          return { floats };
        }),
      closePlugin: (pluginId) =>
        set((s) => {
          const floats = Object.fromEntries(Object.entries(s.floats).filter(([, f]) => f.pluginId !== pluginId));
          return Object.keys(floats).length === Object.keys(s.floats).length ? s : { floats };
        }),
      raise: (key) =>
        set((s) => {
          const f = s.floats[key];
          if (!f || f.z === s.nextZ - 1) return s;
          return { floats: { ...s.floats, [key]: { ...f, z: s.nextZ } }, nextZ: s.nextZ + 1 };
        }),
      set: (key, g) =>
        set((s) => {
          const f = s.floats[key];
          if (!f) return s;
          const next = clamp({ ...f, x: g.x ?? f.x, y: g.y ?? f.y, width: g.width ?? f.width, height: g.height ?? f.height });
          return next === f ? s : { floats: { ...s.floats, [key]: next } };
        }),
      clampAll: () =>
        set((s) => {
          const a = arena();
          let changed = false;
          const floats: Record<string, FloatWindow> = {};
          for (const [k, f] of Object.entries(s.floats)) {
            const c = clamp(f, a);
            if (c !== f) changed = true;
            floats[k] = c;
          }
          return changed ? { floats } : s;
        }),
    }),
    {
      name: 'conduit.floats',
      version: 1,
      storage: durableStorage(),
      partialize: (s) => ({ floats: s.floats, nextZ: s.nextZ }) as FloatsState,
    },
  ),
);
