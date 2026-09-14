import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GitSummary, Project, ProjectRuntime, RecentProject } from '@/types/workspace';
import { uid } from '@/lib/id';
import { basename } from '@/lib/format';

export interface ProjectsState {
  projects: Project[];
  recents: RecentProject[];

  addProject: (input: { path: string; name?: string; runtime?: ProjectRuntime; wslDistro?: string }) => Project;
  removeProject: (id: string) => void;
  /** Drop a path from the recent list (the entrance stops offering it). */
  forgetRecent: (path: string) => void;
  renameProject: (id: string, name: string) => void;
  setColor: (id: string, color?: string) => void;
  reorderProjects: (from: number, to: number) => void;
  toggleExpanded: (id: string, value?: boolean) => void;
  setGit: (id: string, git: GitSummary | undefined) => void;
  touch: (id: string) => void;
  setRuntime: (id: string, runtime: ProjectRuntime, wslDistro?: string) => void;
  hydrate: (projects: Project[]) => void;
}

/** Hydration from SQLite replaces what came from localStorage, but keeps what this launch created before the database answered. */
const BOOT_AT = Date.now();
export const useProjects = create<ProjectsState>()(
  persist(
    (set, get) => ({
      projects: [],
      recents: [],

      addProject: ({ path, name, runtime = 'windows', wslDistro }) => {
        const existing = get().projects.find((p) => p.path.toLowerCase() === path.toLowerCase());
        if (existing) {
          get().touch(existing.id);
          return existing;
        }
        const project: Project = {
          id: uid('prj'),
          name: name ?? basename(path),
          path,
          runtime,
          wslDistro,
          lastOpenedAt: Date.now(),
          createdAt: Date.now(),
          expanded: true,
        };
        set((s) => ({
          projects: [...s.projects, project],
          recents: upsertRecent(s.recents, { name: project.name, path: project.path, lastOpenedAt: project.lastOpenedAt }),
        }));
        return project;
      },
      removeProject: (id) => set((s) => ({ projects: s.projects.filter((p) => p.id !== id) })),
      forgetRecent: (path) => set((s) => ({ recents: s.recents.filter((r) => r.path.toLowerCase() !== path.toLowerCase()) })),
      renameProject: (id, name) => set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, name } : p)) })),
      setColor: (id, color) => set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, color } : p)) })),
      reorderProjects: (from, to) =>
        set((s) => {
          const next = [...s.projects];
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved);
          return { projects: next };
        }),
      toggleExpanded: (id, value) =>
        set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, expanded: value ?? !p.expanded } : p)) })),
      setGit: (id, git) => set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, git } : p)) })),
      touch: (id) =>
        set((s) => {
          const p = s.projects.find((x) => x.id === id);
          if (!p) return {};
          const lastOpenedAt = Date.now();
          return {
            projects: s.projects.map((x) => (x.id === id ? { ...x, lastOpenedAt } : x)),
            recents: upsertRecent(s.recents, { name: p.name, path: p.path, lastOpenedAt, branch: p.git?.branch }),
          };
        }),
      setRuntime: (id, runtime, wslDistro) =>
        set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, runtime, wslDistro } : p)) })),
      hydrate: (projects) =>
        set((s) => {
          const live = s.projects.filter((p) => !projects.some((q) => q.id === p.id) && p.createdAt >= BOOT_AT);
          return { projects: [...projects.filter((p) => isAbsolutePath(p.path)), ...live] };
        }),
    }),
    {
      name: 'conduit.projects',
      version: 1,
      // A path that lost its separators (a test once wrote one through a mangling shell) can never be opened: drop it on the way in.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ProjectsState>;
        return { ...current, ...p, projects: (p.projects ?? []).filter((x) => isAbsolutePath(x.path)), recents: (p.recents ?? []).filter((x) => isAbsolutePath(x.path)) };
      },
    },
  ),
);

/** `C:\…`, `\\server\…` or `/…` — anything else is a path that was damaged in transit. */
export function isAbsolutePath(path: string): boolean {
  return /^(?:[a-zA-Z]:[\\/]|\\\\|\/)/.test(path);
}

function upsertRecent(list: RecentProject[], item: RecentProject): RecentProject[] {
  const rest = list.filter((r) => r.path.toLowerCase() !== item.path.toLowerCase());
  return [item, ...rest].slice(0, 12);
}

export const selectProject = (id: string | null | undefined) => (s: ProjectsState) =>
  id ? s.projects.find((p) => p.id === id) : undefined;
