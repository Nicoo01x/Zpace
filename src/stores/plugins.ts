import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { durableStorage } from '@/lib/durable-storage';
import type { PluginManifest, RegistryIndex } from '@/features/plugins/manifest';

/**
 * Installed plugins and the registry's last answer. The files live under
 * `<appData>/plugins/<id>/`; this store keeps the manifest that was
 * installed (so contributions work offline), whether it is on, what it
 * created in other stores (agents, automations) so uninstall can take
 * them back, and a small key–value bag per plugin for scripts.
 */
export interface InstalledPlugin {
  id: string;
  version: string;
  manifest: PluginManifest;
  dir: string;
  enabled: boolean;
  installedAt: number;
  /** Ids created in other stores on install. */
  created: { agents: string[]; automations: string[]; skills: string[] };
  /** Last activation error of the script, if any. */
  error?: string;
}

interface PluginsState {
  installed: Record<string, InstalledPlugin>;
  storage: Record<string, Record<string, unknown>>;
  index: RegistryIndex | null;
  fetchedAt: number;
  indexError: string | null;
  busy: Record<string, 'installing' | 'removing'>;
  /** Bumped by the runtime when contributions change (not persisted). */
  revision: number;
  bumpRevision: () => void;
  setIndex: (index: RegistryIndex | null, error?: string | null) => void;
  setBusy: (id: string, state: 'installing' | 'removing' | null) => void;
  put: (p: InstalledPlugin) => void;
  drop: (id: string) => void;
  setEnabled: (id: string, enabled: boolean) => void;
  setError: (id: string, error: string | undefined) => void;
  setValue: (id: string, key: string, value: unknown) => void;
}

export const usePlugins = create<PluginsState>()(
  persist(
    (set) => ({
      installed: {},
      storage: {},
      index: null,
      fetchedAt: 0,
      indexError: null,
      busy: {},
      revision: 0,
      bumpRevision: () => set((s) => ({ revision: s.revision + 1 })),
      setIndex: (index, error = null) => set({ index: index ?? undefined, fetchedAt: index ? Date.now() : 0, indexError: error } as Partial<PluginsState>),
      setBusy: (id, state) =>
        set((s) => {
          const busy = { ...s.busy };
          if (state) busy[id] = state;
          else delete busy[id];
          return { busy };
        }),
      put: (p) => set((s) => ({ installed: { ...s.installed, [p.id]: p } })),
      drop: (id) =>
        set((s) => {
          const installed = { ...s.installed };
          delete installed[id];
          const storage = { ...s.storage };
          delete storage[id];
          return { installed, storage };
        }),
      setEnabled: (id, enabled) => set((s) => (s.installed[id] ? { installed: { ...s.installed, [id]: { ...s.installed[id], enabled, error: undefined } } } : s)),
      setError: (id, error) => set((s) => (s.installed[id] ? { installed: { ...s.installed, [id]: { ...s.installed[id], error } } } : s)),
      setValue: (id, key, value) => set((s) => ({ storage: { ...s.storage, [id]: { ...(s.storage[id] ?? {}), [key]: value } } })),
    }),
    {
      name: 'conduit.plugins',
      version: 1,
      storage: durableStorage(),
      partialize: (s) => ({ installed: s.installed, storage: s.storage, index: s.index, fetchedAt: s.fetchedAt }) as PluginsState,
    },
  ),
);

/** Enabled plugins, for the parts of the app that read contributions. */
export const enabledPlugins = (): InstalledPlugin[] => Object.values(usePlugins.getState().installed).filter((p) => p.enabled);
