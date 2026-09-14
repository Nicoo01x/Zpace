import { create } from 'zustand';

/**
 * The code selected in a file pane right now, offered to the chat beside it
 * as a chip (`@path#L12-30`) that travels with the next message — the way
 * the IDE extension carries "selected lines" into Claude Code. One at a
 * time: the last pane with a non-empty selection wins; clearing the
 * selection (or closing the file) drops it.
 */
export interface CodeSelection {
  path: string;
  /** Path relative to the project root, for the mention. */
  rel: string;
  projectId?: string;
  startLine: number;
  endLine: number;
  code: string;
  language: string;
}

interface SelectionState {
  current: CodeSelection | null;
  set: (sel: CodeSelection) => void;
  clear: (path?: string) => void;
}

export const useSelectionContext = create<SelectionState>((set) => ({
  current: null,
  set: (sel) => set({ current: sel }),
  clear: (path) =>
    set((s) => {
      if (!s.current) return {};
      if (path && s.current.path.toLowerCase() !== path.toLowerCase()) return {};
      return { current: null };
    }),
}));

/** The mention Claude Code understands: `@path#L12-30` (one line: `@path#L12`). */
export function selectionMention(sel: CodeSelection): string {
  return `@${sel.rel}#L${sel.startLine}${sel.endLine !== sel.startLine ? `-${sel.endLine}` : ''}`;
}
