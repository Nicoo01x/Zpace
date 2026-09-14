import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TerminalTab } from '@/types/workspace';
import { uid } from '@/lib/id';

export interface TerminalsState {
  tabs: TerminalTab[];
  activeTabId: string | null;
  createTab: (input: { shellId: string; cwd: string; title?: string; program?: TerminalTab['program']; projectId?: string }) => TerminalTab;
  closeTab: (id: string) => void;
  renameTab: (id: string, title: string) => void;
  setActive: (id: string) => void;
  setPty: (id: string, ptyId: string | undefined) => void;
  hydrate: (tabs: TerminalTab[]) => void;
}

/**
 * Terminals are first-class workspace items: they live in the sidebar, open in
 * panes, and are restored on launch (a new PTY is spawned for each tab).
 */
/** Hydration from SQLite replaces what came from localStorage, but keeps what this launch created before the database answered. */
const BOOT_AT = Date.now();
export const useTerminals = create<TerminalsState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,
      createTab: ({ shellId, cwd, title, program, projectId }) => {
        const tab: TerminalTab = {
          id: uid('term'),
          title: title ?? program?.label ?? shellId,
          shellId,
          cwd,
          program,
          projectId,
          createdAt: Date.now(),
        };
        set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
        return tab;
      },
      closeTab: (id) =>
        set((s) => {
          const tabs = s.tabs.filter((t) => t.id !== id);
          const activeTabId = s.activeTabId === id ? (tabs[tabs.length - 1]?.id ?? null) : s.activeTabId;
          return { tabs, activeTabId };
        }),
      renameTab: (id, title) => set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, title } : t)) })),
      setActive: (id) => set({ activeTabId: id }),
      setPty: (id, ptyId) => {
        if (!get().tabs.some((t) => t.id === id)) return;
        set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, ptyId } : t)) }));
      },
      hydrate: (tabs) =>
        set((s) => {
          const live = s.tabs.filter((t) => !tabs.some((q) => q.id === t.id) && t.createdAt >= BOOT_AT);
          const all = [...tabs, ...live];
          return { tabs: all, activeTabId: s.activeTabId ?? all[all.length - 1]?.id ?? null };
        }),
    }),
    {
      name: 'conduit.terminals',
      version: 1,
      // PTY ids are process handles and never survive a restart.
      partialize: (s) => ({ tabs: s.tabs.map(({ ptyId: _ptyId, ...t }) => t), activeTabId: s.activeTabId }),
    },
  ),
);
