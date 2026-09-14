import { create } from 'zustand';
import { touchKey } from '@/stores/touched';

/**
 * Explorer state that outlives a row: per-folder listing versions (bumped
 * after a create / rename / delete so only that folder re-reads the disk),
 * the row being named (new file, new folder, rename) and the sort order.
 */
export type ExplorerSort = 'name' | 'type';

export interface Naming {
  mode: 'new-file' | 'new-dir' | 'rename';
  /** Folder the row belongs to (absolute). */
  dir: string;
  /** Existing node when renaming. */
  path?: string;
  initial: string;
}

interface ExplorerState {
  versions: Record<string, number>;
  naming: Naming | null;
  sort: ExplorerSort;
  /** Folders forced open (a folder a new file is being created in). */
  forceOpen: Record<string, number>;
  bump: (dir: string) => void;
  setNaming: (n: Naming | null) => void;
  setSort: (s: ExplorerSort) => void;
  open: (dir: string) => void;
}

export const useExplorer = create<ExplorerState>((set) => ({
  versions: {},
  naming: null,
  sort: (typeof localStorage !== 'undefined' && (localStorage.getItem('conduit.explorer.sort') as ExplorerSort)) || 'name',
  forceOpen: {},
  bump: (dir) => set((s) => ({ versions: { ...s.versions, [touchKey(dir)]: (s.versions[touchKey(dir)] ?? 0) + 1 } })),
  setNaming: (naming) => set({ naming }),
  setSort: (sort) => {
    try {
      localStorage.setItem('conduit.explorer.sort', sort);
    } catch {
      /* ignore */
    }
    set({ sort });
  },
  open: (dir) => set((s) => ({ forceOpen: { ...s.forceOpen, [touchKey(dir)]: (s.forceOpen[touchKey(dir)] ?? 0) + 1 } })),
}));

/** Folders first, then by name — or by extension then name when sorting by type. */
export function sortNodes<T extends { name: string; isDir: boolean }>(nodes: T[], sort: ExplorerSort): T[] {
  const ext = (n: string) => {
    const i = n.lastIndexOf('.');
    return i > 0 ? n.slice(i + 1).toLowerCase() : '';
  };
  return [...nodes].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    if (sort === 'type' && !a.isDir) {
      const d = ext(a.name).localeCompare(ext(b.name));
      if (d !== 0) return d;
    }
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });
}
