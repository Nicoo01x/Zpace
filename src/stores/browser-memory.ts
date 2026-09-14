import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * What each project was last browsing: the URL of its browser pane, kept
 * across restarts so "open the browser here" returns to it, and the sidebar
 * can list it under the project.
 */
interface BrowserMemoryState {
  byProject: Record<string, { url: string; title?: string; at: number }>;
  remember: (projectId: string, url: string, title?: string) => void;
  forget: (projectId: string) => void;
}

export const useBrowserMemory = create<BrowserMemoryState>()(
  persist(
    (set) => ({
      byProject: {},
      remember: (projectId, url, title) =>
        set((s) => {
          if (!url || url === 'about:blank') return {};
          const prev = s.byProject[projectId];
          return { byProject: { ...s.byProject, [projectId]: { url, title: title ?? (prev?.url === url ? prev.title : undefined), at: Date.now() } } };
        }),
      forget: (projectId) =>
        set((s) => {
          const byProject = { ...s.byProject };
          delete byProject[projectId];
          return { byProject };
        }),
    }),
    { name: 'conduit.browser-memory', version: 1 },
  ),
);
