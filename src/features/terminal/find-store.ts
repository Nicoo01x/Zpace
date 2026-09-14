import { create } from 'zustand';

/**
 * Find-in-terminal state. One bar is open at a time (per the focused
 * terminal); the query is kept so reopening resumes where you left off.
 */
interface TerminalFindState {
  openFor: string | null;
  query: string;
  caseSensitive: boolean;
  regex: boolean;
  open: (terminalId: string, query?: string) => void;
  close: () => void;
  setQuery: (q: string) => void;
  toggleCase: () => void;
  toggleRegex: () => void;
}

export const useTerminalFind = create<TerminalFindState>((set) => ({
  openFor: null,
  query: '',
  caseSensitive: false,
  regex: false,
  open: (terminalId, query) => set((s) => ({ openFor: terminalId, query: query ?? s.query })),
  close: () => set({ openFor: null }),
  setQuery: (query) => set({ query }),
  toggleCase: () => set((s) => ({ caseSensitive: !s.caseSensitive })),
  toggleRegex: () => set((s) => ({ regex: !s.regex })),
}));
