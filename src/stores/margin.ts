import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { durableStorage } from '@/lib/durable-storage';
import { uid } from '@/lib/id';
import { touchKey } from './touched';

/**
 * Margin notes: comments anchored to line ranges of a file, the way a
 * reviewer writes in the margin of a printout. A note can be asked of
 * Claude — the answer lands under it and stays with the file. Kept per file
 * path in the durable store; the editor paints a mark in the gutter of the
 * lines that carry notes.
 */
export interface MarginNote {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  /** The lines the note was written against (to show when the file has moved on). */
  excerpt: string;
  text: string;
  at: number;
  resolved?: boolean;
  /** Claude's answer, when asked; `pending` while it is being written. */
  answer?: string;
  pending?: boolean;
  /** The hidden session answering right now. */
  sessionId?: string;
}

interface MarginState {
  notes: Record<string, MarginNote[]>;
  add: (input: Omit<MarginNote, 'id' | 'at'>) => MarginNote;
  update: (path: string, id: string, patch: Partial<MarginNote>) => void;
  remove: (path: string, id: string) => void;
}

export const useMargin = create<MarginState>()(
  persist(
    (set) => ({
      notes: {},
      add: (input) => {
        const note: MarginNote = { ...input, id: uid('note'), at: Date.now() };
        const key = touchKey(input.path);
        set((s) => ({ notes: { ...s.notes, [key]: [...(s.notes[key] ?? []), note].sort((a, b) => a.startLine - b.startLine) } }));
        return note;
      },
      update: (path, id, patch) =>
        set((s) => {
          const key = touchKey(path);
          return { notes: { ...s.notes, [key]: (s.notes[key] ?? []).map((n) => (n.id === id ? { ...n, ...patch } : n)) } };
        }),
      remove: (path, id) =>
        set((s) => {
          const key = touchKey(path);
          return { notes: { ...s.notes, [key]: (s.notes[key] ?? []).filter((n) => n.id !== id) } };
        }),
    }),
    // Answers in flight never come back as such after a restart.
    { name: 'conduit.margin', version: 1, storage: durableStorage(), partialize: (s) => ({ notes: Object.fromEntries(Object.entries(s.notes).map(([k, v]) => [k, v.map((n) => ({ ...n, pending: false, sessionId: undefined }))])) }) as MarginState },
  ),
);

const NO_NOTES: MarginNote[] = [];
/** Stable for a path with no notes, so selectors built on it do not re-render forever. */
export const notesFor = (notes: MarginState['notes'], path: string): MarginNote[] => notes[touchKey(path)] ?? NO_NOTES;
