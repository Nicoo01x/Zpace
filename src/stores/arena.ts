import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { durableStorage } from '@/lib/durable-storage';
import type { ChangedFile } from '@/native/git';

/**
 * Arenas: the same task handed to several agents at once, each in a git
 * worktree of its own, so the results can be compared and one kept. An
 * arena remembers its prompt, the base commit every variant started from
 * and, per variant, the session, the branch and the checkout — the live
 * state (working, waiting, done) is the session's; `chosen` and `discarded`
 * are the verdicts.
 */
export type VariantVerdict = 'open' | 'chosen' | 'discarded';

export interface ArenaVariant {
  id: string;
  /** 1-based, the "V2" in the UI. */
  n: number;
  sessionId: string;
  branch: string;
  /** The worktree folder (gone once the variant is discarded or merged). */
  dir: string;
  model: string;
  /** The preset id, or 'custom'. */
  angle: string;
  /** The instruction the angle turned into (shown on the card). */
  angleLabel: string;
  verdict: VariantVerdict;
  /** What the variant changed, frozen when it was chosen (its worktree is gone by then). */
  landed?: ChangedFile[];
}

export interface Arena {
  id: string;
  projectId: string;
  title: string;
  prompt: string;
  /** The commit every variant branched from, and the branch that was checked out then. */
  base: string;
  baseBranch: string;
  createdAt: number;
  variants: ArenaVariant[];
  /** Set when a variant was merged into the project. */
  mergedAt?: number;
  /** The project sub-folder this arena is listed in. */
  folderId?: string;
}

interface ArenaState {
  arenas: Record<string, Arena>;
  add: (arena: Arena) => void;
  update: (id: string, patch: Partial<Arena>) => void;
  setVerdict: (id: string, variantId: string, verdict: VariantVerdict) => void;
  patchVariant: (id: string, variantId: string, patch: Partial<ArenaVariant>) => void;
  remove: (id: string) => void;
}

export const useArena = create<ArenaState>()(
  persist(
    (set) => ({
      arenas: {},
      add: (arena) => set((s) => ({ arenas: { ...s.arenas, [arena.id]: arena } })),
      update: (id, patch) =>
        set((s) => {
          const cur = s.arenas[id];
          return cur ? { arenas: { ...s.arenas, [id]: { ...cur, ...patch } } } : {};
        }),
      setVerdict: (id, variantId, verdict) =>
        set((s) => {
          const cur = s.arenas[id];
          if (!cur) return {};
          return { arenas: { ...s.arenas, [id]: { ...cur, variants: cur.variants.map((v) => (v.id === variantId ? { ...v, verdict } : v)) } } };
        }),
      patchVariant: (id, variantId, patch) =>
        set((s) => {
          const cur = s.arenas[id];
          if (!cur) return {};
          return { arenas: { ...s.arenas, [id]: { ...cur, variants: cur.variants.map((v) => (v.id === variantId ? { ...v, ...patch } : v)) } } };
        }),
      remove: (id) =>
        set((s) => {
          const arenas = { ...s.arenas };
          delete arenas[id];
          return { arenas };
        }),
    }),
    { name: 'conduit.arena', version: 1, storage: durableStorage() },
  ),
);

const NONE: Arena[] = [];
/** Newest first, for one project. Stable when empty. */
export function arenasFor(arenas: Record<string, Arena>, projectId: string): Arena[] {
  const list = Object.values(arenas).filter((a) => a.projectId === projectId);
  return list.length ? list.sort((a, b) => b.createdAt - a.createdAt) : NONE;
}
